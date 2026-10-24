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
- NVIDIA GPU with the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) — the compose file runs Frigate and the fire detector with `runtime: nvidia`
- `curl` and `sha256sum` for downloading and verifying the fire detection model
- At least 30 GB of free disk space for the images and model-export build cache

### 1. Clone the repo

```bash
git clone https://github.com/RiscyX/swarmcam.git
cd swarmcam
```

### 2. Prepare local files

Run these steps once in a fresh clone. Do not repeat the config, credentials or
aliases commands over an existing installation: they overwrite local settings.
The runtime files and downloaded models are not tracked in Git.

```bash
# Frigate config (cameras are added to it later by Discovery) and credentials
cp docker/frigate/config.example.yml docker/frigate/config.yml
cp docker/.env.example docker/.env          # then set DEFAULT_PASSWORD (at least 12 characters)

# Runtime files the backend container bind-mounts
echo '{}' > backend/aliases.json
touch backend/fire_events.db
mkdir -p backend/fire_snapshots

# Object detection model for Frigate (YOLOv9-s, 320x320) — builds an export image, takes a few minutes
docker/frigate/export-yolov9.sh

# Fire/smoke model for the fire detector, pinned to the verified revision
curl --fail --location -o fire-detector/models/fire_smoke.pt \
  https://huggingface.co/SalahALHaismawi/yolov26-fire-detection/resolve/5397b43994c39c2ed4ef81a6996c6334e2b7a5fa/best.pt
echo "52684ddffd4797f1bc5ff1bd2b72af3ec34eabf0c1646c37f518bb766b27b79f  fire-detector/models/fire_smoke.pt" | sha256sum -c
```

Create the bind-mounted files before the first `up`: if one is missing, Docker creates a
directory in its place and the container cannot use it. The models' sources and licenses
are described in [THIRD_PARTY_LICENSES.md](docs/THIRD_PARTY_LICENSES.md).
The Frigate export script follows the [official YOLOv9 export recipe](https://docs.frigate.video/configuration/object_detectors/).

### 3. Start with Docker

```bash
cd docker
docker compose up -d --build
```

This starts five containers:

| Container | Ports | Role |
|---|---|---|
| `frigate` | 5000 (UI/API), 1984 (go2rtc), 8554 (RTSP) | AI NVR, stream management |
| `mosquitto` | 1883 (MQTT), 9001 (WebSocket) | Event message broker |
| `swarmcam-backend` | 8000 | FastAPI REST + WebSocket backend |
| `swarmcam-dashboard` | 80 | Nginx serving the frontend SPA |
| `swarmcam-fire-detector` | — | Fire/smoke detection, alerts over MQTT |

### 4. First login

Frigate generates its own admin password on first startup. Once Frigate is ready
(`curl --fail http://localhost:5000/api/version` succeeds), run this command from
the `docker` directory **once** to initialize the account from `docker/.env`:

```bash
docker compose exec -T backend python - <<'PY'
from urllib.parse import quote
import requests
from settings import DEFAULT_PASSWORD, DEFAULT_USER, FRIGATE_URL

users = requests.get(f"{FRIGATE_URL}/api/users", timeout=10)
users.raise_for_status()
if any(user["username"] == DEFAULT_USER for user in users.json()):
    response = requests.put(
        f"{FRIGATE_URL}/api/users/{quote(DEFAULT_USER, safe='')}/password",
        json={"password": DEFAULT_PASSWORD}, timeout=20,
    )
else:
    response = requests.post(
        f"{FRIGATE_URL}/api/users",
        json={"username": DEFAULT_USER, "password": DEFAULT_PASSWORD, "role": "admin"},
        timeout=20,
    )
response.raise_for_status()
print("Login account initialized.")
PY
```

This command sets the password even if the account already exists. Changing
`docker/.env` alone later does not reset a user's password.

1. Open `http://localhost` → SwarmCam dashboard
2. Log in with `DEFAULT_USER` / `DEFAULT_PASSWORD` from `docker/.env`

### 5. Add cameras

Install **[Android IP Camera](https://f-droid.org/packages/com.github.digitallyrefined.androidipcamera/)** from F-Droid on each Android phone ([source on GitHub](https://github.com/DigitallyRefined/android-ip-camera), MIT). In the app settings, turn **authentication off** (LAN-only), enable start-on-boot, then start the server (default port: 4444). TLS can stay on — the app serves HTTPS with a self-signed certificate by default and SwarmCam accepts it. Then in the dashboard:

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
| `http://localhost:5000` | Frigate internal API (used by the backend and first-login command) |
| `http://localhost:1984` | go2rtc admin panel (RTSP / WebRTC stream info) |

## Repository layout

```
swarmcam/
├── docker/
│   ├── docker-compose.yml       # All service definitions
│   ├── frigate/
│   │   └── config.example.yml   # Frigate config template → copy to config.yml (git-ignored, updated by discovery)
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
    ├── USER_GUIDE.md            # How to set up a camera phone and use the dashboard
    ├── ARCHITECTURE.md          # Detailed system architecture and design decisions
    ├── API.md                   # Full REST + WebSocket API reference
    └── THIRD_PARTY_LICENSES.md  # Third-party licenses and model provenance
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

- [User Guide](docs/USER_GUIDE.md) — how to set up a camera phone and use the dashboard
- [Architecture](docs/ARCHITECTURE.md) — how the components fit together and why
- [API Reference](docs/API.md) — every REST endpoint and WebSocket message
- [Design Decisions](DECISIONS.md) — major technical decisions and their trade-offs

## Security and responsibility

SwarmCam is a thesis prototype, not a certified security or safety product. Do not
rely on it to protect life or property, and do not expose it to the internet. The
defaults are meant for a trusted LAN only:

- without `docker/.env` the backend falls back to `admin / admin`, which Frigate 0.18+ rejects
  (passwords need at least 12 characters) — always create `docker/.env` with your own password;
- Frigate's internal API on port 5000 has no authentication, and with host networking it is
  reachable from the whole LAN — firewall it if other devices on the network are untrusted;
- Mosquitto allows anonymous clients on ports 1883 and 9001;
- the backend container has access to the Docker socket;
- camera certificates are not verified (the phones use self-signed certificates).

Whoever deploys it is responsible for using cameras lawfully, including data
protection rules (e.g. GDPR) and not recording neighbours or public areas without a
legal basis.

## License

Copyright (c) 2026 Vass Richárd. As of 2026-10-24, the SwarmCam source code is
released under the **GNU Affero General Public License, version 3 only
(AGPL-3.0-only)**; see [LICENSE](LICENSE). It is free and open-source software,
provided without warranty. This choice covers the application together with its
AGPL-licensed Ultralytics integration. Third-party software, model weights and
media retain their own terms; they are not relicensed by this notice.

If you distribute a build, provide the corresponding source under the license's
terms. If you modify the program and let users interact with it over a network,
prominently offer those users the corresponding source of that version at no
charge (AGPL section 13). The dashboard links to this project's source; forks and
modified deployments must update that link to the source they actually run.

Earlier versions released under MIT retain that grant. Their copyright and
permission notice is preserved in [licenses/MIT-legacy.txt](licenses/MIT-legacy.txt).

The fire detector uses a third-party **YOLO26s** checkpoint: its publisher's MIT
declaration and attribution are retained alongside the upstream Ultralytics
AGPL-3.0 obligations. The Frigate ONNX weights were numerically identified as
**WongKinYiu YOLOv9-s**, whose upstream project uses GPL-3.0. These notices are
compatible with the application's AGPL licensing; no MIT-only claim is made for
the combined fire detector. Weights are not tracked in Git. See
[third-party licenses and reproducible model provenance](docs/THIRD_PARTY_LICENSES.md)
for the original notices, checksums, verification and video asset terms.
