import asyncio
import json
import sys
import sqlite3
import time
import uuid
import os
import base64

import aiomqtt
from fastapi import WebSocket

import state
from settings import MQTT_HOST, MQTT_PORT

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fire_events.db")
SNAPSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fire_snapshots")
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS fire_events (
                id TEXT PRIMARY KEY,
                camera TEXT,
                label TEXT,
                score REAL,
                timestamp REAL
            )
        ''')
init_db()

def save_fire_event(camera: str, label: str, score: float) -> dict:
    event_id = uuid.uuid4().hex
    ts = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO fire_events (id, camera, label, score, timestamp) VALUES (?, ?, ?, ?, ?)",
            (event_id, camera, label, score, ts)
        )
    return {
        "id": event_id,
        "camera": camera,
        "label": label,
        "score": score,
        "timestamp": ts,
        "type": "fire_event"
    }


async def broadcast(msg: str) -> None:
    dead: set[WebSocket] = set()
    for ws in list(state._ws_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    state._ws_clients -= dead


async def _handle_frigate_event(raw: bytes | str) -> None:
    payload = json.loads(raw)
    after = payload.get("after", {})
    event = json.dumps({
        "type":   "frigate_event",
        "camera": after.get("camera"),
        "label":  after.get("label"),
        "score":  round(after.get("score") or 0.0, 2),
        "id":     after.get("id"),
    })
    await broadcast(event)


async def _handle_fire_event(raw: bytes | str) -> None:
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        return
    camera = payload.get("camera", "unknown")
    label = payload.get("label", "unknown")
    try:
        score = float(payload.get("score") or 0.0)
    except (TypeError, ValueError):
        score = 0.0

    event_id = save_fire_event(camera, label, score)["id"]

    image_b64 = payload.get("image")
    if image_b64:
        try:
            image_data = base64.b64decode(image_b64)
            with open(os.path.join(SNAPSHOT_DIR, f"{event_id}.jpg"), "wb") as f:
                f.write(image_data)
        except Exception as e:
            print(f"[MQTT] Failed to save fire snapshot for {event_id}: {e}", file=sys.stderr)

    await broadcast(json.dumps({
        "type":    "alert",
        "message": f"🔥 Tűz/füst érzékelve: {camera} ({score:.0%})",
    }))
    await broadcast(json.dumps({
        "type":   "frigate_event",
        "camera": camera,
        "label":  label,
        "score":  round(score, 2),
        "id":     None,
    }))


async def mqtt_loop() -> None:
    while True:
        try:
            async with aiomqtt.Client(hostname=MQTT_HOST, port=MQTT_PORT) as client:
                print(f"[MQTT] Connected to {MQTT_HOST}:{MQTT_PORT}", file=sys.stderr)
                await client.subscribe("frigate/events")
                await client.subscribe("swarmcam/fire/#")
                async for message in client.messages:
                    try:
                        if message.topic.matches("swarmcam/fire/#"):
                            await _handle_fire_event(message.payload)
                        else:
                            await _handle_frigate_event(message.payload)
                    except Exception:
                        pass
        except aiomqtt.MqttError as e:
            print(f"[MQTT] {e} – retry in 10s", file=sys.stderr)
            await asyncio.sleep(10)
        except Exception as e:
            print(f"[MQTT] Unexpected error: {e} – retry in 10s", file=sys.stderr)
            await asyncio.sleep(10)
