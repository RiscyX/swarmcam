from fastapi import WebSocket

_last_cameras: list[dict] = []
_ws_clients:   set[WebSocket] = set()
_health_cache: dict[str, dict] = {}
