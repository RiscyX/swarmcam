import asyncio
from typing import Optional

import requests as http
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import Response

from services.frigate_client import frigate_delete, frigate_get, frigate_post
from settings import FRIGATE_URL

router = APIRouter()

_PLACEHOLDER_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00"
    b"!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01"
    b"\x00\x00\x02\x02D\x01\x00;"
)


@router.get("/api/faces")
async def get_faces():
    try:
        r = await frigate_get("/api/faces")
        if r.status_code == 404:
            raise HTTPException(404, "Face recognition not enabled")
        if r.status_code != 200:
            raise HTTPException(503, "Frigate unavailable")
        return r.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")


@router.post("/api/faces/{name}/create")
async def create_face(name: str):
    try:
        r = await frigate_post(f"/api/faces/{name}/create")
        if r.status_code not in (200, 201):
            raise HTTPException(r.status_code, r.text)
        return r.json() if r.content else {"ok": True}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")


@router.post("/api/faces/{name}/register")
async def register_face(name: str, file: UploadFile):
    from services.frigate_client import _session, _ensure_auth
    loop = asyncio.get_event_loop()
    content = await file.read()
    await _ensure_auth(loop)
    try:
        r = await loop.run_in_executor(
            None,
            lambda: _session.post(
                f"{FRIGATE_URL}/api/faces/{name}/register",
                files={"file": (file.filename, content, file.content_type)},
                timeout=10,
            ),
        )
        if r.status_code not in (200, 201):
            raise HTTPException(r.status_code, r.text)
        return r.json() if r.content else {"ok": True}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")


@router.delete("/api/faces/{name}")
async def delete_face(name: str):
    try:
        r = await frigate_delete(f"/api/faces/{name}")
        if r.status_code not in (200, 204):
            raise HTTPException(r.status_code, r.text)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")


@router.get("/api/faces/{name}/thumbnail")
async def get_face_thumbnail(name: str, filename: Optional[str] = None):
    params = {"filename": filename} if filename else {}
    try:
        r = await frigate_get(f"/api/faces/{name}/thumbnail", params=params)
        if r.status_code == 200:
            return Response(content=r.content, media_type="image/jpeg")
    except Exception:
        pass
    return Response(content=_PLACEHOLDER_GIF, media_type="image/gif", status_code=200)
