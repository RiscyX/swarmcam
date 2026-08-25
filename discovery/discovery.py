"""
SwarmCam – automatic IP Webcam camera discovery

Scans the local network, finds Android devices running
the IP Webcam APK (default port: 8080), and optionally updates
the Frigate configuration.

Usage:
    python discovery.py                        # scan + print JSON
    python discovery.py --update-frigate       # + Frigate config update
    python discovery.py --subnet 192.168.0.0/24
    python discovery.py --port 8080 --timeout 1.5
"""

import argparse
import ipaddress
import json
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

import requests
import yaml

IPCAM_PORT = 8080
SCAN_TIMEOUT = 1.0          # socket connect timeout (s)
HTTP_TIMEOUT = 2.0          # requests timeout (s)
MAX_WORKERS = 128
PROBE_RETRIES = 2           # HTTP fingerprint retry count
RETRY_DELAY = 0.5           # delay between retries (s)
FRIGATE_CONFIG_PATH = Path(__file__).parent.parent / "docker" / "frigate" / "config.yml"


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Camera:
    ip: str
    port: int
    name: str
    rtsp_url: str
    http_url: str
    battery_level: int | None
    battery_charging: bool | None
    battery_temp_c: float | None
    battery_voltage: float | None
    free_space_gb: float | None
    resolution: tuple[int, int] | None
    orientation: str | None
    video_connections: int
    night_vision: bool
    quality: int | None
    discovered_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_frigate_camera(self, config: dict | None = None) -> dict:
        """
        As a Frigate config camera entry dict.
        If config is passed, it reads the existing detect/ffmpeg settings from it
        (detection fps, resolution, hwaccel, rtsp transport) instead of hardcoding.
        """
        # Detect settings: from config, otherwise phone resolution, otherwise 1080p
        detect_fps = 5
        detect_w, detect_h = self.resolution or (1920, 1080)
        hwaccel_args = None
        rtsp_transport = "-rtsp_transport tcp -fflags +genpts+discardcorrupt -avoid_negative_ts make_zero"

        if config:
            # Read sample from existing camera entry, or from the first camera
            sample = next(iter((config.get("cameras") or {}).values()), None)
            if sample:
                d = sample.get("detect", {})
                detect_fps = d.get("fps", detect_fps)
                detect_w   = d.get("width", detect_w)
                detect_h   = d.get("height", detect_h)
                ffmpeg = sample.get("ffmpeg", {})
                hwaccel_args = ffmpeg.get("hwaccel_args")
                for inp in ffmpeg.get("inputs", []):
                    rtsp_transport = inp.get("input_args")

        entry: dict = {
            "ffmpeg": {
                "inputs": [{"path": self.rtsp_url, "roles": ["detect", "record"]}]
            },
            "detect": {
                "enabled": True,
                "width": detect_w,
                "height": detect_h,
                "fps": detect_fps,
            },
        }

        if hwaccel_args:
            entry["ffmpeg"]["hwaccel_args"] = hwaccel_args
        if rtsp_transport:
            entry["ffmpeg"]["inputs"][0]["input_args"] = rtsp_transport

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
# IP Webcam fingerprinting
# ---------------------------------------------------------------------------

def _fetch_status(ip: str, port: int) -> dict | None:
    """
    Fetch IP Webcam /status.json.
    Returns None if the device is not IP Webcam.
    """
    try:
        resp = requests.get(
            f"http://{ip}:{port}/status.json",
            timeout=HTTP_TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            # IP Webcam always contains "curvals" or "id" field
            if "curvals" in data or "id" in data:
                return data
    except Exception:
        pass
    return None


def _parse_resolution(status: dict) -> tuple[int, int] | None:
    try:
        res_str = status["curvals"]["video_size"]   # e.g. "1280x720"
        w, h = res_str.split("x")
        return int(w), int(h)
    except Exception:
        return None


def _parse_orientation(status: dict) -> str | None:
    try:
        val = status["curvals"].get("orientation", "")
        if val in ("portrait", "landscape"):
            return val
        angle = int(val)
        return "portrait" if angle in (0, 180) else "landscape"
    except Exception:
        return None


def _parse_battery(status: dict) -> tuple[int | None, bool | None, float | None, float | None]:
    try:
        info = status.get("deviceInfo", {})
        level    = int(info["batteryPercent"])
        charging = bool(info.get("batteryCharging", ""))   # empty string = not charging
        temp     = round(float(info.get("batteryTemperatureC", 0)), 1) or None
        voltage  = float(info.get("batteryVoltage", 0)) or None
        return level, charging, temp, voltage
    except Exception:
        return None, None, None, None


def _parse_free_space(status: dict) -> float | None:
    try:
        return round(int(status["deviceInfo"]["freeSpaceBytes"]) / 1024 ** 3, 1)
    except Exception:
        return None


def probe_ipcam(ip: str, port: int) -> Camera | None:
    """
    Checks if the ip:port is an IP Webcam.
    If yes, returns a Camera object.
    """
    if not _port_open(ip, port, SCAN_TIMEOUT):
        return None

    status = None
    for attempt in range(PROBE_RETRIES):
        status = _fetch_status(ip, port)
        if status is not None:
            break
        if attempt < PROBE_RETRIES - 1:
            time.sleep(RETRY_DELAY)
    if status is None:
        return None

    battery_level, battery_charging, battery_temp, battery_voltage = _parse_battery(status)
    resolution   = _parse_resolution(status)
    orientation  = _parse_orientation(status)
    free_space   = _parse_free_space(status)
    curvals      = status.get("curvals", {})

    safe_ip = ip.replace(".", "_")
    return Camera(
        ip=ip,
        port=port,
        name=f"cam_{safe_ip}",
        rtsp_url=f"rtsp://{ip}:{port}/h264_ulaw.sdp",
        http_url=f"http://{ip}:{port}",
        battery_level=battery_level,
        battery_charging=battery_charging,
        battery_temp_c=battery_temp,
        battery_voltage=battery_voltage,
        free_space_gb=free_space,
        resolution=resolution,
        orientation=orientation,
        video_connections=int(status.get("video_connections", 0)),
        night_vision=curvals.get("night_vision", "off") == "on",
        quality=int(curvals["quality"]) if "quality" in curvals else None,
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
                      f"res={result.resolution}  orient={result.orientation}", file=sys.stderr)

    return cameras


# ---------------------------------------------------------------------------
# Frigate config update
# ---------------------------------------------------------------------------

def update_frigate_config(cameras: list[Camera], config_path: Path = FRIGATE_CONFIG_PATH) -> None:
    """
    Loads the existing Frigate config.yml, updates the cameras section,
    then writes it back. Keeps existing camera entries, adds new ones.
    """
    if not config_path.exists():
        print(f"[!] Frigate config not found: {config_path}", file=sys.stderr)
        return

    with open(config_path) as f:
        config = yaml.safe_load(f) or {}

    if "cameras" not in config or config["cameras"] is None:
        config["cameras"] = {}

    for cam in cameras:
        config["cameras"][cam.name] = cam.to_frigate_camera(config)
        print(f"[*] Frigate config updated: {cam.name}", file=sys.stderr)

    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    print(f"[+] Frigate config written: {config_path}", file=sys.stderr)
    print("[!] Restart Frigate to apply: docker compose restart frigate", file=sys.stderr)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="SwarmCam – IP Webcam camera discovery"
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
        help=f"IP Webcam port (default: {IPCAM_PORT})",
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
        print("[!] No IP Webcam cameras found.", file=sys.stderr)
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
