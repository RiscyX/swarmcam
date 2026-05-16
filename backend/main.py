import asyncio
import ipaddress
import json
import os
import socket
import sys
from pathlib import Path
from typing import Literal

import aiomqtt
import requests as http
import yaml
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

app = FastAPI(title="SwarmCam API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DISCOVERY_SCRIPT  = Path(__file__).parent.parent / "discovery" / "discovery.py"
FRIGATE_CONFIG    = Path(__file__).parent.parent / "docker" / "frigate" / "config.yml"
COMPOSE_FILE      = Path(__file__).parent.parent / "docker" / "docker-compose.yml"
MEDIA_DIR         = Path(__file__).parent.parent / "docker" / "media"
FRIGATE_URL       = os.getenv("FRIGATE_URL", "http://localhost:5000")
MQTT_HOST         = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT         = int(os.getenv("MQTT_PORT", "1883"))
COMPOSE_CMD       = ["docker", "compose", "-f", str(COMPOSE_FILE)]

security = HTTPBearer(auto_error=False)

_last_cameras: list[dict] = []
_ws_clients:   set[WebSocket] = set()
_health_cache: dict[str, dict] = {}  # ip -> latest status

HEALTH_INTERVAL = 5  # seconds


# ---------------------------------------------------------------------------
# Health polling loop
# ---------------------------------------------------------------------------

async def _poll_status(ip: str, port: int) -> dict | None:
    loop = asyncio.get_event_loop()
    try:
        resp = await loop.run_in_executor(
            None, lambda: http.get(f"http://{ip}:{port}/status.json", timeout=2.0)
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None


async def _health_loop():
    while True:
        if _last_cameras:
            updates = []
            for cam in _last_cameras:
                ip, port = cam["ip"], cam["port"]
                status = await _poll_status(ip, port)
                entry: dict = {"ip": ip, "name": cam["name"]}
                if status:
                    info    = status.get("deviceInfo", {})
                    curvals = status.get("curvals", {})
                    entry.update({
                        "online":            True,
                        "battery_level":     int(info["batteryPercent"])        if "batteryPercent"      in info    else None,
                        "battery_charging":  bool(info.get("batteryCharging", "")),
                        "battery_temp_c":    float(info.get("batteryTemperatureC", 0)) or None,
                        "free_space_gb":     round(int(info["freeSpaceBytes"]) / 1024**3, 1) if "freeSpaceBytes" in info else None,
                        "video_connections": int(status.get("video_connections", 0)),
                        "night_vision":      curvals.get("night_vision", "off") == "on",
                        "quality":           int(curvals["quality"]) if "quality" in curvals else None,
                    })
                else:
                    entry["online"] = False
                _health_cache[ip] = entry
                updates.append(entry)

            if _ws_clients and updates:
                msg = json.dumps({"type": "status", "cameras": updates})
                dead: set[WebSocket] = set()
                for ws in list(_ws_clients):
                    try:
                        await ws.send_text(msg)
                    except Exception:
                        dead.add(ws)
                _ws_clients -= dead

        await asyncio.sleep(HEALTH_INTERVAL)


# ---------------------------------------------------------------------------
# MQTT – Frigate event listener
# ---------------------------------------------------------------------------

async def _broadcast(msg: str) -> None:
    dead: set[WebSocket] = set()
    for ws in list(_ws_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    _ws_clients -= dead


async def _mqtt_loop() -> None:
    while True:
        try:
            async with aiomqtt.Client(hostname=MQTT_HOST, port=MQTT_PORT) as client:
                print(f"[MQTT] Connected to {MQTT_HOST}:{MQTT_PORT}", file=sys.stderr)
                await client.subscribe("frigate/events")
                async for message in client.messages:
                    try:
                        payload = json.loads(message.payload)
                        after = payload.get("after", {})
                        event = json.dumps({
                            "type": "frigate_event",
                            "camera": after.get("camera"),
                            "label": after.get("label"),
                            "score": round(after.get("score") or 0.0, 2),
                            "id": after.get("id"),
                        })
                        await _broadcast(event)
                    except Exception:
                        pass
        except aiomqtt.MqttError as e:
            print(f"[MQTT] {e} – retry in 10s", file=sys.stderr)
            await asyncio.sleep(10)
        except Exception as e:
            print(f"[MQTT] Unexpected error: {e} – retry in 10s", file=sys.stderr)
            await asyncio.sleep(10)


@app.on_event("startup")
async def _startup():
    global _last_cameras
    # Frigate configból betöltjük a kamerákat, hogy reload után is pollozhassunk
    if FRIGATE_CONFIG.exists():
        try:
            cfg = _read_yaml(FRIGATE_CONFIG)
            for name, cam in (cfg.get("cameras") or {}).items():
                for inp in cam.get("ffmpeg", {}).get("inputs", []):
                    path = inp.get("path", "")
                    # rtsp://ip:port/... → ip, port
                    import re as _re
                    m = _re.match(r"rtsp://([^:]+):(\d+)/", path)
                    if m:
                        ip, port = m.group(1), int(m.group(2))
                        _last_cameras.append({
                            "ip": ip, "port": port, "name": name,
                            "rtsp_url": path,
                            "http_url": f"http://{ip}:{port}",
                        })
                        break
        except Exception:
            pass
    asyncio.create_task(_health_loop())
    asyncio.create_task(_mqtt_loop())


# ---------------------------------------------------------------------------
# WebSocket – health stream
# ---------------------------------------------------------------------------

@app.websocket("/ws/cameras")
async def camera_ws(ws: WebSocket):
    await ws.accept()
    _ws_clients.add(ws)
    if _health_cache:
        await ws.send_text(json.dumps({"type": "status", "cameras": list(_health_cache.values())}))
    try:
        while True:
            # ping 30mp-enként hogy a böngésző ne zárja le az idle kapcsolatot
            await asyncio.sleep(30)
            await ws.send_text('{"type":"ping"}')
    except Exception:
        pass
    finally:
        _ws_clients.discard(ws)


@app.get("/api/debug/health")
def debug_health():
    return {"cameras": _last_cameras, "cache": _health_cache, "ws_clients": len(_ws_clients)}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class DiscoverRequest(BaseModel):
    subnet: str | None = None
    port: int = 8080
    timeout: float = 1.0
    update_frigate: bool = False


class ConfigSettings(BaseModel):
    decoder: Literal["cpu", "nvidia", "intel", "coral"] = "cpu"
    detection_fps: int = 5
    detection_width: int = 1920
    detection_height: int = 1080
    rtsp_transport: Literal["tcp", "udp"] = "tcp"
    record_motion_days: int = 7
    record_event_days: int = 14
    objects: list[str] = ["person", "car", "cat", "dog"]


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _read_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f) or {}


def _write_yaml(path: Path, data: dict) -> None:
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def _extract_settings(config: dict) -> ConfigSettings:
    """Frigate config.yml → ConfigSettings."""
    # Decoder
    decoder = "cpu"
    for _, det in (config.get("detectors") or {}).items():
        t = det.get("type", "cpu")
        decoder = {"tensorrt": "nvidia", "edgetpu": "coral", "openvino": "intel"}.get(t, "cpu")
        break

    # Detection + transport from first camera
    detection_fps, detection_width, detection_height = 5, 1920, 1080
    rtsp_transport = "tcp"
    for cam in (config.get("cameras") or {}).values():
        d = cam.get("detect", {})
        detection_fps    = d.get("fps", detection_fps)
        detection_width  = d.get("width", detection_width)
        detection_height = d.get("height", detection_height)
        for inp in cam.get("ffmpeg", {}).get("inputs", []):
            args = str(inp.get("input_args", ""))
            rtsp_transport = "udp" if "udp" in args else "tcp"
        break

    # Record
    rec = config.get("record", {})
    record_motion_days = (rec.get("motion") or {}).get("days", 7)
    record_event_days  = (rec.get("detections") or {}).get("retain", {}).get("days", 14)

    return ConfigSettings(
        decoder=decoder,
        detection_fps=detection_fps,
        detection_width=detection_width,
        detection_height=detection_height,
        rtsp_transport=rtsp_transport,
        record_motion_days=record_motion_days,
        record_event_days=record_event_days,
        objects=(config.get("objects") or {}).get("track", ["person", "car", "cat", "dog"]),
    )


def _apply_settings(config: dict, s: ConfigSettings) -> dict:
    """ConfigSettings → frissített Frigate config dict."""
    # Detector
    detector_map = {
        "nvidia": {"cpu1": {"type": "cpu", "num_threads": 3}},  # AI: CPU, videó dekód: NVDEC
        "coral":  {"coral":    {"type": "edgetpu",  "device": "usb"}},
        "intel":  {"openvino": {"type": "openvino", "device": "GPU"}},
        "cpu":    {"cpu1":     {"type": "cpu", "num_threads": 3}},
    }
    config["detectors"] = detector_map[s.decoder]

    # Objects
    config["objects"] = {
        "track": s.objects,
        "filters": {"person": {"min_area": 2000, "min_score": 0.6, "threshold": 0.7}},
    }

    # Record
    config.setdefault("record", {})
    config["record"].setdefault("motion", {})["days"] = s.record_motion_days
    config["record"].setdefault("detections", {}).setdefault("retain", {})["days"] = s.record_event_days
    config["record"].setdefault("alerts",     {}).setdefault("retain", {})["days"] = s.record_event_days

    # Cameras – update minden meglévőt
    for cam in (config.get("cameras") or {}).values():
        cam["detect"] = {
            "enabled": True,
            "width": s.detection_width,
            "height": s.detection_height,
            "fps": s.detection_fps,
        }
        ffmpeg = cam.setdefault("ffmpeg", {})
        # hwaccel_args szándékosan nincs beállítva – preset-nvidia-h264 NVDEC-et próbál
        # használni ami a Frigate stable image-ben 0 frameet ad
        ffmpeg.pop("hwaccel_args", None)

        for inp in ffmpeg.get("inputs", []):
            # Csak a transport flag-et állítjuk, a többi input_args-t megtartjuk
            current = inp.get("input_args", "")
            # Eltávolítjuk a régi transport flag-et és újat teszünk
            import re
            cleaned = re.sub(r"-rtsp_transport\s+\S+", "", current).strip()
            transport = "-rtsp_transport tcp" if s.rtsp_transport == "tcp" else "-rtsp_transport udp"
            inp["input_args"] = f"{transport} {cleaned}".strip() if cleaned else transport

    return config


def _update_compose_nvidia(enable: bool) -> None:
    """Docker Compose frigate service-be írja/törli az nvidia runtime-ot."""
    compose = _read_yaml(COMPOSE_FILE)
    frigate_svc = compose["services"]["frigate"]
    env = frigate_svc.get("environment") or {}
    if isinstance(env, list):
        env = dict(e.split("=", 1) for e in env)

    if enable:
        frigate_svc["runtime"] = "nvidia"
        env.update({"NVIDIA_VISIBLE_DEVICES": "all", "NVIDIA_DRIVER_CAPABILITIES": "all"})
    else:
        frigate_svc.pop("runtime", None)
        env.pop("NVIDIA_VISIBLE_DEVICES", None)
        env.pop("NVIDIA_DRIVER_CAPABILITIES", None)

    frigate_svc["environment"] = env
    _write_yaml(COMPOSE_FILE, compose)


# ---------------------------------------------------------------------------
# Auth – Frigate proxy
# Frigate /api/login returns {"token": "..."} which can be used as Bearer token.
# Users must first set up a Frigate account via http://localhost:5000 (one-time).
# ---------------------------------------------------------------------------

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.get(
                f"{FRIGATE_URL}/api/profile",
                headers={"Authorization": f"Bearer {creds.credentials}"},
                timeout=3,
            ),
        )
        if r.status_code == 200:
            return r.json()
    except Exception:
        raise HTTPException(status_code=503, detail="Frigate unavailable")
    raise HTTPException(status_code=401, detail="Invalid or expired token")


@app.post("/api/auth/login")
async def login(request: Request):
    body = await request.json()
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.post(f"{FRIGATE_URL}/api/login", json=body, timeout=5),
        )
        return Response(content=r.content, status_code=r.status_code, media_type="application/json")
    except Exception:
        raise HTTPException(status_code=503, detail="Frigate unavailable")


@app.get("/api/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return user


# ---------------------------------------------------------------------------
# Camera snapshot proxy (no auth required – proxies Frigate latest.jpg)
# ---------------------------------------------------------------------------

# 1×1 transparent GIF – returned when Frigate/camera is unavailable so the
# browser gets a valid image and avoids ERR_BLOCKED_BY_ORB on cross-origin loads
_PLACEHOLDER_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00"
    b"!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01"
    b"\x00\x00\x02\x02D\x01\x00;"
)


@app.get("/api/cameras/{name}/snapshot")
async def camera_snapshot(name: str):
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.get(f"{FRIGATE_URL}/api/{name}/latest.jpg", timeout=3),
        )
        if r.status_code == 200:
            return Response(content=r.content, media_type="image/jpeg")
    except Exception:
        pass
    return Response(content=_PLACEHOLDER_GIF, media_type="image/gif", status_code=200)


# ---------------------------------------------------------------------------
# Network interfaces
# ---------------------------------------------------------------------------

@app.get("/api/networks")
def get_networks():
    """Visszaadja az elérhető hálózati interfészeket és subnetjeiket."""
    import netifaces
    results = []
    for iface in netifaces.interfaces():
        addrs = netifaces.ifaddresses(iface).get(netifaces.AF_INET, [])
        for addr in addrs:
            ip = addr.get("addr", "")
            netmask = addr.get("netmask", "255.255.255.0")
            if not ip or ip.startswith("127.") or ip.startswith("172."):
                continue
            try:
                network = ipaddress.IPv4Network(f"{ip}/{netmask}", strict=False)
                results.append({
                    "iface": iface,
                    "ip": ip,
                    "subnet": str(network),
                })
            except Exception:
                pass
    return results


# ---------------------------------------------------------------------------
# System info
# ---------------------------------------------------------------------------

@app.get("/api/system")
async def get_system():
    """Elérhető hardware gyorsítók detektálása."""
    # nvidia-smi futtatása konténer indítása nélkül
    async def _run(cmd: list[str]) -> bool:
        try:
            p = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await p.wait()
            return p.returncode == 0
        except Exception:
            return False

    nvidia_gpu = await _run(["nvidia-smi"])
    # Docker nvidia runtime elérhetőségét a compose fájlból olvassuk ki
    nvidia_docker = False
    if COMPOSE_FILE.exists():
        compose = _read_yaml(COMPOSE_FILE)
        nvidia_docker = compose.get("services", {}).get("frigate", {}).get("runtime") == "nvidia"

    return {
        "nvidia_gpu": nvidia_gpu,
        "nvidia_docker": nvidia_docker,
        "intel_gpu": Path("/dev/dri/renderD128").exists(),
    }


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

@app.get("/api/cameras")
def get_cameras():
    return _last_cameras


@app.delete("/api/cameras")
def clear_cameras():
    global _last_cameras
    _last_cameras = []
    return {"cleared": True}


@app.delete("/api/recordings")
async def clear_recordings():
    """Törli az összes felvételt és clipet (docker exec-en át, root jogosultsággal)."""
    freed = 0
    for subdir in ["recordings", "clips"]:
        path = MEDIA_DIR / subdir
        if path.exists():
            freed += sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    # A media mappa a Frigate containerben /media/frigate alatt van – ott töröljük
    proc = await asyncio.create_subprocess_exec(
        "docker", "exec", "frigate",
        "sh", "-c", "rm -rf /media/frigate/recordings/* /media/frigate/clips/*",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()
    return {"cleared_mb": round(freed / 1024 / 1024, 1)}


@app.post("/api/cameras/reset")
async def reset_cameras():
    """Törli az összes kamerát a Frigate configból, restartol, törli a memóriát."""
    global _last_cameras
    if FRIGATE_CONFIG.exists():
        config = _read_yaml(FRIGATE_CONFIG)
        config["cameras"] = {}
        _write_yaml(FRIGATE_CONFIG, config)
    _last_cameras = []
    try:
        http.post(f"{FRIGATE_URL}/api/restart", timeout=5)
    except Exception:
        pass
    return {"reset": True}


@app.post("/api/discover/stream")
async def discover_stream(req: DiscoverRequest):
    async def event_gen():
        global _last_cameras

        cmd = [sys.executable, str(DISCOVERY_SCRIPT)]
        if req.subnet:
            cmd += ["--subnet", req.subnet]
        cmd += ["--port", str(req.port), "--timeout", str(req.timeout)]
        if req.update_frigate:
            cmd.append("--update-frigate")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        async for line in proc.stderr:
            text = line.decode().strip()
            if text:
                yield f"event: progress\ndata: {json.dumps(text)}\n\n"

        stdout, _ = await proc.communicate()

        try:
            cameras = json.loads(stdout.decode())
        except Exception:
            cameras = []

        _last_cameras = cameras

        if req.update_frigate and cameras:
            try:
                http.post(f"{FRIGATE_URL}/api/restart", timeout=5)
                yield f"event: progress\ndata: {json.dumps('[*] Frigate újraindítása...')}\n\n"
            except Exception as e:
                yield f"event: progress\ndata: {json.dumps(f'[!] Frigate restart hiba: {e}')}\n\n"

        yield f"event: result\ndata: {json.dumps(cameras)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Config API
# ---------------------------------------------------------------------------

@app.get("/api/config", response_model=ConfigSettings)
def get_config():
    if not FRIGATE_CONFIG.exists():
        raise HTTPException(404, "Frigate config not found")
    return _extract_settings(_read_yaml(FRIGATE_CONFIG))


@app.post("/api/config")
async def save_config(settings: ConfigSettings):
    if not FRIGATE_CONFIG.exists():
        raise HTTPException(404, "Frigate config not found")

    loop = asyncio.get_event_loop()
    old = _extract_settings(_read_yaml(FRIGATE_CONFIG))
    decoder_changed = old.decoder != settings.decoder

    # 1. Frigate config.yml frissítése
    config = _read_yaml(FRIGATE_CONFIG)
    _write_yaml(FRIGATE_CONFIG, _apply_settings(config, settings))

    # 2. Ha decoder változott, docker-compose.yml-t is frissítjük
    if decoder_changed:
        _update_compose_nvidia(settings.decoder == "nvidia")

    # 3. Restart
    frigate_restarted = False
    if decoder_changed:
        # docker compose up -d kell, mert a runtime változás csak így veszi át
        proc = await asyncio.create_subprocess_exec(
            *COMPOSE_CMD, "up", "-d", "--force-recreate", "frigate",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        frigate_restarted = True
    else:
        try:
            r = await loop.run_in_executor(
                None, lambda: http.post(f"{FRIGATE_URL}/api/restart", timeout=5)
            )
            frigate_restarted = r.ok
        except Exception:
            pass

    return {"ok": True, "decoder_changed": decoder_changed, "frigate_restarted": frigate_restarted}
