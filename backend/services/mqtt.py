import asyncio
import json
import sys

import aiomqtt
from fastapi import WebSocket

import state
from settings import MQTT_HOST, MQTT_PORT


async def broadcast(msg: str) -> None:
    dead: set[WebSocket] = set()
    for ws in list(state._ws_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    state._ws_clients -= dead


async def mqtt_loop() -> None:
    while True:
        try:
            async with aiomqtt.Client(hostname=MQTT_HOST, port=MQTT_PORT) as client:
                print(f"[MQTT] Connected to {MQTT_HOST}:{MQTT_PORT}", file=sys.stderr)
                await client.subscribe("frigate/events")
                await client.subscribe("swarmcam/fire/#")
                async for message in client.messages:
                    try:
                        payload = json.loads(message.payload)
                        topic = str(message.topic)
                        if topic == "frigate/events":
                            after = payload.get("after", {})
                            event = json.dumps({
                                "type":   "frigate_event",
                                "camera": after.get("camera"),
                                "label":  after.get("label"),
                                "score":  round(after.get("score") or 0.0, 2),
                                "id":     after.get("id"),
                            })
                            await broadcast(event)
                        elif topic.startswith("swarmcam/fire/"):
                            camera = payload.get("camera", "unknown")
                            label = payload.get("label", "unknown")
                            try:
                                score = float(payload.get("score", 0.0))
                            except (TypeError, ValueError):
                                score = 0.0
                            
                            alert_msg = json.dumps({
                                "type": "alert",
                                "message": f"🔥 Tűz/füst érzékelve: {camera} ({score:.0%})"
                            })
                            await broadcast(alert_msg)
                            
                            event_msg = json.dumps({
                                "type": "frigate_event",
                                "camera": camera,
                                "label": label,
                                "score": score,
                                "id": None
                            })
                            await broadcast(event_msg)
                    except Exception:
                        pass
        except aiomqtt.MqttError as e:
            print(f"[MQTT] {e} – retry in 10s", file=sys.stderr)
            await asyncio.sleep(10)
        except Exception as e:
            print(f"[MQTT] Unexpected error: {e} – retry in 10s", file=sys.stderr)
            await asyncio.sleep(10)
