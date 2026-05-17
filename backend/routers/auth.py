import asyncio
import base64
import json
import time

import requests as http
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from settings import FRIGATE_URL

router = APIRouter()
security = HTTPBearer(auto_error=False)


def _decode_jwt_payload(token: str) -> dict | None:
    """Decode JWT payload without signature verification."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        padding = 4 - len(parts[1]) % 4
        payload = base64.urlsafe_b64decode(parts[1] + "=" * padding)
        return json.loads(payload)
    except Exception:
        return None


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = _decode_jwt_payload(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("exp", 0) < time.time():
        raise HTTPException(status_code=401, detail="Token expired")
    return {"username": payload.get("sub", "unknown"), "role": payload.get("role", "viewer")}


@router.post("/api/auth/login")
async def login(request: Request):
    body = await request.json()
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.post(f"{FRIGATE_URL}/api/login", json=body, timeout=5),
        )
        if r.status_code != 200:
            # Forward Frigate's error message
            try:
                detail = r.json().get("message", "Login failed")
            except Exception:
                detail = "Login failed"
            return JSONResponse({"message": detail}, status_code=r.status_code)
        # Frigate returns the token in a cookie, not in the body
        token = r.cookies.get("frigate_token")
        if not token:
            return JSONResponse({"message": "No token received from Frigate"}, status_code=500)
        return JSONResponse({"token": token}, status_code=200)
    except Exception:
        raise HTTPException(status_code=503, detail="Frigate unavailable")


@router.get("/api/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return user
