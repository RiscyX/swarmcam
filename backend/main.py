import asyncio
import json
import re

import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import state
from routers import auth, cameras, config, discovery, events, faces, recordings, system, users
from services.frigate_config import read_yaml
from services.health import health_loop
from services.mqtt import mqtt_loop
from services.setup import ensure_default_user
from settings import FRIGATE_CONFIG

app = FastAPI(title="SwarmCam API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(cameras.router)
app.include_router(events.router)
app.include_router(recordings.router)
app.include_router(faces.router)
app.include_router(users.router)
app.include_router(discovery.router)
app.include_router(config.router)
app.include_router(system.router)


@app.websocket("/ws/cameras")
async def camera_ws(ws: WebSocket):
    await ws.accept()
    state._ws_clients.add(ws)
    if state._health_cache:
        await ws.send_text(json.dumps({"type": "status", "cameras": list(state._health_cache.values())}))
    try:
        while True:
            await asyncio.sleep(30)
            await ws.send_text('{"type":"ping"}')
    except Exception:
        pass
    finally:
        state._ws_clients.discard(ws)


@app.on_event("startup")
async def _startup():
    if FRIGATE_CONFIG.exists():
        try:
            cfg = read_yaml(FRIGATE_CONFIG)
            for name, cam in (cfg.get("cameras") or {}).items():
                for inp in cam.get("ffmpeg", {}).get("inputs", []):
                    m = re.match(r"rtsp://([^:]+):(\d+)/", inp.get("path", ""))
                    if m:
                        ip, port = m.group(1), int(m.group(2))
                        state._last_cameras.append({
                            "ip": ip, "port": port, "name": name,
                            "rtsp_url": inp["path"],
                            "http_url": f"http://{ip}:{port}",
                        })
                        break
        except Exception:
            pass
    asyncio.create_task(health_loop())
    asyncio.create_task(mqtt_loop())
    asyncio.create_task(ensure_default_user())
