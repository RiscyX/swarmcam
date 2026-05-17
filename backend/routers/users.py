from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from routers.auth import get_current_user
from services.frigate_client import frigate_delete, frigate_get, frigate_post, frigate_put

router = APIRouter()


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "viewer"


class ChangePasswordRequest(BaseModel):
    password: str


@router.get("/api/users")
async def list_users(_user=Depends(get_current_user)):
    try:
        r = await frigate_get("/api/users")
        if r.status_code in (401, 403):
            raise HTTPException(403, "Admin access required")
        if r.status_code != 200:
            raise HTTPException(503, "Frigate unavailable")
        return r.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")


@router.post("/api/users")
async def create_user(body: CreateUserRequest, _user=Depends(get_current_user)):
    try:
        r = await frigate_post(
            "/api/users",
            json_body={"username": body.username, "password": body.password, "role": body.role},
        )
        if r.status_code in (400, 409):
            detail = r.json().get("message", r.text) if r.content else r.text
            raise HTTPException(r.status_code, detail)
        if r.status_code in (401, 403):
            raise HTTPException(403, "Admin access required")
        if r.status_code not in (200, 201):
            raise HTTPException(503, "Frigate unavailable")
        return r.json() if r.content else {"ok": True}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")


@router.put("/api/users/{username}/password")
async def change_password(username: str, body: ChangePasswordRequest, _user=Depends(get_current_user)):
    try:
        r = await frigate_put(
            f"/api/users/{username}/password",
            json_body={"password": body.password},
        )
        if r.status_code in (401, 403):
            raise HTTPException(403, "Admin access required")
        if r.status_code == 404:
            raise HTTPException(404, "User not found")
        if r.status_code not in (200, 204):
            raise HTTPException(503, "Frigate unavailable")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")


@router.delete("/api/users/{username}")
async def delete_user(username: str, _user=Depends(get_current_user)):
    try:
        r = await frigate_delete(f"/api/users/{username}")
        if r.status_code in (401, 403):
            raise HTTPException(403, "Admin access required")
        if r.status_code == 404:
            raise HTTPException(404, "User not found")
        if r.status_code not in (200, 204):
            raise HTTPException(503, "Frigate unavailable")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")
