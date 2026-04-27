"""
SwarmCam – automatikus IP Webcam kamera discovery

Scanneli a lokális hálózatot, megkeresi az IP Webcam APK-t futtató
Android eszközöket (default port: 8080), majd opcionálisan frissíti
a Frigate konfigurációt.

Használat:
    python discovery.py                        # scan + print JSON
    python discovery.py --update-frigate       # + Frigate config frissítés
    python discovery.py --subnet 192.168.0.0/24
    python discovery.py --port 8080 --timeout 1.5
"""

import argparse
import ipaddress
import json
import socket
import sys
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
FRIGATE_CONFIG_PATH = Path(__file__).parent.parent / "docker" / "frigate" / "config.yml"


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Camera:
    ip: str
    port: int
    name: str                       # egyedi név Frigate-nek (pl. "cam_192_168_1_5")
    rtsp_url: str
    http_url: str
    battery_level: int | None       # 0-100, None ha nem elérhető
    battery_charging: bool | None
    resolution: tuple[int, int] | None  # (width, height)
    orientation: str | None         # "portrait" | "landscape"
    discovered_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_frigate_camera(self) -> dict:
        """Frigate config camera entry dict-ként."""
        width, height = self.resolution or (1920, 1080)
        return {
            "ffmpeg": {
                "inputs": [
                    {
                        "path": self.rtsp_url,
                        "roles": ["detect", "record"],
                    }
                ]
            },
            "detect": {
                "enabled": True,
                "width": width,
                "height": height,
                "fps": 5,
            },
        }


# ---------------------------------------------------------------------------
# Network helpers
# ---------------------------------------------------------------------------

def get_local_subnet() -> str:
    """Auto-detektálja a lokális subnet-et (pl. '192.168.1.0/24')."""
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
    IP Webcam /status.json lekérése.
    Visszaad None-t ha az eszköz nem IP Webcam.
    """
    try:
        resp = requests.get(
            f"http://{ip}:{port}/status.json",
            timeout=HTTP_TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            # IP Webcam mindig tartalmaz "curvals" vagy "id" mezőt
            if "curvals" in data or "id" in data:
                return data
    except Exception:
        pass
    return None


def _parse_resolution(status: dict) -> tuple[int, int] | None:
    try:
        res_str = status["curvals"]["video_size"]   # pl. "1280x720"
        w, h = res_str.split("x")
        return int(w), int(h)
    except Exception:
        return None


def _parse_orientation(status: dict) -> str | None:
    try:
        angle = int(status["curvals"].get("orientation", "-1"))
        return "portrait" if angle in (0, 180) else "landscape"
    except Exception:
        return None


def _parse_battery(status: dict) -> tuple[int | None, bool | None]:
    try:
        level = int(status["curvals"]["battery_level"])
        charging = status["curvals"].get("battery_plugged", "false").lower() == "true"
        return level, charging
    except Exception:
        return None, None


def probe_ipcam(ip: str, port: int) -> Camera | None:
    """
    Ellenőrzi, hogy az ip:port IP Webcam-e.
    Ha igen, visszaad egy Camera objektumot.
    """
    if not _port_open(ip, port, SCAN_TIMEOUT):
        return None

    status = _fetch_status(ip, port)
    if status is None:
        return None

    battery_level, battery_charging = _parse_battery(status)
    resolution = _parse_resolution(status)
    orientation = _parse_orientation(status)

    safe_ip = ip.replace(".", "_")
    return Camera(
        ip=ip,
        port=port,
        name=f"cam_{safe_ip}",
        rtsp_url=f"rtsp://{ip}:{port}/h264_ulaw.sdp",
        http_url=f"http://{ip}:{port}",
        battery_level=battery_level,
        battery_charging=battery_charging,
        resolution=resolution,
        orientation=orientation,
    )


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

def scan_network(subnet: str, port: int, workers: int = MAX_WORKERS) -> list[Camera]:
    """Párhuzamosan végigscanneli a subnettet, visszaadja a talált kamerákat."""
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
    Betölti a meglévő Frigate config.yml-t, frissíti a cameras szekciót,
    majd visszaírja. Meglévő kamera entryket megtartja, újakat hozzáad.
    """
    if not config_path.exists():
        print(f"[!] Frigate config not found: {config_path}", file=sys.stderr)
        return

    with open(config_path) as f:
        config = yaml.safe_load(f) or {}

    if "cameras" not in config or config["cameras"] is None:
        config["cameras"] = {}

    for cam in cameras:
        config["cameras"][cam.name] = cam.to_frigate_camera()
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
        description="SwarmCam – IP Webcam kamera discovery"
    )
    parser.add_argument(
        "--subnet",
        default=None,
        help="Scan subnet (pl. 192.168.1.0/24). Default: auto-detect.",
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
        help=f"Socket timeout másodpercben (default: {SCAN_TIMEOUT})",
    )
    parser.add_argument(
        "--update-frigate",
        action="store_true",
        help="Frissíti a Frigate config.yml-t a talált kamerákkal",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=MAX_WORKERS,
        help=f"Párhuzamos szálak száma (default: {MAX_WORKERS})",
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

    # JSON output stdout-ra (backend/pipeline tovább tudja feldolgozni)
    result = [asdict(cam) for cam in cameras]
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
