# SwarmCam – Fejlesztési Terv (lezárt, archív)

> [!WARNING]
> **Ez a dokumentum egy LEZÁRT tervezési előzmény, nem az aktuális állapot leírása.**
>
> A benne szereplő hat feladat mind elkészült (Camera Settings, Events, Recordings,
> Face Recognition, health fix, camera stats). Emellett a kamera-protokoll azóta
> lecserélődött: az itt hivatkozott IP Webcam végpontok (`/status.json`,
> `/command.json`, `/enabletorch`, RTSP 8080) **már nem léteznek** a rendszerben.
>
> A szöveget szándékosan nem írtuk át, mert dokumentálja, hogyan alakult a projekt —
> a szakdolgozathoz ez az előzmény érték. **Referenciaként ne használd.**
>
> Aktuális állapot: [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`API.md`](API.md) ·
> [`../DECISIONS.md`](../DECISIONS.md) (D-001: a protokollcsere indoklása)
>
> Lezárva: 2026-08-26

## Architektúra összefoglaló

```
Android telefonok (IP Webcam APK)
        │ RTSP stream + HTTP API (/status.json, /command.json)
        ▼
Frigate NVR  ──── go2rtc (WebRTC streaming)
(AI detekció,      │
 RTSP kezelés)     │ stream URL-ek
        │          ▼
        │ MQTT events + REST API
        ▼
Mosquitto MQTT broker
        │ subscribe
        ▼
Python FastAPI backend
(discovery, health monitoring,
 user management, Frigate API kliens,
 IP Webcam command proxy)
        │ WebSocket / REST
        ▼
Saját Dashboard
(live kamerakép, health státuszok,
 discovery, settings, recordings,
 events, face recognition)
```

---

## 1. Camera Settings – Kamera vezérlés (ÚJ sidebar szekció)

### Cél
Az IP Webcam beállításainak elérése a dashboardról, ne kelljen külön megnyitni a telefon webes felületét.

### IP Webcam API endpointok (HTTP GET a kamera IP:port-jára)
| Endpoint | Leírás |
|---|---|
| `/status.json` | Állapot lekérdezés (már működik) |
| `/command.json?cmd=orientation=value` | Orientáció: portrait / landscape |
| `/command.json?cmd=quality=value` | Képminőség: 0-100 |
| `/command.json?cmd=video_size=WxH` | Felbontás állítása |
| `/command.json?cmd=night_vision=value` | Éjjellátó: on / off / auto |
| `/enabletorch` / `/disabletorch` | Vaku (már működik) |

> **Fontos:** Az IP Webcam `/command.json` endpointjait tesztelni kell élő eszközön, mert verziók között eltérhetnek. A Pavel Khlebovich-féle IP Webcam APK 1.18.x verzió az alap.

### Backend – `backend/main.py`

**Új Pydantic model:**
```python
class CameraSettings(BaseModel):
    orientation: str | None = None      # "portrait" | "landscape"
    quality: int | None = None           # 0-100
    video_size: str | None = None        # pl. "1920x1080"
    night_vision: str | None = None      # "on" | "off" | "auto"
```

**Új endpointok:**
```python
@app.get("/api/cameras/{name}/settings")
async def get_camera_settings(name: str):
    """Lekéri az IP Webcam /status.json-ból a jelenlegi beállításokat."""
    # 1. Kamera megkeresése _last_cameras-ból
    # 2. GET http://{ip}:{port}/status.json
    # 3. curvals-ból: orientation, quality, video_size, night_vision
    # 4. Visszaad CameraSettings-ként

@app.post("/api/cameras/{name}/settings")
async def set_camera_settings(name: str, body: CameraSettings):
    """Elküldi a beállításokat az IP Webcam /command.json endpointjának."""
    # 1. Kamera megkeresése
    # 2. Minden nem-None mezőre: GET http://{ip}:{port}/command.json?cmd=key=value
    # 3. Visszaad: {"ok": True, "applied": ["orientation", "quality"]}
```

### Frontend – Új sidebar szekció "Camera Settings"

**UI elemek:**
- Kamera selector dropdown (meglévő kamerák listája `_cameras`-ból)
- Orientáció: radio gombok (portrait / landscape)
- Minőség: slider 0-100
- Felbontás: dropdown (a telefon által támogatott értékek discovery-ből vagy hardcode list)
- Éjjellátó: toggle switch (on / off / auto)
- "Alkalmaz" gomb → POST `/api/cameras/{name}/settings`
- Visszajelzés: sikeres alkalmazás után status üzenet

**Megjegyzés:** A `showSection()` navigáció már kezeli az új szekciókat, csak a HTML + JS kell hozzá.

---

## 2. NVR – Felvétel visszajátszás (ÚJ sidebar szekció)

### Cél
Frigate-ban tárolt felvételek böngészése és visszajátszása a dashboardon.

### Frigate API endpointok
| Endpoint | Leírás |
|---|---|
| `GET /api/events` | Események listázása (label, camera, start/end, has_clip, has_snapshot) |
| `GET /api/events/{id}/clip.mp4` | Felvétel letöltése |
| `GET /api/events/{id}/snapshot.jpg` | Esemény thumbnail |
| `GET /api/events/search` | Esemény keresés (label, camera, időintervallum) |
| `GET /api/recordings/{camera}/start/{ts}/end/{ts}` | Időszeletes felvétel |

### Backend – `backend/main.py`

```python
@app.get("/api/recordings/events")
async def get_events(
    camera: str | None = None,
    label: str | None = None,
    start_time: float | None = None,
    end_time: float | None = None,
    limit: int = 50,
    has_clip: bool = True,
):
    """Frigate /api/events proxy szűréssel."""
    # Query paraméterek összeállítása
    # GET {FRIGATE_URL}/api/events?...
    # Visszaad a Frigate-től kapott JSON-t

@app.get("/api/recordings/{event_id}/clip")
async def get_event_clip(event_id: str):
    """Frigate clip.mp4 streaming proxy."""
    # GET {FRIGATE_URL}/api/events/{event_id}/clip.mp4
    # StreamingResponse visszaadása (nagy fájlok!)

@app.get("/api/recordings/{event_id}/thumbnail")
async def get_event_thumbnail(event_id: str):
    """Frigate snapshot proxy."""
    # GET {FRIGATE_URL}/api/events/{event_id}/snapshot.jpg
    # Response content-type: image/jpeg

@app.get("/api/recordings/timeline")
async def get_timeline(camera: str | None = None, date: str | None = None):
    """Napi esemény összegzés timeline-hoz."""
    # GET {FRIGATE_URL}/api/events?camera=...&before=...&after=...
    # Aggregálás órákra: {hour: count}
```

### Frontend – Új sidebar szekció "Recordings"

**UI elemek:**
- **Szűrő sáv:**
  - Kamera select dropdown
  - Objektum típus select (person / car / dog / cat / all)
  - Dátum picker (date input)
  - "Keresés" gomb
- **Esemény lista** (scrollable, virtuális listázás sok esemény esetén):
  - Esemény kártya: thumbnail kép + időbélyeg + kamera név + objektum típus + confidence score
  - Kattintásra videó lejátszó modal/panel
- **Videó lejátszó:**
  - `<video>` element, src a clip proxy endpoint-ra
  - Vezérlők: play/pause, seek, fullscreen
- **Timeline view** (opcionális, később):
  - Naptár + esemény sűrűség vizualizáció (óra bontású sávok)

**Megjegyzés:** A clip fájlok nagyok lehetnek, a backendnek `StreamingResponse`-t kell használnia.

---

## 3. Mozgásdetekció / AI Események (ÚJ sidebar szekció)

### Cél
Valós idejű és történelmi mozgásdetekciós események megjelenítése.

### Frigate API + MQTT
| Forrás | Endpoint / Topic | Leírás |
|---|---|---|
| REST | `GET /api/events` | `has_clip=true` szűrés = mozgás alapú események |
| REST | `GET /api/events/explore` | Objektum összefoglaló statisztikák |
| REST | `GET /api/events/summary` | Napi/havi összegzés |
| MQTT | `frigate/events` | Real-time események (már feliratkozva!) |

### Backend – `backend/main.py`

```python
@app.get("/api/events")
async def get_detection_events(
    camera: str | None = None,
    label: str | None = None,
    start_time: float | None = None,
    end_time: float | None = None,
    limit: int = 100,
):
    """Frigate events proxy paging support-al."""
    # GET {FRIGATE_URL}/api/events?...
    # Visszaadja a szűrt eseményeket

@app.get("/api/events/stats")
async def get_event_stats(camera: str | None = None, days: int = 7):
    """Esemény statisztikák – explore + summary aggregálva."""
    # GET {FRIGATE_URL}/api/events/explore
    # GET {FRIGATE_URL}/api/events/summary
    # Aggregált válasz: {by_label: {...}, by_camera: {...}, daily_counts: [...]}
```

> **MQTT loop már kész:** A `_mqtt_loop()` már feliratkozik `frigate/events`-re és broadcastol WS-en `{"type": "frigate_event", ...}` üzeneteket. Csak frontend oldal a teendő.

### Frontend – Új sidebar szekció "Events"

**Két nézet:**

**A) Real-time event feed:**
- Jobb oldali slide-in panel vagy külön szekció
- Élő események lista (WebSocket `frigate_event` üzenetekre frissül)
- Esemény kártya:
  - Thumbnail: `GET /api/recordings/{event_id}/thumbnail`
  - Kamera neve
  - Objektum típus (person / car / dog)
  - Confidence score
  - Időbélyeg (relatív: "2 perce", "5 perce")
- "Flash" animáció a kamera kártyán ha élő detekció van (a Cameras szekcióban)

**B) Történelmi nézet:**
- Szűrhető esemény lista (ugyanaz mint Recordings-nél)
- Dátum range picker
- Kamera + objektum szűrés
- Eredmény lista ugyanolyan kártyákkal

**C) Statisztikák (opcionális):**
- Napi/havi grafikon – detektált objektumok száma típusonként
- Bar chart vagy line chart (vanilla JS canvas vagy egyszerű SVG)

---

## 4. Face Recognition (ÚJ sidebar szekció)

### Cél
Frigate face recognition kezelése a dashboardról – arcok regisztrálása, felismerési eredmények böngészése.

### Frigate API endpointok (Classification)
| Endpoint | Leírás |
|---|---|
| `GET /api/faces` | Regisztrált arcok listája (`{face_name: [image_filenames]}`) |
| `POST /api/faces/{name}/create` | Új arc név létrehozása |
| `POST /api/faces/{name}/register` | Arc kép regisztrálása (multipart upload) |
| `POST /api/faces/{name}/train` | Arc betanítása képből |
| `GET /api/faces/{name}/thumbnail` | Arc thumbnail |
| `DELETE /api/faces/{name}` | Arc törlése |
| `POST /api/faces/reprocess` | Arc újraprocesszálása |
| Esemény `sub_label` | Felismert arc neve az event objektumban |

### Frigate config requirement
```yaml
face_recognition:
  enabled: true
  model_size: small  # CPU-hoz, "large" GPU/NPU esetén
```

> **Megjegyzés:** A face recognition globális config. `small` modell CPU-n fut, `large`-hoz GPU/NPU kell. Először a config-ban engedélyezni kell.

### Backend – `backend/main.py`

```python
@app.get("/api/faces")
async def get_faces():
    """GET {FRIGATE_URL}/api/faces – regisztrált arcok."""

@app.post("/api/faces")
async def create_face(name: str, file: UploadFile):
    """Új arc létrehozása + kép regisztrálás."""
    # 1. POST {FRIGATE_URL}/api/faces/{name}/create
    # 2. POST {FRIGATE_URL}/api/faces/{name}/register (multipart form-data forward)

@app.delete("/api/faces/{name}")
async def delete_face(name: str):
    """DELETE {FRIGATE_URL}/api/faces/{name}"""

@app.post("/api/faces/{name}/train")
async def train_face(name: str, image_filename: str):
    """POST {FRIGATE_URL}/api/faces/{name}/train"""

@app.get("/api/faces/{name}/thumbnail")
async def get_face_thumbnail(name: str, filename: str):
    """Arc thumbnail proxy."""
```

### Frontend – Új sidebar szekció "Faces"

**UI elemek:**
- **Arc könyvtár:**
  - Regisztrált arcok grid nézetben (thumbnail + név)
  - Kattintásra arc detail panel
- **Új arc hozzáadása:**
  - Név megadás input
  - Kép feltöltés (file picker) VAGY kamera snapshot választása
  - "Regisztrálás" gomb
- **Felismerési előzmények:**
  - Mikor, melyik kamerán ismerte fel az adott arcot
  - Events szűrés `sub_label` alapján
  - Esemény kártyák ugyanúgy mint az Events szekcióban
- **Kezelés:**
  - Arc átnevezés
  - Arc törlés (megerősítéssel)
  - Új kép hozzáadása meglévő archoz

---

## 5. Frigate detekciós adatok a kártyákon

### Cél
A kamera kártyákon megjeleníteni a Frigate által mért FPS adatokat.

### Backend – `backend/main.py`

Új endpoint a `/api/cameras/{name}/torch` után (kb. 484. sor után):

```python
@app.get("/api/cameras/{name}/stats")
async def camera_stats(name: str):
    """Frigate /api/stats alapján: camera_fps, detection_fps, skip_fps."""
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.get(f"{FRIGATE_URL}/api/stats", timeout=3),
        )
        if r.status_code != 200:
            raise HTTPException(503, "Frigate unavailable")
        stats = r.json()
        cam_stats = stats.get("cameras", {}).get(name, {})
        return {
            "camera_fps":    round(cam_stats.get("camera_fps", 0), 1),
            "detection_fps": round(cam_stats.get("detection_fps", 0), 1),
            "skipped_fps":   round(cam_stats.get("skipped_fps", 0), 1),
            "process_fps":   round(cam_stats.get("process_fps", 0), 1),
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Frigate unavailable")
```

### Frontend – `dashboard/index.html`

**1. A `renderCameras()` függvényben** a `cam-body`-ban a `cam-name` div után új mini grid:

```html
<div class="cam-stats" id="stats-${safeIp}">
  <span class="stat-item"><span class="stat-lbl">Cam</span> <span class="stat-val" id="cfps-${safeIp}">—</span></span>
  <span class="stat-item"><span class="stat-lbl">Det</span> <span class="stat-val" id="dfps-${safeIp}">—</span></span>
</div>
```

**2. Új `loadCameraStats(cam)` függvény** a `toggleTorch` után:

```javascript
async function loadCameraStats(cam) {
  const safeIp = cam.ip.replace(/\./g, '_');
  try {
    const r = await fetch(`${API}/api/cameras/${cam.name}/stats`, { headers: authHeaders() });
    if (!r.ok) return;
    const s = await r.json();
    const cfps = document.getElementById(`cfps-${safeIp}`);
    const dfps = document.getElementById(`dfps-${safeIp}`);
    if (cfps) cfps.textContent = s.camera_fps > 0 ? `${s.camera_fps}` : '—';
    if (dfps) dfps.textContent = s.detection_fps > 0 ? `${s.detection_fps}` : '—';
  } catch {}
}
```

**3. A `renderCameras()` végén** a `startLiveStream(cam)` sor után:
```javascript
loadCameraStats(cam);
```

**4. A `connectHealthWS()` `onmessage` handlerében** status update-nél:
```javascript
if (msg.type === 'status') {
  updateCameraHealth(msg.cameras);
  // FPS adatok frissítése minden élő kamerára
  msg.cameras.forEach(c => {
    const cam = _cameras[c.ip.replace(/\./g, '_')];
    if (cam) loadCameraStats(cam);
  });
}
```

**5. CSS** (style blokkba):
```css
.cam-stats {
  display: flex; justify-content: center; gap: 12px;
  padding: 3px 0 0; font-family: var(--font-mono); font-size: 10px;
}
.stat-lbl { color: var(--text-muted); }
.stat-val { color: var(--amber); }
```

---

## 6. Health loop – orientation frissítés

### Backend – `backend/main.py` `_health_loop()` (kb. 75-84. sor)

Az `entry.update()` blokkban az `orientation` mező hozzáadása:

```python
entry.update({
    "online":            True,
    "battery_level":     int(info["batteryPercent"]) if "batteryPercent" in info else None,
    "battery_charging":  info.get("batteryCharging", "").lower() in ("true", "1", "charging"),
    "battery_temp_c":    round(float(info.get("batteryTemperatureC", 0)), 1) or None,
    "free_space_gb":     round(int(info["freeSpaceBytes"]) / 1024**3, 1) if "freeSpaceBytes" in info else None,
    "video_connections": int(status.get("video_connections", 0)),
    "night_vision":      curvals.get("night_vision", "off") == "on",
    "quality":           int(curvals["quality"]) if "quality" in curvals else None,
    "orientation":       curvals.get("orientation"),  # <-- ÚJ
})
```

> `free_space_gb` már megvan (80. sor), `quality` már megvan (83. sor). Csak `orientation` hiányzik.

### Frontend

Az `updateCameraHealth()` és a health table már kezeli a `quality` és `free_space_gb` mezőket (1356-1357. sor). Az `orientation` a Camera Settings szekcióban jelenik meg, nem a health table-ben – így nincs frontend teendő.

---

## Implementációs sorrend

| # | Feladat | Prioritás | Becslés | Függőség |
|---|---------|-----------|---------|----------|
| 1 | **Health loop orientation fix** | Magas | Kicsi (10 perc) | – |
| 2 | **Camera stats a kártyákon** | Magas | Kicsi (30 perc) | – |
| 3 | **Camera Settings szekció** | Magas | Közepes (2-3 óra) | IP Webcam API tesztelés |
| 4 | **Events / Mozgásdetekció panel** | Magas | Közepes (2-3 óra) | MQTT loop már kész |
| 5 | **NVR / Recordings szekció** | Magas | Nagy (4-6 óra) | Frigate API proxy, streaming |
| 6 | **Face Recognition szekció** | Közepes | Nagy (4-6 óra) | Frigate face recognition config |

---

## Fontos megjegyzések az implementációhoz

### IP Webcam API
- A `/command.json?cmd=key=value` endpointokat **tesztelni kell élő eszközön**
- Pavel Khlebovich IP Webcam APK 1.18.x az alap verzió
- Néhány command eltérhet verziók között
- A `/status.json` már működik és stabil

### Frigate Face Recognition
- Configban engedélyezni kell: `face_recognition: enabled: true`
- `small` modell: CPU-n fut, kevésbé pontos
- `large` modell: GPU/NPU kell hozzá, pontosabb
- Frigate-nek először `person`-t kell detektálnia, utána nézi az arcot
- Min. 5-10 kép / személy a betanításhoz

### Recordings / Clip streaming
- A Frigate clip.mp4 fájlok nagyok (több MB)
- Backend proxy-nál **StreamingResponse** kötelező
- Frontend `<video>` element natívan kezeli az MP4 streaminget

### Architektúra szabályok
- Minden Frigate API hívás a **backend-en keresztül** megy (proxy)
- A frontend **soha** nem kommunikál direktben Frigate-tel REST API-n
- Kivétel: go2rtc WebRTC stream → backend MJPEG proxy-n keresztül
- Auth: Frigate JWT token, backend proxy-zza a login-t

### Meglévő, működő komponensek (NE nyúlj hozzá)
- `discovery/discovery.py` – hálózat scan, IP Webcam fingerprint
- `backend/main.py` – health polling, MQTT loop, auth proxy, snapshot, stream proxy, torch control, config API, discovery SSE
- `dashboard/index.html` – login, kamera kártyák, MJPEG live stream, fullscreen, vaku, discovery UI, settings panel, health table, layout váltás
- `docker/docker-compose.yml` – Frigate + Mosquitto + dashboard + go2rtc
- `docker/mosquitto/mosquitto.conf` – MQTT broker config

### Konvenciók
- Backend: Python 3.10+, FastAPI, aiomqtt, requests, pyyaml
- Frontend: vanilla JS, nincs framework, CSS custom properties
- Stílus: dark theme, amber accent, Barlow Condensed + IBM Plex Mono fontok
- Nyelv: magyar UI szövegek
- API prefix: `/api/` minden endpointon
- Auth: Bearer token a `Authorization` header-ben
