import asyncio
import json
import pathlib

import requests as http
import urllib3
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

import state
from services.frigate_client import frigate_get

# The camera app serves HTTPS with a self-signed certificate by default;
# accepting it without verification is an intentional LAN-only decision.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

router = APIRouter()

_PLACEHOLDER_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00"
    b"!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01"
    b"\x00\x00\x02\x02D\x01\x00;"
)

_ALIASES_FILE = pathlib.Path(__file__).parent.parent / "aliases.json"


def _load_aliases() -> dict:
    try:
        return json.loads(_ALIASES_FILE.read_text())
    except Exception:
        return {}


def _save_aliases(aliases: dict) -> None:
    _ALIASES_FILE.write_text(json.dumps(aliases, indent=2, ensure_ascii=False))


def _default_display(name: str) -> str:
    return name.replace("cam_", "").replace("_", ".")


class TorchRequest(BaseModel):
    enabled: bool


class AliasRequest(BaseModel):
    alias: str


class CameraSettings(BaseModel):
    orientation: str | None = None
    video_size: str | None = None
    mirror: bool | str | None = None
    video_fps: int | None = None
    camera: str | None = None


@router.get("/api/cameras")
def get_cameras():
    aliases = _load_aliases()
    result = []
    for cam in state._last_cameras:
        c = dict(cam)
        c["display_name"] = aliases.get(cam["name"], _default_display(cam["name"]))
        result.append(c)
    return result


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
            lambda: http.get(f"https://{ip}:{port}/video/mjpeg", stream=True, timeout=3, verify=False),
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
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.get(
                f"https://{ip}:{port}/",
                params={"torch": "on" if body.enabled else "off"},
                timeout=3,
                verify=False,
            ),
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
            lambda: http.get(f"https://{ip}:{port}/info.json", timeout=3, verify=False),
        )
        if r.status_code != 200:
            raise HTTPException(503, "Camera unreachable")
        data = r.json()
        settings = data.get("settings", {})
        cams = data.get("cameras") or []
        # settings.cameraId is usually a facing keyword ("front"/"back"), not an
        # element of cameras[].id ("0", "1", "1:3") — match both.
        active_id = settings.get("cameraId")
        if not cams:
            active = None
        elif active_id in ("front", "back"):
            active = next((c for c in cams if c.get("facing") == active_id), cams[0])
        else:
            active = next((c for c in cams if c.get("id") == active_id), cams[0])
        lens = (active or {}).get("lensSettings", {})

        res = settings.get("streamRes", "")
        video_size = res if "x" in res else None
        try:
            video_fps = int(settings["fps"])
        except (KeyError, TypeError, ValueError):
            video_fps = None

        # User-set values live in the active camera's lensSettings map (all strings):
        # rotate holds the user rotation the `rotate=` param writes to — the
        # hardware-mounted sensorOrientation never changes and is not user-facing.
        return CameraSettings(
            orientation=lens.get("rotate"),
            video_size=video_size,
            mirror=(lens.get("mirror") == "true"),
            video_fps=video_fps,
            camera=(active or {}).get("facing"),  # 'front'/'back', what the UI expects
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Camera unreachable")


# CameraSettings field -> Android IP Camera query parameter
_KEY_MAP = {
    "orientation": "rotate",
    "video_size": "resolution",
    "mirror": "mirror",
    "video_fps": "fps",
    "camera": "camera",
}


@router.post("/api/cameras/{name}/settings")
async def set_camera_settings(name: str, body: CameraSettings):
    cam = next((c for c in state._last_cameras if c["name"] == name), None)
    if not cam:
        raise HTTPException(404, "Camera not found")
    ip, port = cam["ip"], cam["port"]
    loop = asyncio.get_event_loop()
    fields = body.model_dump(exclude_none=True)
    # All settings go in a single request: GET /?k1=v1&k2=v2
    params = {
        _KEY_MAP[k]: (str(v).lower() if isinstance(v, bool) else str(v))
        for k, v in fields.items()
    }
    if not params:
        return {"ok": False, "applied": []}

    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.get(f"https://{ip}:{port}/", params=params, timeout=3, verify=False),
        )
    except Exception:
        raise HTTPException(503, "Camera unreachable")

    applied = list(fields.keys()) if r.status_code == 200 else []
    return {"ok": len(applied) > 0, "applied": applied}


@router.patch("/api/cameras/{name}/alias")
def set_camera_alias(name: str, body: AliasRequest):
    aliases = _load_aliases()
    stripped = body.alias.strip()
    if stripped:
        aliases[name] = stripped
    else:
        aliases.pop(name, None)
    _save_aliases(aliases)
    return {
        "ok": True,
        "display_name": aliases.get(name, _default_display(name)),
    }


@router.get("/api/cameras/{name}/alias")
def get_camera_alias(name: str):
    aliases = _load_aliases()
    return {"alias": aliases.get(name, "")}
