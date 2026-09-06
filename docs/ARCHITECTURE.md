# SwarmCam — System Architecture

## Overview

SwarmCam is a self-hosted, distributed security camera system. Old Android phones running the **Android IP Camera app** act as camera nodes. A server-side stack (Frigate NVR, MQTT broker, FastAPI backend, React dashboard) discovers, monitors, and presents these cameras with AI-based detection and live video streaming.

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
│    cameras     — list, MSE relay, torch, alias         │
│    discovery   — network scan SSE endpoint             │
│    events      — Frigate events proxy                  │
│    recordings  — clip streaming proxy                  │
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
│    Cameras     — live H.264 grid, torch, fullscreen  │
│    Health      — battery, stream status per camera   │
│    Discovery   — network scan with SSE log           │
│    Camera Sett.— query params (?key=val), rename     │
│    Events      — Frigate detection event browser     │
│    Recordings  — clip playback, download             │
│    Users       — Frigate user management             │
│    Settings    — Frigate config (decoder, FPS, …)    │
└─────────────────────────────────────────────────────┘
```

---

## Components

### Android IP Camera app

- Open-source (MIT) Android app, distributed on F-Droid as `com.github.digitallyrefined.androidipcamera`. Runs a mini HTTP server on the phone.
- Port 4444 (default), **HTTPS with a self-signed certificate** — TLS is on out of the box (the `tls_version` preference defaults to `1.3`). SwarmCam accepts the certificate without verification; see `DECISIONS.md`.
- Requires Android 7.0 or newer.
- Key endpoints used by SwarmCam:
  - `GET /info.json` — camera sensors, battery percentage, Wi-Fi strength, current settings
  - `GET /video/mjpeg` — MJPEG stream (used for low-latency live view)
  - `GET /video/h264` — raw Annex-B H.264 stream, consumed by go2rtc (the app serves no RTSP of its own)
  - `GET /?{key}={value}` — change rotation, resolution, fps, mirror, active camera; several keys in one request
  - `GET /?torch=on|off` — flashlight control
  - `GET /control/start|stop|status` — enable/disable the media routes without touching the device

**Why this app?** Turns e-waste phones into camera hardware with zero cost, and unlike the previously used IP Webcam APK it is open source and installable without the Play Store. See `DECISIONS.md` (D-001) for the full rationale and the telemetry given up in the swap.

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
| Live video relay | `routers/cameras.py` — `/ws/cameras/{name}/mse` relays go2rtc's fMP4 stream to the browser; the older MJPEG proxy at `/api/cameras/{name}/stream` remains as fallback |
| Config management | `services/frigate_config.py` — YAML read/write for `frigate/config.yml`, decoder switching restarts Frigate via docker compose |
| WebSocket hub | `main.py` — `/ws/cameras` endpoint, `state._ws_clients` set, broadcasts from health loop and MQTT loop |

**State is in-memory.**  
`state.py` holds `_last_cameras`, `_ws_clients`, and `_health_cache` as module-level variables. No database. On restart, camera list is restored from `frigate/config.yml`.

**Why no database?**  
The system is self-hosted, single-node, and the camera list is small (typically 2–10). All persistent data (clips, snapshots, events, user accounts) lives in Frigate's database. Adding a separate DB would be over-engineering for the scale.

---

### Discovery Script (`discovery/discovery.py`)

Standalone Python script that scans the local network for Android IP Camera instances.

**Algorithm:**
1. Auto-detect or accept `--subnet` (e.g. `192.168.0.0/24`)
2. TCP port-scan all 254 hosts in parallel (128 threads) on port 4444
3. For each open port: HTTPS `GET /info.json` (self-signed certificate accepted)
4. Fingerprint: the response always has both `cameras` and `settings` — if present, it's a camera
5. 2 retry attempts with 0.5s delay (handles slow phones waking up)
6. Extract: battery percentage, Wi-Fi strength, resolution, orientation
7. Output: JSON to stdout (backend consumes this), progress log to stderr (backend streams as SSE)
8. Optional `--update-frigate`: write new entries to **both** the `cameras:` and the `go2rtc.streams:` section of `frigate/config.yml`

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
  → discovery.py: TCP scan → /info.json fingerprint (HTTPS)
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
    GET https://{ip}:{port}/info.json (timeout 2s)
    → parse battery percentage, Wi-Fi strength, orientation
         (from the active camera's lensSettings.rotate)
    → update state._health_cache[ip]

  Broadcast to all WebSocket clients:
    {"type": "status", "cameras": [...health data...]}

Dashboard WebSocket handler:
  → updates camera card health indicators in real-time
```

### 3. Live Video (go2rtc MSE)

```
User opens camera card
  → <video> + MediaSource, WebSocket to /ws/cameras/{name}/mse

nginx (/ws/ location — the only one that passes the Upgrade header)
  → Backend WebSocket /ws/cameras/{name}/mse
  → relays to go2rtc ws://localhost:1984/api/ws?src={name}
  → go2rtc repackages the phone's H.264 into fMP4 segments (no re-encode)
  → Browser appends segments to a SourceBuffer, native H.264 decode

Latency: 0.03–0.07s measured, at the phone's native resolution
```

Why MSE and not the Frigate MJPEG feed it replaced?

The old path proxied Frigate's `/api/<camera>` debug feed, which re-encodes
*detect* frames to JPEG on the CPU. That tied live view to the detect
resolution and detect fps, and cost a JPEG encoder per viewer:

| | MJPEG (old) | MSE (current) |
|---|---|---|
| Resolution | detect size (640x360) | phone native (1280x720) |
| Frame rate | 3.5 fps | phone rate (light-limited, see below) |
| Frigate CPU per viewer | +26 percentage points | +2 percentage points |

Why MSE and not WebRTC (which go2rtc also supports)? WebRTC needs ICE
negotiation and a UDP candidate port; MSE runs over the WebSocket that
already passes through the existing nginx and backend auth path, with the
same H.264 passthrough and no measurable latency penalty on a LAN.

**The frame rate ceiling is the phone, not the server.** Android
auto-exposure lengthens exposure time in low light, which drops the sensor
frame rate. Measured on one node by toggling its torch: 0.9 fps dark,
16.6 fps lit. No server-side change affects this.

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

### 6. Camera Rotation

The phone's own `rotate=` setting does **not** rotate `/video/h264`. The frame
keeps its original size and orientation; the app merely scales the picture down
and pillarboxes it into that frame, costing resolution and adding black bars.
Rotation is therefore applied **in the go2rtc pipeline**, and the backend pushes
`rotate=0` to the phone whenever it sets an orientation, so the two never stack.

```
Rotation off (default) — no transcoding:
  go2rtc: cam_x → https://{ip}:4444/video/h264

Rotation on (90/180/270):
  go2rtc: cam_x_raw → https://{ip}:4444/video/h264
          cam_x     → ffmpeg:cam_x_raw#video=h264#rotate=90
                      (libx264 transpose; go2rtc cannot read the phone's
                       self-signed HTTPS stream directly, so it chains
                       off the raw stream)

Frigate consumes rtsp://127.0.0.1:8554/cam_x either way, so detect,
recordings, snapshots, the Frigate UI and the dashboard's live view all
inherit the rotation from one place.
```

- The rotation lives in the `#rotate=N` fragment of the go2rtc source string —
  `docker/frigate/config.yml` is the single source of truth, no extra state file.
- `POST /api/cameras/{name}/settings` with `orientation` writes the config and
  restarts Frigate (Frigate re-reads `config.yml` only at startup).
- A rotated camera gets **no** `detect.width`/`height` — both are optional and
  Frigate reads the real resolution off the stream. Writing a fixed size there
  would letterbox the picture, because the phone's resolution is not known ahead
  of time (`streamRes: auto`) and no longer matches once the axes swap.
- `discovery.py` writes the phone URL into `cam_x_raw` when that stream exists,
  so re-running discovery does not drop the rotation.
- **No `#hardware` flag.** With it, go2rtc builds
  `-hwaccel cuda -hwaccel_output_format nv12 … -vf transpose=N,hwupload` and
  `h264_nvenc`, and that chain does not rotate at all — it scales the source to
  the rotated frame size and pads the rest black. The same `transpose=N` in
  software is correct, so a rotated camera re-encodes with libx264. Only
  cameras that actually need rotation pay for it.

**Rotation cannot fix a portrait-oriented phone.** The app encodes at the
configured `streamRes` and fits the *device's current screen orientation* into
that frame — a phone whose screen rotation is locked to portrait produces
portrait content pillarboxed into 1280x720, measured at 68% of the frame lost to
black bars. Rotating that in go2rtc only turns pillarbox into letterbox; the
pixels are already gone. The fix is on the phone: let the app render landscape
(unlock screen rotation), then leave the camera at rotation 0 and get the full
frame with no transcode at all.

---

## Design Decisions

| Decision | Choice | Alternative | Reason |
|---|---|---|---|
| Live video | go2rtc MSE over WebSocket | WebRTC; Frigate MJPEG feed | H.264 passthrough with no re-encode, decoupled from detect resolution/fps; no ICE or UDP port needed |
| State storage | In-memory | SQLite / Redis | Single-node, small scale, Frigate owns persistent data |
| Frontend routing | State-based `useState` | React Router | Local admin UI, no deep linking needed, simpler bundle |
| Backend-Frigate auth | Persistent session | Pass user token through | Backend needs auth for health/stats polling without user involvement |
| Discovery | Subprocess SSE | Library / in-process | `discovery.py` runs as standalone script (testable, portable); SSE gives live log streaming |
| CPU detector default | `cpu` type in Frigate | `nvidia` / `coral` | Maximizes portability — works on any machine, GPU optional |
| Camera rotation | go2rtc `#rotate` transcode | Frigate `output_args` transpose | One transcode feeds every consumer; Frigate's own UI live view reads go2rtc, so a Frigate-side filter would miss it |
| Camera naming | `cam_{ip_underscored}` | UUID / sequential | Deterministic — same camera always gets same name, survives restarts |
