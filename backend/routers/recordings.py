import asyncio
from typing import Optional
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse, FileResponse

from services.frigate_client import frigate_delete, frigate_get, frigate_get_stream
from routers.fire_utils import get_fire_events_db, get_fire_event_db, delete_fire_event_db, SNAPSHOT_DIR

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
    after: Optional[float] = None,
    before: Optional[float] = None,
    limit: int = 50,
):
    params: dict = {"limit": limit, "has_clip": 1}
    if camera:
        params["camera"] = camera
    if label:
        params["label"] = label
    if after:
        params["after"] = after
    if before:
        params["before"] = before

    frigate_events = []
    try:
        r = await frigate_get("/api/events", params=params)
        if r.status_code == 200:
            frigate_events = r.json()
    except Exception:
        pass

    try:
        fire_events_raw = get_fire_events_db(camera=camera, label=label, after=after, before=before, limit=limit)
    except Exception:
        fire_events_raw = []

    fire_events = []
    for row in fire_events_raw:
        ts = row["timestamp"]
        fire_events.append({
            "id": row["id"],
            "camera": row["camera"],
            "label": row["label"],
            "score": row["score"],
            "start_time": ts - 10,
            "end_time": ts + 30,
            "has_clip": True,
            "has_snapshot": row.get("has_snapshot", False),
        })

    all_events = frigate_events + fire_events
    all_events.sort(key=lambda x: x.get("start_time", 0), reverse=True)
    return all_events[:limit]


@router.get("/api/recordings/{event_id}/clip")
async def get_event_clip(event_id: str):
    loop = asyncio.get_event_loop()
    
    fire_event = get_fire_event_db(event_id)
    if fire_event:
        ts = fire_event["timestamp"]
        camera = fire_event["camera"]
        start_ts = ts - 10
        end_ts = ts + 30
        try:
            r = await frigate_get_stream(f"/api/{camera}/start/{start_ts}/end/{end_ts}/clip.mp4")
            if r.status_code != 200:
                raise HTTPException(404, "Clip not found")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, "Frigate unavailable")
    else:
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
    fire_event = get_fire_event_db(event_id)
    if fire_event:
        file_path = os.path.join(SNAPSHOT_DIR, f"{event_id}.jpg")
        if os.path.exists(file_path):
            return FileResponse(file_path, media_type="image/jpeg")
        return Response(content=_PLACEHOLDER_GIF, media_type="image/gif", status_code=200)

    try:
        r = await frigate_get(f"/api/events/{event_id}/snapshot.jpg")
        if r.status_code == 200:
            return Response(content=r.content, media_type="image/jpeg")
    except Exception:
        pass
    return Response(content=_PLACEHOLDER_GIF, media_type="image/gif", status_code=200)


@router.delete("/api/recordings/{event_id}")
async def delete_recording(event_id: str):
    if delete_fire_event_db(event_id):
        return {"success": True}

    try:
        r = await frigate_delete(f"/api/events/{event_id}")
        if r.status_code == 200:
            return {"success": True}
        elif r.status_code == 404:
            raise HTTPException(404, "Recording not found")
        else:
            raise HTTPException(503, "Frigate unavailable")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")
