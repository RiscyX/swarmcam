# SwarmCam

Elosztott biztonsági kamerarendszer Android eszközökre épülő szenzor swarm és Docker-alapú self-hosted backend segítségével. Szakdolgozat projekt.

## Architektúra

```
IP Webcam APK (Android)
        │ RTSP stream
        ▼
Frigate NVR (AI detekció)
        │ MQTT events
        ▼
Mosquitto MQTT broker
        │ subscribe
        ▼
Python FastAPI backend (logika, discovery, API)
        │ WebSocket / REST
        ▼
Dashboard (live view, health monitoring, discovery)
```

## Tech stack

| Komponens | Leírás |
|---|---|
| **Frigate NVR** | AI alapú mozgás/személy/autó detekció, RTSP feldolgozás |
| **Mosquitto MQTT** | Eseményközvetítés komponensek között |
| **Docker + Compose** | Minden szolgáltatás containerben fut |
| **Python FastAPI** | Backend API, MQTT feliratkozás, WebSocket |
| **IP Webcam APK** | Android telefonokat alakít RTSP kamerává |

## Mappastruktúra

```
swarmcam/
├── docker/
│   ├── docker-compose.yml       # Összes service definíció
│   ├── frigate/
│   │   └── config.yml           # Frigate kamera + detektor konfig
│   └── mosquitto/
│       └── mosquitto.conf       # MQTT broker konfig
├── discovery/
│   └── discovery.py             # Automatikus node discovery (hálózat scan + IP Webcam fingerprint)
├── backend/
│   └── main.py                  # FastAPI app, MQTT kliens, WebSocket, health monitoring
├── dashboard/
│   └── index.html               # Frontend: live view, discovery gomb, real-time health statuszok
└── docs/                        # Szakdolgozat dokumentáció, architektúra diagramok
```

## Fejlesztési prioritások

1. **`discovery.py`** – automatikus kamera felismerés hálózati scan + IP Webcam API fingerprint alapján
2. **Health monitoring** – akkumulátor szint, stream állapot, offline detekció MQTT-n keresztül
3. **Backend API** – FastAPI, WebSocket push, MQTT integráció, kamera registry
4. **Dashboard** – live RTSP view, discovery trigger gomb, real-time health statuszok

## Fontos megjegyzések

- **Self-hosted, nincs cloud függőség** – minden komponens lokálisan fut
- **Home Assistant nem része a stacknek** – minden saját fejlesztés
- **Dev environment:** laptop (ez a gép)
- **Production szerver:** NUC, Ubuntu 24.04

## Indítás (Docker)

```bash
cd docker
docker compose up -d
```

## Backend futtatása lokálisan

```bash
cd backend
uvicorn main:app --reload
```
