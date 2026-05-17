import asyncio
import json

import requests as http

import state
from services.mqtt import broadcast
from settings import FRIGATE_URL, HEALTH_INTERVAL


async def poll_status(ip: str, port: int) -> dict | None:
    loop = asyncio.get_event_loop()
    try:
        resp = await loop.run_in_executor(
            None, lambda: http.get(f"http://{ip}:{port}/status.json", timeout=2.0)
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None


async def health_loop() -> None:
    _prev_charging: dict[str, bool] = {}
    while True:
        if state._last_cameras:
            updates = []
            for cam in state._last_cameras:
                ip, port = cam["ip"], cam["port"]
                status = await poll_status(ip, port)
                entry: dict = {"ip": ip, "port": port, "name": cam["name"]}
                if status:
                    info    = status.get("deviceInfo", {})
                    curvals = status.get("curvals", {})
                    entry.update({
                        "online":            True,
                        "battery_level":     int(info["batteryPercent"])   if "batteryPercent"  in info else None,
                        "battery_charging":  info.get("batteryCharging", "").lower() in ("true", "1", "charging"),
                        "battery_temp_c":    round(float(info.get("batteryTemperatureC", 0)), 1) or None,
                        "free_space_gb":     round(int(info["freeSpaceBytes"]) / 1024**3, 1) if "freeSpaceBytes" in info else None,
                        "video_connections": int(status.get("video_connections", 0)),
                        "night_vision":      curvals.get("night_vision", "off") == "on",
                        "quality":           int(curvals["quality"]) if "quality" in curvals else None,
                        "orientation":       curvals.get("orientation"),
                    })
                    now_charging = entry["battery_charging"]
                    prev = _prev_charging.get(ip)
                    if prev is not None and prev != now_charging:
                        label = cam["name"].replace("cam_", "").replace("_", ".")
                        msg = f"{label} {'csatlakozott a töltőre' if now_charging else 'lecsatlakozott a töltésről'}!"
                        await broadcast(json.dumps({"type": "alert", "message": msg}))
                    _prev_charging[ip] = now_charging
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
