# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

SwarmCam — a self-hosted distributed security camera system. Old Android phones running the **IP Webcam APK** act as camera nodes. A Docker-based server stack (Frigate NVR + MQTT + FastAPI backend + React dashboard) discovers, monitors, and streams these cameras with AI detection. Thesis project — no cloud dependency.

Full architecture: `docs/ARCHITECTURE.md`

---

## Commands

### Backend (FastAPI)
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload          # dev server on :8000
uvicorn main:app --reload --port 8001  # if 8000 is taken
```

Env vars (all have defaults, see `backend/settings.py`):
```bash
FRIGATE_URL=http://localhost:5000
MQTT_HOST=localhost
MQTT_PORT=1883
DEFAULT_USER=admin
DEFAULT_PASSWORD=admin
```

### Frontend (React + Vite)
```bash
cd frontend
pnpm dev       # dev server on :5173 (proxies /api → :8000 via vite.config)
pnpm build     # tsc + vite build → dist/
pnpm lint      # eslint
```

Set `VITE_API_BASE_URL` to point to a non-localhost backend.

### Docker (all services)
```bash
cd docker
docker compose up -d       # full stack: frigate, mosquitto, backend, dashboard
docker compose logs -f backend
docker compose restart frigate
```

### Discovery script (standalone)
```bash
cd backend
python ../discovery/discovery.py --subnet 192.168.0.0/24
python ../discovery/discovery.py --update-frigate   # also rewrites docker/frigate/config.yml
python ../discovery/xm_discovery.py --subnet 192.168.0.0/24  # XM/Sofia protocol cameras
```

---

## Architecture

### Stack overview

```
Android phones (IP Webcam APK, port 8080)
  │ RTSP h264_ulaw.sdp
  ▼
Frigate NVR (port 5000) — AI detection, clips, snapshots
  │ publishes to MQTT "frigate/events"
  ▼
Mosquitto MQTT (port 1883)
  │ subscribed by backend
  ▼
FastAPI backend (port 8000)
  │ WebSocket /ws/cameras  +  REST /api/*
  ▼
React dashboard (nginx port 80 in Docker, :5173 in dev)
```

### Backend structure (`backend/`)

```
main.py          — FastAPI app init, WebSocket endpoint, startup tasks
state.py         — In-memory state: _last_cameras, _ws_clients, _health_cache
settings.py      — All config constants + env var overrides (single source of truth)
routers/         — FastAPI routers (one per domain)
  auth.py        — Login proxy to Frigate, JWT decode
  cameras.py     — Camera list, MJPEG proxy, torch, alias, settings
  discovery.py   — SSE endpoint that spawns discovery.py subprocess
  events.py      — Frigate events/thumbnails proxy
  recordings.py  — Clip streaming + download proxy
  faces.py       — Face recognition proxy
  users.py       — Frigate user management proxy
  config.py      — Frigate config.yml read/write API
  system.py      — Network interfaces, GPU/docker info
services/
  health.py      — 5s poll loop: GET /status.json per camera → broadcasts via WS
  mqtt.py        — aiomqtt subscriber, re-broadcasts Frigate events via WS
  frigate_client.py — Persistent requests.Session with auto-renewing JWT to Frigate
  frigate_config.py — YAML read/write helpers + ConfigSettings model
  setup.py       — Ensures default Frigate admin user exists at startup
```

**State is in-memory.** `state.py` holds module-level globals — no database. Camera list is restored at startup by parsing `docker/frigate/config.yml`. Aliases are persisted to `backend/aliases.json`.

### Non-obvious design decisions

**Two independent auth sessions to Frigate:**
- User's JWT: passed from frontend → `Authorization: Bearer` header → backend proxies to Frigate
- Backend's own admin session: `services/frigate_client.py` maintains a persistent `requests.Session` with its own credentials (used for health polling, stats, config — things that happen without user involvement). Auto-renews every ~23h.

**Discovery runs as a subprocess:**
`routers/discovery.py` spawns `discovery/discovery.py` as a subprocess. Backend streams the subprocess's stderr line-by-line to the frontend as Server-Sent Events. This means `discovery.py` is testable standalone and the SSE gives live scan progress.

**MJPEG, not WebRTC:**
Live video is a direct HTTP proxy: `GET /api/cameras/{name}/stream` → `GET http://{ip}:{port}/videofeed` from IP Webcam. The browser's `<img>` tag handles MJPEG natively. ~0.1s latency, zero client-side complexity. go2rtc (bundled with Frigate) exists but is not used for the live view.

**Camera naming convention:**
`cam_{ip_with_dots_as_underscores}` — e.g. `cam_192_168_0_100`. Deterministic so the same phone always gets the same name across restarts. The `display_name` overlay (stored in `aliases.json`) is separate from this internal key.

**Frigate uses `network_mode: host`:**
This is required because Frigate processes camera RTSP streams and needs low-latency local network access. The backend also uses host networking so it can reach Frigate on `localhost:5000` without Docker DNS.

**Docker socket mount:**
The backend container mounts `/var/run/docker.sock` so it can run `docker compose restart frigate` when the Frigate config is updated via the settings page.

### Frontend structure (`frontend/src/`)

```
App.tsx            — AuthProvider wraps AppShell, that's it
components/
  app-shell.tsx    — Main layout: sidebar + page outlet; owns activeSection state
  camera-card.tsx  — Camera tile with MJPEG live/snapshot toggle, torch, rename
  event-feed-panel.tsx — Slide-in panel with Frigate detection events
  ...
pages/             — One component per sidebar section
hooks/
  use-auth.tsx     — AuthContext: token, user, login/logout
  use-camera-socket.ts — WebSocket /ws/cameras: status/event/alert dispatch
  use-cameras.ts   — REST fetch + socket merge for camera list
  use-discovery-stream.ts — SSE consumer for discovery progress
lib/
  api.ts           — apiFetch wrapper, ApiError, wsUrl helper
  cameras.ts / events.ts / ... — domain-specific API calls
types/
  camera.ts / events.ts — TypeScript types shared across components
```

**Routing is state-based.** `app-shell.tsx` holds `activeSection: SectionId` — no React Router. The dashboard is a local admin UI with no deep-link requirements.

**Auth:** JWT stored in React context (memory only, not localStorage). Intentional — expires on page reload. 401 from any API call triggers logout. 503 (Frigate down) does not log out.

---

## What NOT in scope

- Writing AI/motion detection (Frigate handles this)
- Using the Frigate web UI — SwarmCam uses only Frigate's REST API and MQTT output
- Cloud dependencies of any kind
- Home Assistant integration
