"""
SwarmCam – automatic Android IP Camera discovery

Scans the local network, finds Android devices running
the Android IP Camera app (default port: 4444), and optionally updates
the Frigate configuration.

Usage:
    python discovery.py                        # scan + print JSON
    python discovery.py --update-frigate       # + Frigate config update
    python discovery.py --subnet 192.168.0.0/24
    python discovery.py --port 4444 --timeout 1.5
"""

import argparse
import ipaddress
import json
import re
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

import requests
import urllib3
import yaml

# The camera app serves HTTPS with a self-signed certificate by default;
# accepting it without verification is an intentional LAN-only decision.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

IPCAM_PORT = 4444
SCAN_TIMEOUT = 1.0          # socket connect timeout (s)
HTTP_TIMEOUT = 2.0          # requests timeout (s)
MAX_WORKERS = 128
PROBE_RETRIES = 2           # HTTP fingerprint retry count
RETRY_DELAY = 0.5           # delay between retries (s)
FRIGATE_CONFIG_PATH = Path(__file__).parent.parent / "docker" / "frigate" / "config.yml"


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

RAW_SUFFIX = "_raw"


def rotation_of(config: dict, name: str) -> int:
    """
    Forgatás a go2rtc source stringből (`ffmpeg:..#rotate=90..`), 0 ha nincs.
    A backend `services/frigate_config.py`-ja írja; ez a szkript standalone is
    fut, ezért nem importál onnan.
    """
    streams = (config.get("go2rtc") or {}).get("streams") or {}
    entry = streams.get(name)
    urls = [entry] if isinstance(entry, str) else (entry or [])
    for url in urls:
        m = re.search(r"#rotate=(\d+)", str(url))
        if m:
            return int(m.group(1))
    return 0


@dataclass
class Camera:
    ip: str
    port: int
    name: str
    stream_url: str
    http_url: str
    battery_level: int | None
    wifi_strength: int | None
    resolution: tuple[int, int] | None
    orientation: str | None
    discovered_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_frigate_camera(self, config: dict | None = None) -> dict:
        """
        As a Frigate config camera entry dict.
        The phone's H.264 stream is fed into go2rtc (written separately by
        update_frigate_config); Frigate consumes the go2rtc RTSP restream.
        If config is passed, it reads the existing detect settings and
        hwaccel args from it instead of hardcoding.
        """
        # Detect settings: from config, otherwise the phone's stream resolution.
        # Ha egyik sem ismert, a width/height kimarad és a Frigate olvassa ki a
        # streamből — tippelni rosszabb, mint nem írni semmit.
        detect_fps = 5
        size = self.resolution
        hwaccel_args = None
        rotation = rotation_of(config, self.name) if config else 0

        if config:
            # Read sample from existing camera entry, or from the first camera
            cams = config.get("cameras") or {}
            sample = cams.get(self.name) or next(iter(cams.values()), None)
            if sample:
                d = sample.get("detect", {})
                detect_fps = d.get("fps", detect_fps)
                if "width" in d and "height" in d:
                    size = (d["width"], d["height"])
                hwaccel_args = sample.get("ffmpeg", {}).get("hwaccel_args")
            # A detect méret a saját forgatásához igazodik (90/270 → álló kép);
            # a minta másik kameráé is lehet, ezért itt kell visszaigazítani.
            if size and (rotation in (90, 270)) != (size[1] > size[0]):
                size = (size[1], size[0])

        # A forgatott kamera go2rtc-ben újrakódolva jön, és a transzkód elveszti
        # az időbélyegeket; a detect ág `fps=N` szűrője emiatt nulla frame-et ad.
        # A generic preset `+genpts` és `-use_wallclock_as_timestamps 1` kapcsolói
        # pótolják — lásd `backend/services/frigate_config.py::apply_settings`.
        input_args = "preset-rtsp-generic" if rotation else "preset-rtsp-restream"

        detect: dict = {"enabled": True, "fps": detect_fps}
        if size:
            detect["width"], detect["height"] = size

        entry: dict = {
            "ffmpeg": {
                "inputs": [{
                    "path": f"rtsp://127.0.0.1:8554/{self.name}",
                    "input_args": input_args,
                    "roles": ["detect", "record"],
                }]
            },
            "detect": detect,
        }

        if hwaccel_args:
            entry["ffmpeg"]["hwaccel_args"] = hwaccel_args

        return entry


# ---------------------------------------------------------------------------
# Network helpers
# ---------------------------------------------------------------------------

def get_local_subnet() -> str:
    """Auto-detects the local subnet (e.g., '192.168.1.0/24')."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
    network = ipaddress.IPv4Network(f"{local_ip}/24", strict=False)
    return str(network)


def _port_open(ip: str, port: int, timeout: float) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        return s.connect_ex((ip, port)) == 0


# ---------------------------------------------------------------------------
# Android IP Camera fingerprinting
# ---------------------------------------------------------------------------

def _fetch_info(ip: str, port: int) -> dict | None:
    """
    Fetch the camera's /info.json.
    Returns None if the device is not an Android IP Camera.
    """
    try:
        resp = requests.get(
            f"https://{ip}:{port}/info.json",
            timeout=HTTP_TIMEOUT,
            verify=False,
        )
        if resp.status_code == 200:
            data = resp.json()
            # Android IP Camera always contains "cameras" and "settings"
            if "cameras" in data and "settings" in data:
                return data
    except Exception:
        pass
    return None


def _active_camera(info: dict) -> dict | None:
    """Returns the info.json cameras[] entry of the active sensor."""
    cams = info.get("cameras") or []
    if not cams:
        return None
    # settings.cameraId is usually a facing keyword ("front"/"back"), not an
    # element of cameras[].id ("0", "1", "1:3") — match both.
    active_id = (info.get("settings") or {}).get("cameraId")
    if active_id in ("front", "back"):
        return next((c for c in cams if c.get("facing") == active_id), cams[0])
    return next((c for c in cams if c.get("id") == active_id), cams[0])


def _parse_resolution(info: dict) -> tuple[int, int] | None:
    """
    A *stream* felbontása, vagy None ha a telefon nem mondja meg.

    Nincs fallback a `cameras[].sizes` legnagyobb elemére: az a szenzor
    legnagyobb fotómérete, soha nem a videóstreamé — `streamRes: auto`
    mellett egy 800x600-as streamre 3840x2160-at adna vissza. Ez a szám
    korábban a Frigate `detect` méretébe került, és a felskálázott
    mozgásdetektálás önmagában 290% CPU-t evett.
    """
    try:
        res_str = info["settings"]["streamRes"]     # e.g. "1280x720", "auto", "max"
        if "x" in res_str:
            w, h = res_str.split("x")
            return int(w), int(h)
    except Exception:
        pass
    return None


def _parse_orientation(info: dict) -> str | None:
    try:
        angle = int(_active_camera(info)["sensorOrientation"])
        return "portrait" if angle in (0, 180) else "landscape"
    except Exception:
        return None


def probe_ipcam(ip: str, port: int) -> Camera | None:
    """
    Checks if the ip:port runs the Android IP Camera app.
    If yes, returns a Camera object.
    """
    if not _port_open(ip, port, SCAN_TIMEOUT):
        return None

    info = None
    for attempt in range(PROBE_RETRIES):
        info = _fetch_info(ip, port)
        if info is not None:
            break
        if attempt < PROBE_RETRIES - 1:
            time.sleep(RETRY_DELAY)
    if info is None:
        return None

    settings = info.get("settings", {})
    safe_ip = ip.replace(".", "_")
    return Camera(
        ip=ip,
        port=port,
        name=f"cam_{safe_ip}",
        stream_url=f"https://{ip}:{port}/video/h264",
        http_url=f"https://{ip}:{port}",
        battery_level=int(info["batteryPercent"]) if "batteryPercent" in info else None,
        wifi_strength=int(info["wifiStrength"]) if "wifiStrength" in info else None,
        resolution=_parse_resolution(info),
        orientation=_parse_orientation(info),
    )


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

def scan_network(subnet: str, port: int, workers: int = MAX_WORKERS) -> list[Camera]:
    """Scans the subnet in parallel, returns the found cameras."""
    network = ipaddress.IPv4Network(subnet, strict=False)
    hosts = list(network.hosts())
    cameras: list[Camera] = []

    print(f"[*] Scanning {len(hosts)} hosts on {subnet} (port {port})...", file=sys.stderr)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(probe_ipcam, str(ip), port): str(ip) for ip in hosts}
        for future in as_completed(futures):
            result = future.result()
            if result:
                cameras.append(result)
                print(f"[+] Found: {result.ip}  battery={result.battery_level}%  "
                      f"res={result.resolution or 'auto'}  orient={result.orientation}", file=sys.stderr)

    return cameras


# ---------------------------------------------------------------------------
# Frigate config update
# ---------------------------------------------------------------------------

def update_frigate_config(cameras: list[Camera], config_path: Path = FRIGATE_CONFIG_PATH) -> None:
    """
    Loads the existing Frigate config.yml, updates the cameras section and the
    go2rtc streams section, then writes it back.
    Keeps existing camera entries, adds new ones.
    """
    if not config_path.exists():
        print(f"[!] Frigate config not found: {config_path}", file=sys.stderr)
        return

    with open(config_path) as f:
        config = yaml.safe_load(f) or {}

    if "cameras" not in config or config["cameras"] is None:
        config["cameras"] = {}

    go2rtc = config.get("go2rtc") or {}
    if "streams" not in go2rtc or go2rtc["streams"] is None:
        go2rtc["streams"] = {}

    for cam in cameras:
        # Ha a kamerán forgatás van, a cam.name streamet a go2rtc ffmpeg
        # transpose forrása foglalja — az URL ilyenkor a _raw streambe megy.
        raw = cam.name + RAW_SUFFIX
        go2rtc["streams"][raw if raw in go2rtc["streams"] else cam.name] = [cam.stream_url]
        config["cameras"][cam.name] = cam.to_frigate_camera(config)
        print(f"[*] Frigate config updated: {cam.name}", file=sys.stderr)

    config["go2rtc"] = go2rtc

    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    print(f"[+] Frigate config written: {config_path}", file=sys.stderr)
    print("[!] Restart Frigate to apply: docker compose restart frigate", file=sys.stderr)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="SwarmCam – Android IP Camera discovery"
    )
    parser.add_argument(
        "--subnet",
        default=None,
        help="Scan subnet (e.g. 192.168.1.0/24). Default: auto-detect.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=IPCAM_PORT,
        help=f"Android IP Camera port (default: {IPCAM_PORT})",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=SCAN_TIMEOUT,
        help=f"Socket timeout in seconds (default: {SCAN_TIMEOUT})",
    )
    parser.add_argument(
        "--update-frigate",
        action="store_true",
        help="Updates Frigate config.yml with the found cameras",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=MAX_WORKERS,
        help=f"Number of parallel threads (default: {MAX_WORKERS})",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    global SCAN_TIMEOUT
    SCAN_TIMEOUT = args.timeout

    subnet = args.subnet or get_local_subnet()
    cameras = scan_network(subnet, args.port, args.workers)

    if not cameras:
        print("[!] No Android IP Camera devices found.", file=sys.stderr)
        print("[]")
        return

    print(f"[+] Total found: {len(cameras)}", file=sys.stderr)

    if args.update_frigate:
        update_frigate_config(cameras)

    # JSON output to stdout (backend/pipeline can process it further)
    result = [asdict(cam) for cam in cameras]
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
