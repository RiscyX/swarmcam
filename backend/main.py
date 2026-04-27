import asyncio
import json
import sys
from pathlib import Path

import requests as http
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

FRIGATE_URL = "http://localhost:5000"

app = FastAPI(title="SwarmCam API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DISCOVERY_SCRIPT = Path(__file__).parent.parent / "discovery" / "discovery.py"

_last_cameras: list[dict] = []


class DiscoverRequest(BaseModel):
    subnet: str | None = None
    port: int = 8080
    timeout: float = 1.0
    update_frigate: bool = False


@app.get("/api/cameras")
def get_cameras():
    return _last_cameras


@app.delete("/api/cameras")
def clear_cameras():
    global _last_cameras
    _last_cameras = []
    return {"cleared": True}


@app.post("/api/discover/stream")
async def discover_stream(req: DiscoverRequest):
    """
    SSE stream: discovery.py stderr sorait küldi event-ként,
    végén JSON payload-ként a talált kamerákat.
    """
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

        # stderr → progress events
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
                yield f"event: progress\ndata: {json.dumps('[*] Frigate újraindítása folyamatban...')}\n\n"
            except Exception as e:
                yield f"event: progress\ndata: {json.dumps(f'[!] Frigate restart sikertelen: {e}')}\n\n"

        yield f"event: result\ndata: {json.dumps(cameras)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
