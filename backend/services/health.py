import asyncio
import json

import requests as http

import state
from settings import FRIGATE_URL, HEALTH_INTERVAL


async def poll_status(ip: str, port: int) -> dict | None:
    loop = asyncio.get_event_loop()
    try:
        resp = await loop.run_in_executor(
            None, lambda: http.get(f"http://{ip}:{port}/info.json", timeout=2.0)
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None


def _orientation_label(angle) -> str | None:
    try:
        a = int(angle)
    except (TypeError, ValueError):
        return None
    return "portrait" if a in (0, 180) else "landscape"


def _parse_info(info: dict) -> dict:
    settings = info.get("settings", {})
    cams = info.get("cameras") or []
    active_id = settings.get("cameraId")
    active = next((c for c in cams if c.get("id") == active_id), cams[0] if cams else None)
    # User-set rotation lives in lensSettings.rotate; sensorOrientation is the
    # constant hardware mounting angle, not meaningful to display.
    lens = (active or {}).get("lensSettings", {}) if active else {}
    return {
        "battery_level":  int(info["batteryPercent"]) if "batteryPercent" in info else None,
        "wifi_strength":  int(info["wifiStrength"])   if "wifiStrength"   in info else None,
        "orientation":    _orientation_label(lens.get("rotate")),
    }


async def health_loop() -> None:
    while True:
        if state._last_cameras:
            updates = []
            for cam in state._last_cameras:
                ip, port = cam["ip"], cam["port"]
                status = await poll_status(ip, port)
                entry: dict = {"ip": ip, "port": port, "name": cam["name"]}
                if status:
                    entry.update({"online": True, **_parse_info(status)})
                else:
                    entry["online"] = False
                state._health_cache[ip] = entry
                updates.append(entry)

            if state._ws_clients and updates:
                msg = json.dumps({"type": "status", "cameras": updates})
                dead = set()
                for ws in list(state._ws_clients):
                    try:
                        await ws.send_text(msg)
                    except Exception:
                        dead.add(ws)
                state._ws_clients -= dead

        await asyncio.sleep(HEALTH_INTERVAL)
