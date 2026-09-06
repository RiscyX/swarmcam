# SwarmCam

A distributed security camera system built on an Android device sensor swarm and a Docker-based self-hosted backend. Bachelor's thesis project.

## What is this?

SwarmCam turns old Android phones into security cameras. Each phone runs the open-source **Android IP Camera** app from F-Droid, which exposes an H.264 video stream and an HTTPS status/control API. The system automatically discovers these cameras on the local network, registers them with the **Frigate NVR** (AI detection, recording), and presents everything in a custom dashboard.

**No cloud, no subscription.** Every component runs locally in Docker containers.

```
Android phones (Android IP Camera, port 4444)
        │ HTTPS: /video/h264 + /info.json
        ▼
Frigate NVR ──── go2rtc
(AI detection,          │ restreams H.264 as RTSP
 recording)             │
        │ MQTT events
        ▼
Mosquitto MQTT broker
        │ subscribe
        ▼
FastAPI backend  ←──── Discovery script
(health monitoring,
 Frigate proxy, WS push)
        │ WebSocket / REST
        ▼
SwarmCam Dashboard
(live view, discovery, events,
 recordings, settings)
```

## Quick Start

### Prerequisites

- Docker + Docker Compose v2
- Linux host (tested on Ubuntu 24.04)
- Nvidia GPU optional (CPU detector also available)

### 1. Clone the repo

```bash
git clone <repo-url>
cd Szakdoga
```

### 2. Start with Docker

```bash
cd docker
docker compose up -d
```

This starts four containers:

| Container | Ports | Role |
|---|---|---|
| `frigate` | 5000 (UI/API), 1984 (go2rtc), 8554 (RTSP) | AI NVR, stream management |
| `mosquitto` | 1883 (MQTT), 9001 (WebSocket) | Event message broker |
| `swarmcam-backend` | 8000 | FastAPI REST + WebSocket backend |
| `swarmcam-dashboard` | 80 | Nginx serving the frontend SPA |

### 3. First login

1. Open `http://localhost:5000` → create a Frigate user account (sets up the auth system)
2. Open `http://localhost` → SwarmCam dashboard
3. Log in with the credentials you just created

> **Note:** If you skip the Frigate user setup step, the backend will try to authenticate with the default `admin / admin` credentials. If you chose different credentials, update `DEFAULT_USER` / `DEFAULT_PASSWORD` in `backend/settings.py`, or pass them as environment variables in `docker-compose.yml`.

### 4. Add cameras

Install **[Android IP Camera](https://f-droid.org/packages/com.github.digitallyrefined.androidipcamera/)** from F-Droid on each Android phone. In the app settings, turn **authentication off** (LAN-only), enable start-on-boot, then start the server (default port: 4444). TLS can stay on — the app serves HTTPS with a self-signed certificate by default and SwarmCam accepts it. Then in the dashboard:

1. Click the **"Discovery"** button in the sidebar
2. Select the network interface to scan
3. Check **"Update Frigate config"** to auto-register found cameras
4. Click **"Scan"** — the SSE log streams live progress
5. Found cameras appear as cards on the dashboard immediately

## Stopping the stack

```bash
cd docker
docker compose down
```

To preserve recorded media and the Frigate database, do **not** use `-v`:
```bash
# Safe: keeps volumes
docker compose down

# Destructive: wipes recordings and DB
docker compose down -v
```

## Monitoring

```bash
# All containers and their status
docker ps

# Live backend logs
docker logs swarmcam-backend -f

# Live Frigate logs
docker logs frigate -f
```

## Important URLs

| URL | What |
|---|---|
| `http://localhost` | SwarmCam dashboard |
| `http://localhost:8000/docs` | FastAPI Swagger UI — all endpoints documented |
| `http://localhost:5000` | Frigate NVR (only needed for initial user setup) |
| `http://localhost:1984` | go2rtc admin panel (RTSP / WebRTC stream info) |

## Repository layout

```
Szakdoga/
├── docker/
│   ├── docker-compose.yml       # All service definitions
│   ├── frigate/
│   │   └── config.yml           # Frigate camera + detector config (auto-updated by discovery)
│   └── mosquitto/
│       └── mosquitto.conf       # MQTT broker config
├── backend/
│   ├── main.py                  # FastAPI app entry point, WebSocket endpoint, startup tasks
│   ├── settings.py              # Config: URLs, file paths, intervals
│   ├── state.py                 # In-memory global state (camera list, WS clients, health cache)
│   ├── aliases.json             # Persisted camera display name overrides
│   ├── routers/                 # One file per API domain
│   │   ├── auth.py              # Login proxy, JWT decode, current-user dependency
│   │   ├── cameras.py           # Camera list, snapshot, MJPEG stream, torch, alias, settings
│   │   ├── config.py            # Frigate config.yml read/write, decoder switching
│   │   ├── discovery.py         # Discovery SSE endpoint, camera reset
│   │   ├── events.py            # Frigate events proxy (list, stats, thumbnail)
│   │   ├── recordings.py        # Recordings list, MP4 clip streaming proxy
│   │   ├── system.py            # Network interfaces, GPU detection, debug health dump
│   │   └── users.py             # Frigate user management proxy (list, create, password, delete)
│   └── services/
│       ├── frigate_client.py    # Authenticated persistent HTTP session to Frigate
│       ├── frigate_config.py    # YAML read/write helpers, ConfigSettings model
│       ├── health.py            # 5-second polling loop per camera, WS broadcast
│       ├── mqtt.py              # aiomqtt client, frigate/events subscribe, WS broadcast
│       └── setup.py             # Auto-creates default Frigate user on startup if needed
├── discovery/
│   └── discovery.py             # Network scan + /info.json fingerprinting, Frigate config update
├── frontend/                    # React + Vite + TypeScript dashboard (see frontend/src/)
└── docs/
    ├── ARCHITECTURE.md          # Detailed system architecture and design decisions
    ├── API.md                   # Full REST + WebSocket API reference
    └── FEJLESZTESI_TERV.md      # Development plan (Hungarian)
```

## Running the backend locally (without Docker)

Useful during development when you only want to iterate on the backend:

```bash
cd backend
source venv/bin/activate        # or: source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

The backend expects Frigate and Mosquitto to be reachable. You can run just those two via Docker:

```bash
cd docker
docker compose up frigate mosquitto -d
```

## Related documentation

- [Architecture](docs/ARCHITECTURE.md) — how the components fit together and why
- [API Reference](docs/API.md) — every REST endpoint and WebSocket message
- [Development Plan](docs/FEJLESZTESI_TERV.md) — planned features and implementation notes

## License

The SwarmCam source code is released under the [MIT License](LICENSE).

Third-party components keep their own licenses. Two are worth calling out:

- **`fire-detector/`** imports [Ultralytics](https://github.com/ultralytics/ultralytics)
  YOLOv8, which is **AGPL-3.0**. If you redistribute this service or run it as a
  network service for others, the AGPL terms apply to that combined work — the MIT
  license above covers the SwarmCam code itself, not the Ultralytics dependency.
- **Model weights** (`fire-detector/models/*.pt`) are not distributed with this
  repository and carry the license of whoever published them.

The camera nodes run the [Android IP Camera](https://f-droid.org/packages/com.github.digitallyrefined.androidipcamera/)
app (MIT), which is a separate project and is not vendored here.
