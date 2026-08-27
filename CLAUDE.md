# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

SwarmCam — a self-hosted distributed security camera system. Old Android phones running the **Android IP Camera app** (F-Droid: `com.github.digitallyrefined.androidipcamera`) act as camera nodes. A Docker-based server stack (Frigate NVR + MQTT + FastAPI backend + React dashboard) discovers, monitors, and streams these cameras with AI detection. Thesis project — no cloud dependency.

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
Android phones (Android IP Camera app, port 4444)
  │ HTTPS H.264 (/video/h264, self-signed) → go2rtc restream
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
  cameras.py     — Camera list, MSE relay + MJPEG fallback, torch, alias, settings
  discovery.py   — SSE endpoint that spawns discovery.py subprocess
  events.py      — Frigate events/thumbnails proxy
  recordings.py  — Clip streaming + download proxy
  users.py       — Frigate user management proxy
  config.py      — Frigate config.yml read/write API
  system.py      — Network interfaces, GPU/docker info
services/
  health.py      — 5s poll loop: GET /info.json per camera → broadcasts via WS
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

**Live video is go2rtc MSE, not MJPEG or WebRTC:**
`WS /ws/cameras/{name}/mse` relays the Frigate-embedded go2rtc's MSE feed (`ws://localhost:1984/api/ws?src=<name>`) to the browser as fMP4 segments, played through a `MediaSource`. go2rtc repackages the phone's H.264 without re-encoding, so live view runs at the phone's native resolution, independent of the detect resolution/fps, at 0.03–0.07s latency and ~2 percentage points of Frigate CPU per viewer.

The `/ws/` prefix is load-bearing: the dashboard nginx only passes the WebSocket `Upgrade` header on `/ws/`, not on `/api/`.

The older MJPEG proxy (`GET /api/cameras/{name}/stream`, proxying Frigate's `/api/<camera>` debug feed) is still there as the fallback after 3 failed MSE attempts, and still backs the FOCUS-mode filmstrip thumbnails. It serves the detect resolution and costs a CPU JPEG encoder per viewer.

**Live frame rate is capped by the phone, not the server.** Android auto-exposure drops the sensor frame rate in low light — measured 0.9 fps dark vs 16.6 fps with the torch on. Don't chase this server-side.

**Rotated cameras need `preset-rtsp-generic`, not `preset-rtsp-restream`:**
Rotation happens in go2rtc (`ffmpeg:<name>_raw#video=h264#rotate=N#hardware=cuda`), because the
phone's `/video/h264` ignores its own rotate setting. That re-encode drops the timestamps — the
restream arrives with `90k tbr` and every frame carries a near-zero PTS. Frigate's record role
(`-c:v copy`) still works, so the symptom looks fine from the outside, but the detect role's
`-vf fps=5` filter selects on PTS and emits *nothing*: `Output file is empty, nothing was encoded`,
camera_fps 0, and `/tmp/cache` fills with unprocessed segments. `preset-rtsp-generic` adds
`-fflags +genpts -use_wallclock_as_timestamps 1` and fixes it. Passthrough (unrotated) cameras keep
`preset-rtsp-restream` — they carry their own timestamps. `apply_settings()` picks the preset per
camera based on `camera_rotation()`.

Whatever preset is used, `input_args` must be *exactly* the preset name. Frigate only substitutes a
preset on an exact match; anything like `-rtsp_transport tcp preset-rtsp-restream` is passed through
verbatim, ffmpeg then reads the preset name as an output filename and every camera crash-loops.

**Rotation encodes on NVENC:** `#hardware=cuda` makes go2rtc decode on NVDEC and encode with
`h264_nvenc` (the transpose stays on CPU — this ffmpeg build has no `transpose_npp`). Measured on
720p25: libx264 44% of a core vs NVENC 6%, output pixel-identical to the software transpose
(PSNR 44.7 dB / SSIM 0.993). With three rotated cameras this is the difference between ~590% and
~130% container CPU.

**Detect resolution is not free:** Frigate runs motion detection on full detect-resolution frames in
Python. A camera left at `detect: 4096x3072` cost 290% CPU in `frigate.process:<cam>` alone while its
stream was really 720p (H.264 level 3.1 caps at 1280x720). The settings-page dropdown only offers
640x360 / 1280x720 / 1920x1080; anything else in `config.yml` is stale and worth checking.

**Camera naming convention:**
`cam_{ip_with_dots_as_underscores}` — e.g. `cam_192_168_0_100`. Deterministic so the same phone always gets the same name across restarts (and across the IP Webcam → Android IP Camera protocol swap, so `aliases.json` needed no migration). The `display_name` overlay (stored in `aliases.json`) is separate from this internal key.

**Frigate uses `network_mode: host`:**
This is required because Frigate processes camera RTSP streams and needs low-latency local network access. The backend also uses host networking so it can reach Frigate on `localhost:5000` without Docker DNS.

**Docker socket mount:**
The backend container mounts `/var/run/docker.sock` so it can run `docker compose restart frigate` when the Frigate config is updated via the settings page.

### Frontend structure (`frontend/src/`)

```
App.tsx            — AuthProvider wraps AppShell, that's it
components/
  app-shell.tsx    — Main layout: sidebar + page outlet; owns activeSection state
  camera-card.tsx  — Camera tile with MSE live/snapshot toggle, torch, rename
  event-feed-panel.tsx — Slide-in panel with Frigate detection events
  ...
pages/             — One component per sidebar section
hooks/
  use-auth.tsx     — AuthContext: token, user, login/logout
  use-camera-socket.ts — WebSocket /ws/cameras: status/event/alert dispatch
  use-mse-stream.ts — go2rtc MSE player: fMP4 → MediaSource, buffer trim + live-edge seek; also reports the live stream fps
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
