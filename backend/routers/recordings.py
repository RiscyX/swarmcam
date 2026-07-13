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

    camera_windows = {}
    for row in fire_events_raw:
        cam = row["camera"]
        ts = row["timestamp"]
        if cam not in camera_windows:
            camera_windows[cam] = {"min": ts - 10, "max": ts + 30}
        else:
            camera_windows[cam]["min"] = min(camera_windows[cam]["min"], ts - 10)
            camera_windows[cam]["max"] = max(camera_windows[cam]["max"], ts + 30)

    camera_segments = {}
    for cam, window in camera_windows.items():
        try:
            r = await frigate_get(f"/api/{cam}/recordings", params={"after": window["min"], "before": window["max"]})
            if r.status_code == 200:
                camera_segments[cam] = r.json()
        except Exception:
            pass

    fire_events = []
    for row in fire_events_raw:
        ts = row["timestamp"]
        cam = row["camera"]
        w_start = ts - 10
        w_end = ts + 30
        
        actual_start = w_start
        actual_end = w_end
        has_clip = True

        if cam in camera_segments:
            overlaps = []
            for seg in camera_segments[cam]:
                seg_s = seg.get("start_time")
                seg_e = seg.get("end_time")
                if seg_s is not None and seg_e is not None:
                    if seg_s < w_end and seg_e > w_start:
                        overlaps.append((max(w_start, seg_s), min(w_end, seg_e)))
            
            if overlaps:
                actual_start = min(o[0] for o in overlaps)
                actual_end = max(o[1] for o in overlaps)
            else:
                has_clip = False

        fire_events.append({
            "id": row["id"],
            "camera": cam,
            "label": row["label"],
            "score": row["score"],
            "start_time": actual_start,
            "end_time": actual_end,
            "has_clip": has_clip,
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
