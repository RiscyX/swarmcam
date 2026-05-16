# SwarmCam

Elosztott biztonsági kamerarendszer Android eszközökre épülő szenzor swarm és Docker-alapú self-hosted backend segítségével. Szakdolgozat projekt.

## Architektúra

```
Android telefonok (IP Webcam APK)
        │ RTSP stream
        ▼
Frigate NVR  ──── go2rtc (WebRTC streaming)
(AI detekció,      │
 RTSP kezelés)     │ stream URL-ek
        │          ▼
        │ MQTT events + API
        ▼
Mosquitto MQTT broker
        │ subscribe
        ▼
Python FastAPI backend
(discovery, health monitoring,
 user management, Frigate API kliens)
        │ WebSocket / REST
        ▼
Saját Dashboard
(live kamerakép, health státuszok,
 discovery, user management)
```

**Fontos:** A Frigate UI-t nem használjuk – csak a Frigate REST API-ját és MQTT kimenetét.  
A kameraképek go2rtc WebRTC stream URL-eken jelennek meg a dashboardon.

## Saját fejlesztés (a dolgozat lényege)

| Komponens | Leírás |
|---|---|
| **Node discovery** | Hálózat scan + IP Webcam `/status.json` fingerprint alapú automatikus kamera felismerés |
| **Health monitoring** | Akkumulátor %, stream állapot, offline detekció MQTT-n keresztül |
| **FastAPI backend** | REST API, WebSocket push, MQTT kliens, Frigate API integráció, kamera registry |
| **Dashboard** | Live kamerakép (go2rtc), discovery gomb, health statuszok, user management UI |
| **User management** | JWT alapú authentikáció |

## Tech stack

| Komponens | Leírás |
|---|---|
| **IP Webcam APK** | Android telefonokat alakít RTSP kamerává |
| **Frigate NVR** | AI alapú mozgás/személy/autó detekció, RTSP feldolgozás – csak API + MQTT |
| **go2rtc** | WebRTC streaming (Frigate része) |
| **Mosquitto MQTT** | Eseményközvetítés komponensek között |
| **Docker + Compose** | Minden szolgáltatás containerben fut |
| **Python FastAPI** | Backend API, MQTT feliratkozás, WebSocket, Frigate API integráció |

## Amit NEM csinálunk

- Frigate UI használata
- Home Assistant (kiesett a stackből)
- Cloud függőség
- Saját AI/motion detection írása

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
│   └── main.py                  # FastAPI app, MQTT kliens, WebSocket, Frigate API, health monitoring
├── dashboard/
│   └── index.html               # Frontend: live view (go2rtc), discovery gomb, health statuszok, user mgmt
└── docs/                        # Szakdolgozat dokumentáció, architektúra diagramok
```

## Implementációs állapot

### Kész / működő
| Komponens | Állapot | Megjegyzés |
|---|---|---|
| `discovery/discovery.py` | ✅ Kész | Hálózat scan, IP Webcam fingerprint, Frigate config update |
| `backend/main.py` – health polling | ✅ Kész | 5s polling, `/status.json`, WebSocket broadcast |
| `backend/main.py` – MQTT loop | ✅ Kész | `aiomqtt`, feliratkozva `frigate/events`, broadcast WS klienseknek |
| `backend/main.py` – auth | ✅ Kész | Frigate auth proxy: `POST /api/auth/login`, `GET /api/auth/me` |
| `backend/main.py` – snapshot | ✅ Kész | Frigate latest.jpg proxy; offline esetén 1×1 GIF placeholder (nincs ORB hiba) |
| `backend/main.py` – config API | ✅ Kész | Frigate config.yml olvasás/írás, decoder/FPS/res/transport/retention; `frigate_restarted` státusz visszaadva |
| `backend/main.py` – discovery SSE | ✅ Kész | `POST /api/discover/stream` Server-Sent Events |
| `dashboard/index.html` – login overlay | ✅ Kész | Frigate tokennel, localStorage, logout gomb; token csak 401-re törlődik (503 nem dob ki) |
| `dashboard/index.html` – kamera kártyák | ✅ Kész | Health adatok, snapshot 3s refresh, RTSP URL copy; battery `undefined%` javítva |
| `dashboard/index.html` – discovery UI | ✅ Kész | SSE log, hálózat select, Frigate config frissítés checkbox; üres scan nem törli a meglévő kártyákat |
| `dashboard/index.html` – settings panel | ✅ Kész | Decoder, FPS, felbontás, transport, objektumok, retention; pontos restart-státusz üzenet |
| `docker/docker-compose.yml` | ✅ Kész | Frigate + Mosquitto + dashboard (nginx, port 80) + go2rtc port 1984 |
| `docker/mosquitto/mosquitto.conf` | ✅ Kész | 1883 MQTT + 9001 WebSocket, anonymous allow |
| **Playwright tesztelés** | ✅ Kész | 7 bug megtalálva és javítva (commit: `9a7e464`) |

### Playwright tesztelésen talált és javított bugok (2026-05-17)
| # | Hiba | Javítás helye |
|---|---|---|
| 1 | Login: nyers Python exception jelent meg hibaüzenetként | `backend/main.py:377` |
| 2 | `checkAuth`: 503-ra törlte a JWT tokent (Frigate le = kijelentkezés) | `dashboard/index.html` – `checkAuth()` |
| 3 | Kamera kártya: `undefined%` akkumulátor (`!== null` nem fogta `undefined`-ot) | `dashboard/index.html` – `renderCameras()`, `updateCameraHealth()` |
| 4 | Snapshot: JSON 503 → `ERR_BLOCKED_BY_ORB` cross-origin image blokk | `backend/main.py` – snapshot endpoint |
| 5 | Discovery: üres találatnál törölt minden meglévő kamera kártyát | `dashboard/index.html` – SSE result handler |
| 6 | Settings: "Frigate újraindítva" üzenet akkor is, ha Frigate nem fut | `backend/main.py` + `dashboard/index.html` |
| 7 | Hiányzó favicon → 404 minden oldalbetöltésnél | `dashboard/index.html` – `<head>` |

### Következő lépések
| Feladat | Prioritás |
|---|---|
| go2rtc WebRTC live stream a kártya-nézetben (jelenleg: 3s snapshot refresh) | Közepes |
| Frigate auth első bejelentkezés workflow – user creation guide a dashboardon | Alacsony |
| Backend Dockerizálása (jelenleg lokálisan fut, Docker socketen át) | Alacsony |
| Discovery retry logika (2x attempt per IP) | Alacsony |

### Auth megjegyzés
Az auth **Frigate auth proxy**: a backend a `POST /api/auth/login` hívást továbbítja a Frigate `/api/login`-jára, a kapott JWT tokent Bearer tokenként használja. **Frigate auth első beállítása:** a felhasználónak egyszer meg kell nyitnia `http://localhost:5000` és létrehozni egy accountot, utána működik a dashboard login.

## Fejlesztési prioritások

1. **go2rtc live stream** – WebRTC stream a kamera kártyákba (jelenleg snapshot van)
2. **Frigate user creation guide** – ha nincs Frigate user, a dashboard jelez és irányít
3. **Discovery retry logika** – 2x attempt per IP, backoff
4. **Backend Dockerizálása** – jelenleg lokálisan fut

## Fontos megjegyzések

- **Self-hosted, nincs cloud függőség** – minden komponens lokálisan fut
- **Dev environment:** laptop (ez a gép)
- **Production szerver:** NUC, Ubuntu 24.04
- **Backend venv:** `backend/venv/` – `source venv/bin/activate && uvicorn main:app --reload`
- **MQTT:** ha Mosquitto nem fut, a backend 10s-ként retry-ol, nem crashel

## Indítás (Docker)

```bash
cd docker
docker compose up -d
```

## Backend futtatása lokálisan

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```
