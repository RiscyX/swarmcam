# AGENTS.md

## Repo Facts
- SwarmCam is a local-only surveillance system: Android IP Camera devices -> Frigate/Mosquitto -> FastAPI backend -> custom dashboard.
- Do not route live camera viewing through Frigate UI. Dashboard live view uses backend proxy `GET /api/cameras/{name}/stream` to the camera's `/video/mjpeg` MJPEG stream. Camera nodes serve HTTPS with a self-signed certificate — all camera-bound requests use `https://` with `verify=False` (intentional, LAN-only).
- Frigate UI is not part of the product flow; use Frigate REST API and MQTT output only.
- Backend entrypoint is `backend/main.py`; routers live in `backend/routers/`, background loops in `backend/services/`.
- Discovery entrypoint is `discovery/discovery.py`; it scans Android IP Camera `/info.json` (port 4444) and can update `docker/frigate/config.yml` (`cameras:` + `go2rtc.streams:`).
- Current dashboard is legacy static vanilla JS in `dashboard/`; keep it as an archive while the React migration is in progress.
- Planned new frontend goes in `/frontend`, TypeScript + React + shadcn/ui + Tailwind, using `pnpm` only.

## Commands
- Start infra: `cd docker && docker compose up -d`
- Run backend locally: `cd backend && source venv/bin/activate && uvicorn main:app --reload`
- Run discovery manually: `cd discovery && python discovery.py --subnet 192.168.0.0/24 --port 4444 --timeout 1.5`
- Discovery with Frigate config update: `cd discovery && python discovery.py --update-frigate`
- Backend dependencies are in `backend/requirements.txt`; discovery dependencies are in `discovery/requirements.txt`.
- No repo-level test/lint/CI config is currently present; use focused manual verification unless adding project tooling.

## Frontend Migration Rules
- Do not put the React app under `dashboard/`; use `/frontend`.
- Use `pnpm`, not `npm`.
- Commit `pnpm-lock.yaml`.
- Docker/CI builds must install with `pnpm install --frozen-lockfile`; do not let builds rewrite the lockfile.
- Production frontend image should serve built static files only; no `node_modules`, npm, pnpm, or build toolchain in runtime.
- Keep `dashboard/` available until the new `/frontend` fully matches existing functionality.

## Backend / Infra Gotchas
- `backend/settings.py` points to repo-local `docker/frigate/config.yml`, `docker/docker-compose.yml`, and `docker/media`.
- Local backend defaults assume `FRIGATE_URL=http://localhost:5000`, `MQTT_HOST=localhost`, `MQTT_PORT=1883`.
- MQTT failure should not crash backend; `services/mqtt.py` retries every 10s.
- Health polling interval is `HEALTH_INTERVAL = 5`.
- Config save endpoints may rewrite Frigate config and restart/recreate Frigate via Docker Compose.
- `DELETE /api/recordings` is destructive and runs `docker exec frigate rm -rf /media/frigate/recordings/* /media/frigate/clips/*`.
- `docker/docker-compose.yml` currently uses NVIDIA runtime for Frigate; do not remove unless intentionally changing decoder/GPU support.

## API Conventions
- All custom REST endpoints use `/api/...`.
- WebSocket camera health/events endpoint is `/ws/cameras`.
- Auth is a Frigate JWT proxy: frontend logs in through `POST /api/auth/login`, then sends `Authorization: Bearer <token>`.
- Frigate API access from frontend should go through backend proxies, not directly to Frigate.

## Runtime Data
- `docker/media/`, Mosquitto data/logs, Python venvs, and `.env` are ignored runtime/local data.
- `backend/aliases.json` is runtime camera alias data and may appear untracked.
- Playwright screenshots/logs and dashboard screenshots in the root are local artifacts unless explicitly requested.
