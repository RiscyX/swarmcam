import asyncio

import requests as http
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

import state
from services.frigate_client import frigate_get

router = APIRouter()

_PLACEHOLDER_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00"
    b"!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01"
    b"\x00\x00\x02\x02D\x01\x00;"
)


class TorchRequest(BaseModel):
    enabled: bool


class CameraSettings(BaseModel):
    orientation: str | None = None
    quality: int | None = None
    video_size: str | None = None
    night_vision: str | None = None


@router.get("/api/cameras")
def get_cameras():
    return state._last_cameras


@router.get("/api/cameras/{name}/snapshot")
async def camera_snapshot(name: str):
    try:
        r = await frigate_get(f"/api/{name}/latest.jpg", timeout=3)
        if r.status_code == 200:
            return Response(content=r.content, media_type="image/jpeg")
    except Exception:
        pass
    return Response(content=_PLACEHOLDER_GIF, media_type="image/gif", status_code=200)


@router.get("/api/cameras/{name}/stream")
async def camera_stream(name: str):
    cam = next((c for c in state._last_cameras if c["name"] == name), None)
    if not cam:
        raise HTTPException(404, "Camera not found")
    ip, port = cam["ip"], cam["port"]
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.get(f"http://{ip}:{port}/videofeed", stream=True, timeout=5),
        )
    except Exception:
        raise HTTPException(503, "Camera unreachable")

    content_type = r.headers.get("Content-Type", "multipart/x-mixed-replace;boundary=ipcam")

    async def generate():
        try:
            while True:
                chunk = await loop.run_in_executor(None, r.raw.read, 8192)
                if not chunk:
                    break
                yield chunk
        finally:
            r.close()

    return StreamingResponse(generate(), media_type=content_type)


@router.post("/api/cameras/{name}/torch")
async def camera_torch(name: str, body: TorchRequest):
    cam = next((c for c in state._last_cameras if c["name"] == name), None)
    if not cam:
        raise HTTPException(404, "Camera not found")
    ip, port = cam["ip"], cam["port"]
    loop = asyncio.get_event_loop()
    endpoint = "enabletorch" if body.enabled else "disabletorch"
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.get(f"http://{ip}:{port}/{endpoint}", timeout=3),
        )
        return {"ok": r.status_code == 200}
    except Exception:
        raise HTTPException(503, "Camera unreachable")


@router.get("/api/cameras/{name}/stats")
async def camera_stats(name: str):
    try:
        r = await frigate_get("/api/stats", timeout=3)
        if r.status_code != 200:
            raise HTTPException(503, "Frigate unavailable")
        cam_stats = r.json().get("cameras", {}).get(name, {})
        return {
            "camera_fps":    round(cam_stats.get("camera_fps", 0), 1),
            "detection_fps": round(cam_stats.get("detection_fps", 0), 1),
            "skipped_fps":   round(cam_stats.get("skipped_fps", 0), 1),
            "process_fps":   round(cam_stats.get("process_fps", 0), 1),
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")


@router.get("/api/cameras/{name}/settings")
async def get_camera_settings(name: str):
    cam = next((c for c in state._last_cameras if c["name"] == name), None)
    if not cam:
        raise HTTPException(404, "Camera not found")
    ip, port = cam["ip"], cam["port"]
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.get(f"http://{ip}:{port}/status.json", timeout=3),
        )
        if r.status_code != 200:
            raise HTTPException(503, "Camera unreachable")
        curvals = r.json().get("curvals", {})
        return CameraSettings(
            orientation=curvals.get("orientation"),
            quality=int(curvals["quality"]) if "quality" in curvals else None,
            video_size=curvals.get("video_size"),
            night_vision=curvals.get("night_vision"),
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Camera unreachable")


@router.post("/api/cameras/{name}/settings")
async def set_camera_settings(name: str, body: CameraSettings):
    cam = next((c for c in state._last_cameras if c["name"] == name), None)
    if not cam:
        raise HTTPException(404, "Camera not found")
    ip, port = cam["ip"], cam["port"]
    loop = asyncio.get_event_loop()
    applied = []
    fields = body.model_dump(exclude_none=True)
    for key, value in fields.items():
        try:
            r = await loop.run_in_executor(
                None,
                lambda k=key, v=value: http.get(
                    f"http://{ip}:{port}/command.json",
                    params={"cmd": f"{k}={v}"},
                    timeout=3,
                ),
            )
            if r.status_code == 200:
                applied.append(key)
        except Exception:
            pass
    return {"ok": len(applied) > 0, "applied": applied}
