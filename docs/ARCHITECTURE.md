# SwarmCam — System Architecture

## Overview

SwarmCam is a self-hosted, distributed security camera system. Old Android phones running the **IP Webcam APK** act as camera nodes. A server-side stack (Frigate NVR, MQTT broker, FastAPI backend, React dashboard) discovers, monitors, and presents these cameras with AI-based detection and live video streaming.

**Design goal:** Zero cloud dependency. Everything runs on a local machine (NUC or similar) in Docker containers.

```
┌─────────────────────────────────────┐
│        Android phones               │
│   Android IP Camera APK (4444)      │
│   • HTTPS H.264: /video/h264        │
│     (raw Annex-B, no RTSP)          │
│   • HTTP API: /info.json            │
│              /video/mjpeg (live)    │
│              /video/snapshot        │
│              /control/*             │
└────────────┬────────────────────────┘
             │ HTTPS (H.264)
             ▼
┌────────────────────────────────────┐
│          Frigate NVR               │
│  • go2rtc pulls /video/h264 and    │
│    re-serves it as RTSP            │
│    (rtsp://127.0.0.1:8554/{name})  │
│  • Decodes RTSP streams via FFmpeg │
│  • Runs AI object detection        │
│    (person, car, cat, dog …)       │
│  • Stores clips + snapshots        │
│  • Exposes REST API (port 5000)    │
└────────────┬───────────────────────┘
             │ MQTT (frigate/events)
             ▼
┌────────────────────────────────────┐
│        Mosquitto MQTT Broker       │
│  • port 1883 (MQTT)                │
│  • port 9001 (WebSocket)           │
└────────────┬───────────────────────┘
             │ subscribe
             ▼
┌────────────────────────────────────────────────────────┐
│              FastAPI Backend (port 8000)                │
│                                                        │
│  startup:                                              │
│    • parse Frigate config.yml → _last_cameras list     │
│    • asyncio.create_task(health_loop)                  │
│    • asyncio.create_task(mqtt_loop)                    │
│    • asyncio.create_task(ensure_default_user)          │
│                                                        │
│  routers:                                              │
│    auth        — login proxy, JWT decode               │
│    cameras     — list, MJPEG proxy, torch, alias       │
│    discovery   — network scan SSE endpoint             │
│    events      — Frigate events proxy                  │
│    recordings  — clip streaming proxy                  │
│    faces       — face recognition proxy                │
│    users       — Frigate user management proxy         │
│    config      — Frigate config.yml read/write         │
│    system      — network interfaces, GPU info          │
│                                                        │
│  services:                                             │
│    health.py   — 5s poll loop per camera               │
│    mqtt.py     — MQTT subscriber, WS broadcast         │
│    frigate_client.py — auth'd HTTP session to Frigate  │
└────────────────┬───────────────────────────────────────┘
                 │ WebSocket + REST (nginx proxy)
                 ▼
┌─────────────────────────────────────────────────────┐
│         React Dashboard (nginx port 80)              │
│                                                      │
│  Pages (state-based routing):                        │
│    Cameras     — live MJPEG grid, torch, fullscreen  │
│    Health      — battery, stream status per camera   │
│    Discovery   — network scan with SSE log           │
│    Camera Sett.— query params (?key=val), rename     │
│    Events      — Frigate detection event browser     │
│    Recordings  — clip playback, download             │
│    Faces       — face registration, recognition log  │
│    Users       — Frigate user management             │
│    Settings    — Frigate config (decoder, FPS, …)    │
└─────────────────────────────────────────────────────┘
```

---

## Components

### IP Webcam APK

- Android app by Pavel Khlebovich, runs a mini HTTP/RTSP server on the phone
- Port 8080 (default)
- Key endpoints used by SwarmCam:
  - `GET /status.json` — device info, battery, current settings (`curvals`)
  - `GET /videofeed` — MJPEG stream (used for low-latency live view)
  - `GET /settings/{key}?set={value}` — change orientation, quality, resolution, night vision
  - `GET /enabletorch` / `GET /disabletorch` — flashlight control
  - RTSP `rtsp://{ip}:8080/h264_ulaw.sdp` — H.264 stream for Frigate

**Why this APK?** Turns e-waste phones into camera hardware with zero cost. The HTTP API is well-documented and stable across 1.x versions.

---

### Frigate NVR

- Open-source NVR with AI object detection (YOLOv5 variants)
- Connects to cameras via RTSP, runs detection per frame
- Stores clips (MP4) and snapshots (JPEG) locally
- Exposes REST API on port 5000 for events, recordings, user management, stats
- go2rtc is bundled for WebRTC re-streaming (port 1984)
- Publishes detection events to MQTT topic `frigate/events`

**Why Frigate instead of writing our own detection?**  
Writing reliable real-time AI detection from scratch is a thesis project of its own. Frigate is a proven, production-grade NVR that supports CPU and GPU inference. SwarmCam's contribution is the _integration layer_ on top: discovery, health monitoring, the dashboard, and the proxy architecture — not reinventing detection.

**SwarmCam only uses Frigate via API and MQTT.** The Frigate web UI is not used in normal operation.

---

### Mosquitto MQTT Broker

- Lightweight pub/sub message broker
- Frigate publishes every detection event to `frigate/events`
- Backend subscribes and re-broadcasts to WebSocket clients
- Port 1883 (MQTT), 9001 (MQTT over WebSocket)
- Anonymous access enabled (local network only)

**Why MQTT instead of polling Frigate's event API?**  
MQTT is push-based: events arrive at the backend within milliseconds of detection. Polling would add latency and unnecessary load. The broker also decouples Frigate from the backend — if the backend restarts, MQTT queues messages until it reconnects.

---

### FastAPI Backend

Central orchestration layer. All frontend-to-Frigate communication goes through this proxy. The frontend never calls Frigate directly.

**Key responsibilities:**

| Responsibility | Implementation |
|---|---|
| Camera registry | `state._last_cameras: list[dict]` — populated at startup from `config.yml`, updated by discovery |
| Health monitoring | `services/health.py` — 5-second poll loop, pushes to `state._health_cache` and broadcasts via WebSocket |
| MQTT events | `services/mqtt.py` — `aiomqtt` client, transforms Frigate payloads, broadcasts via WebSocket |
| Frigate proxy | `services/frigate_client.py` — persistent `requests.Session` with auto-renewing JWT auth |
| Discovery trigger | `routers/discovery.py` — spawns `discovery.py` as subprocess, streams stderr via SSE |
| MJPEG proxy | `routers/cameras.py` — streams IP Webcam `/videofeed` to the browser via `StreamingResponse` |
| Config management | `services/frigate_config.py` — YAML read/write for `frigate/config.yml`, decoder switching restarts Frigate via docker compose |
| WebSocket hub | `main.py` — `/ws/cameras` endpoint, `state._ws_clients` set, broadcasts from health loop and MQTT loop |

**State is in-memory.**  
`state.py` holds `_last_cameras`, `_ws_clients`, and `_health_cache` as module-level variables. No database. On restart, camera list is restored from `frigate/config.yml`.

**Why no database?**  
The system is self-hosted, single-node, and the camera list is small (typically 2–10). All persistent data (clips, snapshots, events, user accounts) lives in Frigate's database. Adding a separate DB would be over-engineering for the scale.

---

### Discovery Script (`discovery/discovery.py`)

Standalone Python script that scans the local network for IP Webcam instances.

**Algorithm:**
1. Auto-detect or accept `--subnet` (e.g. `192.168.0.0/24`)
2. TCP port-scan all 254 hosts in parallel (128 threads) on port 8080
3. For each open port: HTTP `GET /status.json`
4. Fingerprint: IP Webcam always has `curvals` or `id` in the JSON — if present, it's a camera
5. 2 retry attempts with 0.5s delay (handles slow phones waking up)
6. Extract: battery, resolution, orientation, video connections, night vision
7. Output: JSON to stdout (backend consumes this), progress log to stderr (backend streams as SSE)
8. Optional `--update-frigate`: write new camera entries to `frigate/config.yml`

Camera name format: `cam_{ip_with_dots_replaced_by_underscores}` — e.g. `cam_192_168_0_100`.

---

### React Dashboard

Single-page app (SPA) built with React 18 + TypeScript + Vite. Served by nginx.

**Routing model:** State-based — `useState<SectionId>` in `AppShell`. No React Router or file-based routing. Navigation via sidebar calls `setActiveSection`. This keeps the bundle simple and avoids URL management for what is essentially a local admin UI.

**API communication:** All calls go to `http://localhost/api/...` (same origin, nginx proxies to backend). No hardcoded backend URL in the source — `VITE_API_BASE_URL` env var, defaults to empty string (same-origin).

**Real-time updates:** WebSocket `/ws/cameras` — the `use-camera-socket.ts` hook maintains the connection and dispatches `status`, `frigate_event`, and `alert` messages to the component state.

**Authentication:** JWT token from Frigate (via backend proxy). Stored in React state (not localStorage — expires on page reload, intentional for security). The `AuthProvider` context exposes `token` and `user` to all pages.

---

## Data Flow Details

### 1. Discovery

```
User clicks "Scan" in dashboard
  → POST /api/discover/stream (SSE)
  → Backend spawns discovery.py subprocess
  → discovery.py: TCP scan → /status.json fingerprint
  → stderr lines → backend SSE → dashboard log display
  → discovery.py stdout: JSON camera list
  → Backend: state._last_cameras updated
  → If update_frigate=true: config.yml rewritten, Frigate restarted
  → SSE "result" event: camera cards appear in dashboard
```

### 2. Health Monitoring

```
Backend startup → asyncio.create_task(health_loop())

Every 5 seconds:
  for each camera in state._last_cameras:
    GET http://{ip}:{port}/status.json (timeout 2s)
    → parse battery, charging, temp, free space,
         video_connections, night_vision, quality
    → update state._health_cache[ip]
    → if charging state changed: broadcast alert via WebSocket

  Broadcast to all WebSocket clients:
    {"type": "status", "cameras": [...health data...]}

Dashboard WebSocket handler:
  → updates camera card health indicators in real-time
```

### 3. Live Video (MJPEG)

```
User opens camera card → clicks LIVE button
  → <img src="/api/cameras/{name}/stream">

nginx → proxy_pass → Backend GET /api/cameras/{name}/stream
  → find camera in state._last_cameras → get ip, port
  → GET http://{ip}:{port}/videofeed (blocking, streamed)
  → StreamingResponse: yield 8192-byte chunks
  → Browser <img> renders MJPEG frames natively

Latency: ~0.1s (no transcoding, no buffering, direct proxy)
```

Why MJPEG and not WebRTC (which go2rtc supports)?
- WebRTC requires ICE negotiation, STUN/TURN setup, signaling server
- MJPEG over HTTP works with a plain `<img>` tag — zero client-side complexity
- For a local network at 15 FPS / 720p, MJPEG bandwidth (~2–5 Mbps) is acceptable
- Latency difference is imperceptible for security monitoring use cases

### 4. AI Detection Event Flow

```
Frigate detects object (person/car/cat/dog)
  → publishes to MQTT topic "frigate/events":
    {"type": "update", "after": {"id": "...", "camera": "cam_...",
      "label": "person", "score": 0.87, ...}}

Backend mqtt_loop (aiomqtt):
  → receives message
  → transforms to: {"type": "frigate_event", "camera": "...",
                     "label": "person", "score": 0.87, "id": "..."}
  → broadcast to all WebSocket clients

Dashboard (use-camera-socket.ts):
  → "frigate_event" message → addLiveEvent(event)
  → Event Feed Panel updates with thumbnail + metadata
```

### 5. Auth Flow

```
User enters credentials in login overlay
  → POST /api/auth/login {user, password}
  → Backend proxies to Frigate POST /api/login
  → Frigate returns JWT in Set-Cookie: frigate_token=...
  → Backend extracts cookie value, returns {"token": "..."}
  → Dashboard stores token in React state (AuthContext)
  → All subsequent API calls: Authorization: Bearer {token}
  → Backend-to-Frigate calls: use separate persistent session
      (frigate_client.py maintains its own auth, auto-renews)
```

The backend maintains **two independent auth sessions**:
1. The user's JWT (passed through from frontend, decoded for role check)
2. The backend's own admin session (used for health polling, config reads, etc.)

---

## Design Decisions

| Decision | Choice | Alternative | Reason |
|---|---|---|---|
| Live video | MJPEG proxy | WebRTC (go2rtc) | Zero client setup, `<img>` tag works natively, sufficient for LAN |
| State storage | In-memory | SQLite / Redis | Single-node, small scale, Frigate owns persistent data |
| Frontend routing | State-based `useState` | React Router | Local admin UI, no deep linking needed, simpler bundle |
| Backend-Frigate auth | Persistent session | Pass user token through | Backend needs auth for health/stats polling without user involvement |
| Discovery | Subprocess SSE | Library / in-process | `discovery.py` runs as standalone script (testable, portable); SSE gives live log streaming |
| CPU detector default | `cpu` type in Frigate | `nvidia` / `coral` | Maximizes portability — works on any machine, GPU optional |
| Camera naming | `cam_{ip_underscored}` | UUID / sequential | Deterministic — same camera always gets same name, survives restarts |
