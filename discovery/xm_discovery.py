"""
SwarmCam – XM/Sofia protocol IP camera discovery

Discovers IP cameras using the XM (XMeye/Sofia) protocol (port 34567),
common in Chinese-manufactured WiFi cameras (XMEye, V380, CamHi, etc.).
No manufacturer app required.

Protocol reference: reverse-engineered XM DVRip protocol (same as dvrip library).

Usage:
    python xm_discovery.py
    python xm_discovery.py --subnet 192.168.0.0/24
    python xm_discovery.py --update-frigate
"""

import argparse
import hashlib
import ipaddress
import json
import socket
import struct
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

import yaml

# ── Constants ──────────────────────────────────────────────────────────────────

XM_PORT      = 34567
SCAN_TIMEOUT = 1.0   # TCP connect timeout per host (seconds)
XM_TIMEOUT   = 5.0   # protocol operation timeout (seconds)
MAX_WORKERS  = 64
PROBE_RETRIES = 2
RETRY_DELAY  = 0.5

# Common factory-default passwords for XM cameras
DEFAULT_PASSWORDS = ["", "admin", "123456", "888888", "12345"]

FRIGATE_CONFIG_PATH = Path(__file__).parent.parent / "docker" / "frigate" / "config.yml"

# XM packet header: 0xFF, 0x00, pad, pad, session(4), seq(4), pad, pad, msgid(2), datalen(4)
_PACK = struct.Struct("BB2xII2xHI")

_MSG_LOGIN   = 1000
_MSG_SYSINFO = 1020

# Sofia hash character table (same as dvrip library)
_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


# ── Protocol helpers ───────────────────────────────────────────────────────────

def _sofia_hash(password: str) -> str:
    """XM-style password hash used in the login packet."""
    md5 = hashlib.md5(password.encode()).digest()
    return "".join(_CHARS[sum(pair) % 62] for pair in zip(md5[::2], md5[1::2]))


def _build_pkt(session: int, seq: int, msg_id: int, payload: dict) -> bytes:
    data = json.dumps(payload, ensure_ascii=False).encode() + b"\x0a\x00"
    return _PACK.pack(0xFF, 0x00, session, seq, msg_id, len(data)) + data


def _recv_exact(sock: socket.socket, n: int) -> bytes | None:
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            return None
        buf += chunk
    return buf


def _xm_call(sock: socket.socket, session: int, seq: int, msg_id: int, payload: dict) -> dict | None:
    try:
        sock.sendall(_build_pkt(session, seq, msg_id, payload))
        hdr = _recv_exact(sock, 20)
        if not hdr:
            return None
        _, _, _, _, _, data_len = _PACK.unpack(hdr)
        raw = _recv_exact(sock, data_len)
        if raw is None:
            return None
        # Strip the \x0a\x00 JSON terminator before parsing
        return json.loads(raw[:-2] if len(raw) >= 2 else raw)
    except Exception:
        return None


# ── Data model ─────────────────────────────────────────────────────────────────

@dataclass
class XMCamera:
    ip: str
    port: int
    name: str
    rtsp_url: str
    http_url: str
    model: str | None
    firmware: str | None
    serial: str | None
    camera_type: str = "xm"
    # IP Webcam compatibility fields — None for XM cameras
    battery_level: None = None
    battery_charging: None = None
    battery_temp_c: None = None
    battery_voltage: None = None
    free_space_gb: None = None
    resolution: None = None
    orientation: None = None
    video_connections: int = 0
    night_vision: None = None
    quality: None = None
    discovered_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_frigate_camera(self, config: dict | None = None) -> dict:
        detect_fps = 5
        detect_w, detect_h = 1280, 720
        rtsp_args = "-rtsp_transport tcp -fflags +genpts+discardcorrupt -avoid_negative_ts make_zero"

        if config:
            sample = next(iter((config.get("cameras") or {}).values()), None)
            if sample:
                d = sample.get("detect", {})
                detect_fps = d.get("fps", detect_fps)
                detect_w   = d.get("width", detect_w)
                detect_h   = d.get("height", detect_h)
                for inp in sample.get("ffmpeg", {}).get("inputs", []):
                    rtsp_args = inp.get("input_args", rtsp_args)

        return {
            "ffmpeg": {
                "inputs": [{
                    "path": self.rtsp_url,
                    "input_args": rtsp_args,
                    "roles": ["detect", "record"],
                }]
            },
            "detect": {
                "enabled": True,
                "width": detect_w,
                "height": detect_h,
                "fps": detect_fps,
            },
        }


# ── XM probe ───────────────────────────────────────────────────────────────────

def _probe_xm(ip: str) -> XMCamera | None:
    """
    Try to connect to ip:34567, attempt login with common passwords,
    and collect system info. Returns XMCamera on success.
    """
    # Quick port check before full probe
    try:
        with socket.socket() as s:
            s.settimeout(SCAN_TIMEOUT)
            if s.connect_ex((ip, XM_PORT)) != 0:
                return None
    except Exception:
        return None

    for attempt in range(PROBE_RETRIES):
        for password in DEFAULT_PASSWORDS:
            sock = socket.socket()
            sock.settimeout(XM_TIMEOUT)
            try:
                sock.connect((ip, XM_PORT))
                seq = 0

                resp = _xm_call(sock, 0, seq, _MSG_LOGIN, {
                    "EncryptType": "MD5",
                    "LoginType":   "DVRIP-Web",
                    "PassWord":    _sofia_hash(password),
                    "UserName":    "admin",
                })
                seq += 1

                # Ret 100=ok, 101=already online (still usable), 102=also ok for some fw
                if not resp or resp.get("Ret") not in (100, 101, 102):
                    continue

                session = int(resp.get("SessionID", "0x0"), 16)

                info = _xm_call(sock, session, seq, _MSG_SYSINFO, {
                    "Name":      "SystemInfo",
                    "SessionID": f"0x{session:08X}",
                })

                si = (info or {}).get("SystemInfo", {})
                model    = si.get("HardWareVersion") or si.get("DeviceType")
                firmware = si.get("SoftWareVersion")
                serial   = si.get("SerialNo")

                safe_ip = ip.replace(".", "_")
                rtsp_url = (
                    f"rtsp://admin:{password}@{ip}:554"
                    "/cam/realmonitor?channel=1&subtype=0"
                )

                return XMCamera(
                    ip=ip,
                    port=XM_PORT,
                    name=f"xm_{safe_ip}",
                    rtsp_url=rtsp_url,
                    http_url=f"http://{ip}",
                    model=model,
                    firmware=firmware,
                    serial=serial,
                )
            except Exception:
                pass
            finally:
                sock.close()

        if attempt < PROBE_RETRIES - 1:
            time.sleep(RETRY_DELAY)

    return None


# ── Scanner ────────────────────────────────────────────────────────────────────

def scan_network(subnet: str, workers: int = MAX_WORKERS) -> list[XMCamera]:
    hosts = list(ipaddress.IPv4Network(subnet, strict=False).hosts())
    cameras: list[XMCamera] = []
    print(f"[*] XM scan: {len(hosts)} hosts on {subnet} (port {XM_PORT})...", file=sys.stderr)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(_probe_xm, str(ip)): str(ip) for ip in hosts}
        for future in as_completed(futures):
            result = future.result()
            if result:
                cameras.append(result)
                print(
                    f"[+] XM camera: {result.ip}  model={result.model}  fw={result.firmware}",
                    file=sys.stderr,
                )

    return cameras


# ── Frigate config update ──────────────────────────────────────────────────────

def update_frigate_config(cameras: list[XMCamera], config_path: Path = FRIGATE_CONFIG_PATH) -> None:
    if not config_path.exists():
        print(f"[!] Frigate config not found: {config_path}", file=sys.stderr)
        return

    with open(config_path) as f:
        config = yaml.safe_load(f) or {}

    if not config.get("cameras"):
        config["cameras"] = {}

    for cam in cameras:
        config["cameras"][cam.name] = cam.to_frigate_camera(config)
        print(f"[*] Frigate config updated: {cam.name}", file=sys.stderr)

    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    print(f"[+] Written: {config_path}", file=sys.stderr)
    print("[!] Restart Frigate to apply.", file=sys.stderr)


# ── CLI ────────────────────────────────────────────────────────────────────────

def _local_subnet() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    return str(ipaddress.IPv4Network(f"{ip}/24", strict=False))


def main() -> None:
    global SCAN_TIMEOUT  # noqa: PLW0603
    parser = argparse.ArgumentParser(description="SwarmCam – XM camera discovery")
    parser.add_argument("--subnet",         default=None)
    parser.add_argument("--timeout",        type=float, default=SCAN_TIMEOUT)
    parser.add_argument("--update-frigate", action="store_true")
    parser.add_argument("--workers",        type=int,   default=MAX_WORKERS)
    args = parser.parse_args()

    SCAN_TIMEOUT = args.timeout

    subnet  = args.subnet or _local_subnet()
    cameras = scan_network(subnet, args.workers)

    if not cameras:
        print("[!] No XM cameras found.", file=sys.stderr)
        print("[]")
        return

    print(f"[+] Total: {len(cameras)}", file=sys.stderr)

    if args.update_frigate:
        update_frigate_config(cameras)

    print(json.dumps([asdict(c) for c in cameras], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
