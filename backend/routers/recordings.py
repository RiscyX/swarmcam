import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse

from services.frigate_client import frigate_get, frigate_get_stream

router = APIRouter()

_PLACEHOLDER_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00"
    b"!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01"
    b"\x00\x00\x02\x02D\x01\x00;"
)


@router.get("/api/recordings/events")
async def get_recording_events(
    camera: Optional[str] = None,
    label: Optional[str] = None,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
    limit: int = 50,
):
    params: dict = {"limit": limit, "has_clip": "true"}
    if camera:
        params["camera"] = camera
    if label:
        params["label"] = label
    if start_time:
        params["after"] = start_time
    if end_time:
        params["before"] = end_time

    try:
        r = await frigate_get("/api/events", params=params)
        if r.status_code != 200:
            raise HTTPException(503, "Frigate unavailable")
        return r.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")


@router.get("/api/recordings/{event_id}/clip")
async def get_event_clip(event_id: str):
    loop = asyncio.get_event_loop()
    try:
        r = await frigate_get_stream(f"/api/events/{event_id}/clip.mp4")
        if r.status_code != 200:
            raise HTTPException(404, "Clip not found")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")

    async def generate():
        try:
            while True:
                chunk = await loop.run_in_executor(None, r.raw.read, 65536)
                if not chunk:
                    break
                yield chunk
        finally:
            r.close()

    return StreamingResponse(generate(), media_type="video/mp4")


@router.get("/api/recordings/{event_id}/thumbnail")
async def get_recording_thumbnail(event_id: str):
    try:
        r = await frigate_get(f"/api/events/{event_id}/snapshot.jpg")
        if r.status_code == 200:
            return Response(content=r.content, media_type="image/jpeg")
    except Exception:
        pass
    return Response(content=_PLACEHOLDER_GIF, media_type="image/gif", status_code=200)
