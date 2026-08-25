"""
Frigate HTTP client that maintains an authenticated admin session.
All backend-to-Frigate calls should go through frigate_get/frigate_post etc.
"""
import asyncio
import sys
import time

import requests as http

from settings import DEFAULT_PASSWORD, DEFAULT_USER, FRIGATE_URL

_session = http.Session()
_token_expiry: float = 0


def _login_sync() -> bool:
    """Authenticate with Frigate and store the session cookie. Returns True on success."""
    try:
        # A Frigate jelszó-ellenőrzése (bcrypt) gyenge CPU-n 5s-nél tovább is
        # tarthat, ezért ez hosszabb timeout-ot kap, mint a többi (gyors) hívás.
        r = _session.post(
            f"{FRIGATE_URL}/api/login",
            json={"user": DEFAULT_USER, "password": DEFAULT_PASSWORD},
            timeout=20,
        )
        if r.status_code == 200:
            global _token_expiry
            _token_expiry = time.time() + 82800  # refresh 1 hour before 24h expiry
            print(f"[FRIGATE] Backend session authenticated as '{DEFAULT_USER}'", file=sys.stderr)
            return True
        print(f"[FRIGATE] Backend login failed: {r.status_code} {r.text[:80]}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[FRIGATE] Backend login error: {e}", file=sys.stderr)
        return False


async def _ensure_auth(loop: asyncio.AbstractEventLoop) -> None:
    """Re-authenticate if the session is expired or missing."""
    if time.time() < _token_expiry:
        return
    await loop.run_in_executor(None, _login_sync)


async def frigate_get(path: str, params: dict | None = None, timeout: int = 5) -> http.Response:
    loop = asyncio.get_event_loop()
    await _ensure_auth(loop)
    return await loop.run_in_executor(
        None,
        lambda: _session.get(f"{FRIGATE_URL}{path}", params=params, timeout=timeout),
    )


async def frigate_post(path: str, json_body: dict | None = None, timeout: int = 5) -> http.Response:
    loop = asyncio.get_event_loop()
    await _ensure_auth(loop)
    return await loop.run_in_executor(
        None,
        lambda: _session.post(f"{FRIGATE_URL}{path}", json=json_body, timeout=timeout),
    )


async def frigate_put(path: str, json_body: dict | None = None, timeout: int = 5) -> http.Response:
    loop = asyncio.get_event_loop()
    await _ensure_auth(loop)
    return await loop.run_in_executor(
        None,
        lambda: _session.put(f"{FRIGATE_URL}{path}", json=json_body, timeout=timeout),
    )


async def frigate_delete(path: str, timeout: int = 5) -> http.Response:
    loop = asyncio.get_event_loop()
    await _ensure_auth(loop)
    return await loop.run_in_executor(
        None,
        lambda: _session.delete(f"{FRIGATE_URL}{path}", timeout=timeout),
    )


async def frigate_get_stream(path: str, timeout: int = 10) -> http.Response:
    """For streaming responses (clip downloads)."""
    loop = asyncio.get_event_loop()
    await _ensure_auth(loop)
    return await loop.run_in_executor(
        None,
        lambda: _session.get(f"{FRIGATE_URL}{path}", stream=True, timeout=timeout),
    )
