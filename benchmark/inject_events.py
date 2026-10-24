#!/usr/bin/env python3
"""Publishes synthetic Frigate events to the MQTT broker, so the
MQTT -> backend -> WebSocket relay latency can be measured even when
there is no real motion in front of the camera. The payload format
matches Frigate's frigate/events messages; the backend does not store them."""
import json
import sys
import time
import uuid

import paho.mqtt.client as mqtt

count = int(sys.argv[1]) if len(sys.argv) > 1 else 30
interval = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0

c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, f"bench-inject-{int(time.time())}")
c.connect("localhost", 1883)
c.loop_start()
time.sleep(1)
for i in range(count):
    ev = {
        "type": "new",
        "before": {},
        "after": {
            "id": f"bench-{uuid.uuid4().hex[:12]}",
            "camera": "cam_192_168_0_100",
            "label": "person",
            "score": 0.81,
            "start_time": time.time(),
        },
    }
    c.publish("frigate/events", json.dumps(ev))
    time.sleep(interval)
c.loop_stop()
c.disconnect()
