import asyncio
import json
import sys

import requests as http
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import state
from settings import DISCOVERY_SCRIPT, FRIGATE_CONFIG, FRIGATE_URL, MEDIA_DIR

router = APIRouter()


class DiscoverRequest(BaseModel):
    subnet: str | None = None
    port: int = 8080
    timeout: float = 1.0
    update_frigate: bool = False


@router.delete("/api/cameras")
def clear_cameras():
    state._last_cameras.clear()
    return {"cleared": True}


@router.delete("/api/cameras/{name}")
async def delete_camera(name: str):
    if FRIGATE_CONFIG.exists():
        config = read_yaml(FRIGATE_CONFIG)
        cameras = config.get("cameras") or {}
        if name not in cameras:
            raise HTTPException(404, "Camera not found in Frigate config")
        del cameras[name]
        config["cameras"] = cameras
        write_yaml(FRIGATE_CONFIG, config)
    state._last_cameras[:] = [c for c in state._last_cameras if c.get("name") != name]
    try:
        http.post(f"{FRIGATE_URL}/api/restart", timeout=5)
    except Exception:
        pass
    return {"ok": True}


@router.delete("/api/recordings")
async def clear_recordings():
    freed = 0
    for subdir in ["recordings", "clips"]:
        path = MEDIA_DIR / subdir
        if path.exists():
            freed += sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    proc = await asyncio.create_subprocess_exec(
        "docker", "exec", "frigate",
        "sh", "-c", "rm -rf /media/frigate/recordings/* /media/frigate/clips/*",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()
    return {"cleared_mb": round(freed / 1024 / 1024, 1)}


@router.post("/api/cameras/reset")
async def reset_cameras():
    if FRIGATE_CONFIG.exists():
        config = read_yaml(FRIGATE_CONFIG)
        config["cameras"] = {}
        write_yaml(FRIGATE_CONFIG, config)
    state._last_cameras.clear()
    try:
        http.post(f"{FRIGATE_URL}/api/restart", timeout=5)
    except Exception:
        pass
    return {"reset": True}


@router.post("/api/discover/stream")
async def discover_stream(req: DiscoverRequest):
    async def event_gen():
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

        state._last_cameras.clear()
        state._last_cameras.extend(cameras)

        if req.update_frigate and cameras:
            try:
                http.post(f"{FRIGATE_URL}/api/restart", timeout=5)
                yield f"event: progress\ndata: {json.dumps('[*] Restarting Frigate...')}\n\n"
            except Exception as e:
                yield f"event: progress\ndata: {json.dumps(f'[!] Frigate restart error: {e}')}\n\n"

        yield f"event: result\ndata: {json.dumps(cameras)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
