from typing import Optional
import os
import sqlite3

import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, FileResponse, StreamingResponse

from services.frigate_client import frigate_get, frigate_get_stream

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fire_events.db")
SNAPSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fire_snapshots")


router = APIRouter()

_PLACEHOLDER_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00"
    b"!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01"
    b"\x00\x00\x02\x02D\x01\x00;"
)


@router.get("/api/events")
async def get_events(
    camera: Optional[str] = None,
    label: Optional[str] = None,
    after: Optional[float] = None,
    before: Optional[float] = None,
    limit: int = 100,
):
    params: dict = {"limit": limit}
    if camera:
        params["camera"] = camera
    if label:
        params["label"] = label
    if after:
        params["after"] = after
    if before:
        params["before"] = before

    try:
        r = await frigate_get("/api/events", params=params)
        if r.status_code != 200:
            raise HTTPException(503, "Frigate unavailable")
        return r.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")


@router.get("/api/fire-events")
async def get_fire_events(
    camera: Optional[str] = None,
    label: Optional[str] = None,
    limit: int = 100,
):
    query = "SELECT id, camera, label, score, timestamp FROM fire_events WHERE 1=1"
    params = []
    if camera:
        query += " AND camera = ?"
        params.append(camera)
    if label:
        query += " AND label = ?"
        params.append(label)
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)

    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            results = []
            for r in rows:
                row_dict = dict(r)
                has_snapshot = os.path.exists(os.path.join(SNAPSHOT_DIR, f"{row_dict['id']}.jpg"))
                row_dict["has_snapshot"] = has_snapshot
                results.append(row_dict)
            return results
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")

@router.get("/api/events/stats")
async def get_event_stats(camera: Optional[str] = None, days: int = 7):
    import asyncio
    loop = asyncio.get_event_loop()
    try:
        explore_r, summary_r = await asyncio.gather(
            frigate_get("/api/events/explore"),
            frigate_get("/api/events/summary"),
        )
        explore = explore_r.json() if explore_r.status_code == 200 else {}
        summary = summary_r.json() if summary_r.status_code == 200 else {}
        return {"explore": explore, "summary": summary}
    except Exception:
        raise HTTPException(503, "Frigate unavailable")


@router.get("/api/events/{event_id}/thumbnail")
async def get_event_thumbnail(event_id: str):
    try:
        r = await frigate_get(f"/api/events/{event_id}/snapshot.jpg")
        if r.status_code == 200:
            return Response(content=r.content, media_type="image/jpeg")
    except Exception:
        pass
    return Response(content=_PLACEHOLDER_GIF, media_type="image/gif", status_code=200)

@router.get("/api/fire-events/{event_id}/snapshot")
async def get_fire_event_snapshot(event_id: str):
    file_path = os.path.join(SNAPSHOT_DIR, f"{event_id}.jpg")
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="image/jpeg")
    return Response(content=_PLACEHOLDER_GIF, media_type="image/gif", status_code=200)

@router.get("/api/fire-events/{event_id}/clip")
async def get_fire_event_clip(event_id: str):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT camera, timestamp FROM fire_events WHERE id = ?", (event_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(404, "Fire event not found")
            camera = row["camera"]
            ts = row["timestamp"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")

    start_ts = ts - 10
    end_ts = ts + 30
    
    loop = asyncio.get_event_loop()
    try:
        r = await frigate_get_stream(f"/api/{camera}/start/{start_ts}/end/{end_ts}/clip.mp4")
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
