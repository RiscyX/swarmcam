import asyncio
import contextlib
import json
import pathlib
from urllib.parse import quote

import requests as http
import urllib3
import websockets
from fastapi import APIRouter, HTTPException, WebSocket
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

import state
from services.frigate_client import frigate_get, frigate_get_stream, frigate_post
from services.frigate_config import (
    RAW_SUFFIX,
    camera_rotation,
    camera_source_url,
    read_yaml,
    set_camera_rotation,
    write_yaml,
)
from services.go2rtc_client import go2rtc_delete_stream, go2rtc_is_available, go2rtc_put_stream
from settings import FRIGATE_CONFIG, GO2RTC_WS_URL

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
    # Live view comes from Frigate's MJPEG feed (the same go2rtc H264 stream
    # the recordings are made from) — so framing and smoothness match the
    # Frigate UI, and we avoid the phone's MJPEG throttling.
    cam = next((c for c in state._last_cameras if c["name"] == name), None)
    if not cam:
        raise HTTPException(404, "Camera not found")
    try:
        r = await frigate_get_stream(f"/api/{name}", timeout=5)
    except Exception:
        raise HTTPException(503, "Camera unreachable")
    if r.status_code != 200:
        raise HTTPException(503, "Camera unreachable")

    content_type = r.headers.get("Content-Type", "multipart/x-mixed-replace;boundary=frame")
    loop = asyncio.get_event_loop()

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


@router.websocket("/ws/cameras/{name}/mse")
async def camera_mse(ws: WebSocket, name: str):
    """
    Relays go2rtc's MSE stream to the browser: fMP4 segments from the same
    H.264 source Frigate detects on and records from.
    go2rtc only repackages, it does not re-encode — unlike the MJPEG proxy
    there is no JPEG encoding, and the refresh rate is not tied to the detect fps.

    The /ws prefix is not cosmetic: in the dashboard's nginx only that location
    passes on the WebSocket Upgrade header, /api/ does not.
    """
    if not any(c["name"] == name for c in state._last_cameras):
        await ws.close(code=1008)
        return

    await ws.accept()
    try:
        async with websockets.connect(f"{GO2RTC_WS_URL}?src={quote(name)}", max_size=None) as up:
            async def client_to_go2rtc() -> None:
                while True:
                    await up.send(await ws.receive_text())

            async def go2rtc_to_client() -> None:
                async for msg in up:
                    if isinstance(msg, bytes):
                        await ws.send_bytes(msg)
                    else:
                        await ws.send_text(msg)

            tasks = [
                asyncio.create_task(client_to_go2rtc()),
                asyncio.create_task(go2rtc_to_client()),
            ]
            _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
    except Exception:
        # Either end of the relay may also drop normally (tab switch, navigation).
        pass
    finally:
        with contextlib.suppress(Exception):
            await ws.close()


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


_ROTATIONS = (0, 90, 180, 270)


def _pipeline_rotation(name: str) -> int:
    """The rotation actually applied to the camera, from the Frigate config."""
    if not FRIGATE_CONFIG.exists():
        return 0
    try:
        return camera_rotation(read_yaml(FRIGATE_CONFIG), name)
    except Exception:
        return 0


async def _clear_phone_rotation(ip: str, port: int) -> None:
    """
    Resets the phone's own rotate setting. It does not rotate the /video/h264
    stream, it only fits a downscaled image into the unchanged frame (black
    bars) — on top of our rotation that would be double work and lost resolution.
    """
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(
            None,
            lambda: http.get(f"https://{ip}:{port}/", params={"rotate": "0"},
                             timeout=3, verify=False),
        )
    except Exception:
        pass


async def _apply_rotation(name: str, orientation: str, ip: str, port: int) -> tuple[bool, bool]:
    """
    Writes the rotation into the go2rtc streams.
    First tries the go2rtc API (without a Frigate restart);
    if that does not work, falls back to restarting Frigate.
    Returns: (whether the requested rotation is in effect, whether Frigate restarted).
    """
    try:
        rotation = int(orientation)
    except (TypeError, ValueError):
        return False, False
    if rotation not in _ROTATIONS or not FRIGATE_CONFIG.exists():
        return False, False

    await _clear_phone_rotation(ip, port)

    config = read_yaml(FRIGATE_CONFIG)
    if camera_rotation(config, name) == rotation:
        return True, False

    # Modify the config dict (always needed for persistence)
    try:
        modified_config = set_camera_rotation(config, name, rotation)
    except KeyError:
        return False, False

    # Dynamic go2rtc change (without a Frigate restart)
    go2rtc_ok = False
    if await go2rtc_is_available():
        go2rtc_ok = await _apply_go2rtc_rotation(name, rotation, modified_config)

    # Write the config file (always — persists across a Frigate restart)
    write_yaml(FRIGATE_CONFIG, modified_config)

    # Restart Frigate only if the go2rtc API did not work
    if not go2rtc_ok:
        try:
            await frigate_post("/api/restart", timeout=10)
        except Exception:
            pass
        return True, True

    return True, False


async def _apply_go2rtc_rotation(name: str, rotation: int, config: dict) -> bool:
    """Sends the rotation change to the go2rtc HTTP API.

    The go2rtc API changes the stream source immediately in the running process.
    The caller has already modified the config dict (called before write_yaml).
    """
    streams = (config.get("go2rtc") or {}).get("streams") or {}
    raw = name + RAW_SUFFIX

    try:
        if rotation:
            # Create the _raw stream with the phone's URL
            raw_src = streams.get(raw, [None])[0]
            if raw_src:
                await go2rtc_put_stream(raw, raw_src)
            # Switch the main stream to an ffmpeg transpose filter
            main_src = streams.get(name, [None])[0]
            if main_src:
                await go2rtc_put_stream(name, main_src)
        else:
            # Restore the main stream to the direct phone URL
            main_src = streams.get(name, [None])[0]
            if main_src:
                await go2rtc_put_stream(name, main_src)
            # Delete the _raw stream
            await go2rtc_delete_stream(raw)
        return True
    except Exception:
        return False


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

        # Every value except rotation comes from the phone (lensSettings, all
        # strings). Rotation, however, is done by the go2rtc pipeline, so it is
        # read from the Frigate config — that shows what the user actually sees
        # on the dashboard, in the Frigate UI and in the recordings.
        return CameraSettings(
            orientation=str(_pipeline_rotation(name)),
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
    # Rotation does not go to the phone but into the go2rtc pipeline — see
    # _apply_rotation. The other settings go in a single request: GET /?k1=v1&k2=v2
    phone_fields = {k: v for k, v in fields.items() if k != "orientation"}
    params = {
        _KEY_MAP[k]: (str(v).lower() if isinstance(v, bool) else str(v))
        for k, v in phone_fields.items()
    }
    if not fields:
        return {"ok": False, "applied": []}

    applied = []
    if params:
        try:
            r = await loop.run_in_executor(
                None,
                lambda: http.get(f"https://{ip}:{port}/", params=params, timeout=3, verify=False),
            )
        except Exception:
            raise HTTPException(503, "Camera unreachable")
        if r.status_code == 200:
            applied = list(phone_fields.keys())

    frigate_restarted = False
    if "orientation" in fields:
        rotated, frigate_restarted = await _apply_rotation(name, body.orientation, ip, port)
        if rotated:
            applied.append("orientation")

    return {
        "ok": len(applied) > 0,
        "applied": applied,
        "frigate_restarted": frigate_restarted,
    }


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
