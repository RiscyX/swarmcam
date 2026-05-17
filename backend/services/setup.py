import asyncio
import sys

import requests as http

from settings import DEFAULT_PASSWORD, DEFAULT_USER, FRIGATE_URL

_RETRIES    = 15
_RETRY_WAIT = 5  # seconds between retries


async def ensure_default_user() -> None:
    """If Frigate has no users yet, create the default admin account."""
    await asyncio.sleep(3)
    loop = asyncio.get_event_loop()
    for attempt in range(_RETRIES):
        try:
            r = await loop.run_in_executor(
                None,
                lambda: http.get(f"{FRIGATE_URL}/api/users", timeout=3),
            )
            if r.status_code == 200:
                users = r.json()
                if not users:
                    cr = await loop.run_in_executor(
                        None,
                        lambda: http.post(
                            f"{FRIGATE_URL}/api/users",
                            json={"username": DEFAULT_USER, "password": DEFAULT_PASSWORD, "role": "admin"},
                            timeout=5,
                        ),
                    )
                    if cr.status_code in (200, 201):
                        print(
                            f"[SETUP] Default admin user created – login: {DEFAULT_USER} / {DEFAULT_PASSWORD}",
                            file=sys.stderr,
                        )
                    else:
                        print(f"[SETUP] Could not create default user: {cr.status_code} {cr.text}", file=sys.stderr)
                else:
                    print(f"[SETUP] Frigate already has {len(users)} user(s), skipping auto-create.", file=sys.stderr)
                return
            # Frigate returned a non-200: auth might already be locked (has users), that's fine
            if r.status_code in (401, 403):
                print("[SETUP] Frigate auth already configured, skipping auto-create.", file=sys.stderr)
                return
        except Exception as e:
            print(f"[SETUP] Frigate not ready (attempt {attempt + 1}/{_RETRIES}): {e}", file=sys.stderr)
        await asyncio.sleep(_RETRY_WAIT)
    print("[SETUP] Could not reach Frigate after all retries.", file=sys.stderr)
