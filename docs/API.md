# SwarmCam — API Reference

Base URL: `http://localhost:8000` (direct) or `http://localhost/api/` (via nginx proxy)

All endpoints under `/api/`. Interactive docs: `http://localhost:8000/docs` (Swagger UI).

Authentication: `Authorization: Bearer <token>` header where required.  
Token is obtained via `POST /api/auth/login` and is a Frigate JWT (24h expiry).

---

## Auth

### `POST /api/auth/login`

Proxy to Frigate login. Returns a JWT token.

**Request body:**
```json
{ "user": "admin", "password": "admin" }
```

**Response `200`:**
```json
{ "token": "<jwt>" }
```

**Response `401`:**
```json
{ "message": "Invalid credentials" }
```

**Response `503`:**
```json
{ "detail": "Frigate unavailable" }
```

---

### `GET /api/auth/me`

Decode the current token and return user info.  
**Auth required.**

**Response `200`:**
```json
{ "username": "admin", "role": "admin" }
```

**Response `401`:** Invalid or expired token.

---

## Cameras

### `GET /api/cameras`

List all registered cameras (loaded from `frigate/config.yml` on startup, updated by discovery).

**No auth required.**

**Response `200`:**
```json
[
  {
    "ip": "192.168.0.100",
    "port": 8080,
    "name": "cam_192_168_0_100",
    "rtsp_url": "rtsp://192.168.0.100:8080/h264_ulaw.sdp",
    "http_url": "http://192.168.0.100:8080",
    "display_name": "192.168.0.100"
  }
]
```

`display_name` is the alias if set via `PATCH /api/cameras/{name}/alias`, otherwise derived from the IP.

---

### `GET /api/cameras/{name}/snapshot`

Latest snapshot from Frigate for the given camera.  
Returns `image/jpeg` on success, or a 1×1 transparent GIF if the camera is offline or Frigate unavailable.

**No auth required.**

---

### `GET /api/cameras/{name}/stream`

MJPEG live stream proxied directly from the IP Webcam `/videofeed` endpoint.  
Streams indefinitely as `multipart/x-mixed-replace`. Use as `<img src="...">`.

**No auth required.**

**Response `404`:** Camera name not in registry.  
**Response `503`:** Camera unreachable.

---

### `POST /api/cameras/{name}/torch`

Toggle the phone's flashlight.

**Request body:**
```json
{ "enabled": true }
```

**Response `200`:**
```json
{ "ok": true }
```

---

### `GET /api/cameras/{name}/settings`

Read current IP Webcam settings from the camera's `/status.json`.

**Response `200`:**
```json
{
  "orientation": "landscape",
  "quality": 80,
  "video_size": "1280x720",
  "night_vision": "off",
  "video_fps": 15,
  "mirror_flip": "none",
  "ffc": "off"
}
```

**Response `503`:** Camera unreachable.

---

### `POST /api/cameras/{name}/settings`

Apply one or more IP Webcam settings. Sends `GET /settings/{key}?set={value}` to the phone for each field provided.

**Request body** (all fields optional):
```json
{
  "orientation": "portrait",
  "quality": 60,
  "video_size": "854x480",
  "night_vision": "auto",
  "video_fps": 10,
  "mirror_flip": "flip",
  "ffc": "on"
}
```

**Response `200`:**
```json
{ "ok": true, "applied": ["orientation", "quality"] }
```

`applied` lists the fields that the camera accepted (returned HTTP 200).

---

### `GET /api/cameras/{name}/stats`

Frigate detection FPS stats for this camera.

**Response `200`:**
```json
{
  "camera_fps": 15.0,
  "detection_fps": 2.3,
  "skipped_fps": 0.1,
  "process_fps": 2.2
}
```

**Response `503`:** Frigate unavailable.

---

### `GET /api/cameras/{name}/alias`

Get the display name alias for a camera.

**Response `200`:**
```json
{ "alias": "Living Room" }
```

Empty string if no alias is set.

---

### `PATCH /api/cameras/{name}/alias`

Set or clear the display name for a camera. Persisted in `backend/aliases.json`.

**Request body:**
```json
{ "alias": "Living Room" }
```

Send empty string to clear the alias (reverts to IP-derived name).

**Response `200`:**
```json
{ "ok": true, "display_name": "Living Room" }
```

---

## Discovery

### `POST /api/discover/stream`

Start a network scan and stream progress as Server-Sent Events (SSE).

**Request body:**
```json
{
  "subnet": "192.168.0.0/24",
  "port": 8080,
  "timeout": 1.0,
  "update_frigate": true
}
```

`subnet` is optional — auto-detected if omitted.  
`update_frigate`: if `true`, found cameras are written to `frigate/config.yml` and Frigate is restarted.

**Response:** `text/event-stream`

```
event: progress
data: "[*] Scanning 254 hosts on 192.168.0.0/24 (port 8080)..."

event: progress
data: "[+] Found: 192.168.0.100  battery=87%  res=(1280, 720)"

event: result
data: [{"ip":"192.168.0.100","port":8080,"name":"cam_192_168_0_100",...}]

event: done
data: {}
```

After the `result` event, the backend updates `state._last_cameras` with the found cameras.

---

### `DELETE /api/cameras`

Clear the in-memory camera list (does not modify `frigate/config.yml`).

**Response `200`:**
```json
{ "cleared": true }
```

---

### `POST /api/cameras/reset`

Clear all cameras from `frigate/config.yml` and restart Frigate.

**Response `200`:**
```json
{ "reset": true }
```

---

### `DELETE /api/recordings`

Delete all Frigate recordings and clips from disk.

**Response `200`:**
```json
{ "cleared_mb": 142.5 }
```

---

## Events

### `GET /api/events`

List Frigate detection events with optional filters.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `camera` | string | Filter by camera name |
| `label` | string | Filter by object type (`person`, `car`, `dog`, `cat`, …) |
| `after` | float | Unix timestamp — events after this time |
| `before` | float | Unix timestamp — events before this time |
| `limit` | int | Max results (default 100) |

**Response `200`:** Array of Frigate event objects:
```json
[
  {
    "id": "1779024888.637995-52urmw",
    "camera": "cam_192_168_0_100",
    "label": "person",
    "score": 0.87,
    "start_time": 1779024888.6,
    "end_time": 1779024992.9,
    "has_snapshot": true,
    "has_clip": true
  }
]
```

---

### `GET /api/events/stats`

Aggregate event statistics from Frigate.

**Query params:** `camera` (optional), `days` (default 7)

**Response `200`:**
```json
{
  "explore": { ... },
  "summary": { ... }
}
```

Raw Frigate `/api/events/explore` and `/api/events/summary` responses.

---

### `GET /api/events/{event_id}/thumbnail`

Snapshot image for an event. Returns `image/jpeg`, or a 1×1 transparent GIF if unavailable.

---

## Recordings

### `GET /api/recordings/events`

List Frigate events that have an associated video clip (`has_clip=1`).  
Same filters as `GET /api/events`.

**Response:** Same structure as events.

---

### `GET /api/recordings/{event_id}/clip`

Stream the MP4 clip for a recording event.

**Response:** `video/mp4` stream (chunked, 64 KB chunks).  
**Response `404`:** Clip not found.  
**Response `503`:** Frigate unavailable.

---

### `GET /api/recordings/{event_id}/thumbnail`

Thumbnail image for a recording. Returns `image/jpeg` or transparent GIF.

---

## Faces

Requires Frigate face recognition to be enabled in `frigate/config.yml`:
```yaml
face_recognition:
  enabled: true
  model_size: small
```

### `GET /api/faces`

List all registered face names and their associated image files.

**Response `200`:**
```json
{
  "john": ["1779024888.637-abc-0.webp", "1779024999.123-def-0.webp"],
  "jane": ["1779025100.456-ghi-0.webp"]
}
```

**Response `404`:** Face recognition not enabled in Frigate.

---

### `POST /api/faces/{name}/create`

Create a new named face entry in Frigate.

**Response `200`:** `{ "ok": true }` or Frigate's response body.

---

### `POST /api/faces/{name}/register`

Upload a face image for an existing face entry. `multipart/form-data` with a `file` field.

**Request:** `Content-Type: multipart/form-data`  
**Form field:** `file` — the image file (JPEG or PNG recommended)

**Response `200`:** `{ "ok": true }`

---

### `DELETE /api/faces/{name}`

Delete a face entry and all its images.

**Response `200`:** `{ "ok": true }`

---

### `GET /api/faces/{name}/thumbnail`

Thumbnail image for a face entry. Returns `image/jpeg` or transparent GIF.

**Query param:** `filename` (optional) — specific image file to fetch.

---

## Users

All user management endpoints require a valid JWT token with admin role.

### `GET /api/users`

List all Frigate users.  
**Auth required (admin).**

**Response `200`:**
```json
[
  { "username": "admin", "role": "admin" },
  { "username": "viewer1", "role": "viewer" }
]
```

**Response `403`:** Non-admin token.

---

### `POST /api/users`

Create a new Frigate user.  
**Auth required (admin).**

**Request body:**
```json
{ "username": "alice", "password": "secret", "role": "viewer" }
```

`role`: `"admin"` or `"viewer"`.

**Response `200`:** Created user object or `{ "ok": true }`.  
**Response `409`:** Username already exists.

---

### `PUT /api/users/{username}/password`

Change a user's password.  
**Auth required (admin).**

**Request body:**
```json
{ "password": "new_password" }
```

**Response `200`:** `{ "ok": true }`  
**Response `404`:** User not found.

---

### `DELETE /api/users/{username}`

Delete a Frigate user.  
**Auth required (admin).**

**Response `200`:** `{ "ok": true }`  
**Response `404`:** User not found.

---

## Config

### `GET /api/config`

Read current Frigate configuration settings.

**Response `200`:**
```json
{
  "decoder": "cpu",
  "detect_fps": 15,
  "detect_width": 1280,
  "detect_height": 720,
  "objects": ["person", "car", "cat", "dog"],
  "record_retention_days": 14,
  "motion_retention_days": 7
}
```

---

### `POST /api/config`

Save Frigate configuration settings. Writes `frigate/config.yml` and restarts Frigate.

**Request body:** Same schema as `GET /api/config`.

If `decoder` changed (e.g. `"cpu"` → `"nvidia"`), Frigate is force-recreated via `docker compose up -d --force-recreate frigate`. Otherwise Frigate is soft-restarted via its API.

**Response `200`:**
```json
{
  "ok": true,
  "decoder_changed": false,
  "frigate_restarted": true
}
```

---

## System

### `GET /api/networks`

List available network interfaces with their subnets. Used by the Discovery page to populate the interface selector.

**Response `200`:**
```json
[
  { "iface": "wlan0", "ip": "192.168.0.50", "subnet": "192.168.0.0/24" },
  { "iface": "eth0",  "ip": "10.0.0.5",     "subnet": "10.0.0.0/24"   }
]
```

Loopback (`127.x`) and Docker bridge (`172.x`) interfaces are excluded.

---

### `GET /api/system`

System capability info.

**Response `200`:**
```json
{
  "nvidia_gpu": false,
  "nvidia_docker": false,
  "intel_gpu": false
}
```

`nvidia_gpu`: `nvidia-smi` exits 0.  
`nvidia_docker`: Frigate service in `docker-compose.yml` has `runtime: nvidia`.  
`intel_gpu`: `/dev/dri/renderD128` exists.

---

### `GET /api/debug/health`

Raw internal state dump. Useful for debugging.

**Response `200`:**
```json
{
  "cameras": [ ... ],
  "cache": { "192.168.0.100": { "online": true, "battery_level": 87, ... } },
  "ws_clients": 2
}
```

---

## WebSocket

### `WS /ws/cameras`

Persistent WebSocket connection for real-time camera updates.

**On connect:** The backend immediately sends the current health state (if any):
```json
{ "type": "status", "cameras": [ ... ] }
```

**Message types received from server:**

#### `status`
Camera health update, sent every 5 seconds per the polling loop.
```json
{
  "type": "status",
  "cameras": [
    {
      "ip": "192.168.0.100",
      "port": 8080,
      "name": "cam_192_168_0_100",
      "online": true,
      "battery_level": 87,
      "battery_charging": false,
      "battery_temp_c": 28.5,
      "free_space_gb": 4.2,
      "video_connections": 1,
      "night_vision": false,
      "quality": 80,
      "orientation": "landscape"
    }
  ]
}
```

#### `ping`
Keepalive sent every 30 seconds. No response needed.
```json
{ "type": "ping" }
```

#### `frigate_event`
Real-time AI detection event from Frigate via MQTT.
```json
{
  "type": "frigate_event",
  "camera": "cam_192_168_0_100",
  "label": "person",
  "score": 0.87,
  "id": "1779024888.637995-52urmw"
}
```

Use `id` to fetch the snapshot: `GET /api/events/{id}/thumbnail`.

#### `alert`
Charging state change notification.
```json
{
  "type": "alert",
  "message": "192.168.0.100 csatlakozott a töltőre!"
}
```
