# User Guide

How to run SwarmCam day to day: turning a phone into a camera node, finding it,
watching it, and reading what the system recorded.

For installing the server stack see the [README](../README.md); for how the
pieces fit together see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Prepare a phone

Each camera node is an Android phone (7.0 or newer) running
[Android IP Camera](https://f-droid.org/packages/com.github.digitallyrefined.androidipcamera/)
from F-Droid.

In the app:

1. **Turn authentication off.** SwarmCam talks to the phone over the LAN only and
   does not send credentials to it.
2. **Enable start-on-boot**, so the node comes back after a power cut.
3. Leave the port at **4444** and TLS on — the app serves HTTPS with a
   self-signed certificate, which SwarmCam accepts.
4. Start the server in the app.

Then give the phone a **static DHCP lease** on your router. The camera's internal
name is derived from its IP (`cam_192_168_1_10`), so a changing IP shows up as a
new camera.

Plug the phone in. A phone doing continuous video encoding will not last a day on
battery, and the battery level is on the Health page precisely because a node on
its own charge is a node about to disappear.

---

## 2. First login

Open the dashboard (`http://<server>` in Docker, `http://localhost:5173` in dev)
and log in with the Frigate admin account — `admin` / `admin` by default, unless
you set `DEFAULT_USER` / `DEFAULT_PASSWORD` before the first start.

**Change this password.** Go to **Users → Change password**. The account is the
Frigate admin; SwarmCam keeps no separate user database.

Your session lives in memory only, so reloading the page logs you out again. That
is deliberate — see `DECISIONS.md`.

---

## 3. Find the cameras

Go to **Discovery**.

| Field | What it does |
|---|---|
| **Subnet** | Leave empty to auto-detect, or pick one of the server's networks from the dropdown (`192.168.1.0/24`). |
| **Port** | 4444, unless you changed it in the app. |
| **Timeout (s)** | Per-host wait. Raise it on a slow or busy Wi-Fi. |
| **Update Frigate config** | **Leave this on** for the normal case — this is what actually registers the cameras. With it off you only get a list. |

Press **Start Scan**. The right-hand panel is the live log of the actual
`discovery.py` process running on the server, streamed line by line, so you can
watch it work through the subnet. Press **Stop Scan** to abort.

When the scan writes the Frigate config, Frigate restarts and the cameras appear
on the Cameras page within a few seconds.

**Reset Cameras** (under Maintenance) removes every camera from the Frigate
config. Use it when you want to re-discover from scratch; recordings are not
deleted.

---

## 4. The camera wall

**Cameras** is the main page. The header shows `3/4 nodes up · 4 H.264 STREAMS` —
how many nodes answered their last health check, and how many streams the current
layout is actually pulling.

**Layouts** (top right, desktop only):

- **AUTO** — fits every camera into the viewport.
- **2×2** / **3×3** — the first 4 or 9 cameras. The rest are not streamed at all,
  which is the point: each visible stream costs server CPU.
- **FOCUS** — one large camera with a filmstrip of the others below it.

**On each camera tile**, hovering reveals:

- **Torch** — toggles the phone's flashlight. This is not a gimmick: Android
  auto-exposure drops the sensor to about 1 fps in the dark, and the torch takes
  it back to ~16 fps. If a night camera looks like a slideshow, this is why.
- **Rename** — sets a display name (e.g. `Driveway`). Cosmetic only; the internal
  `cam_…` name never changes.
- **Fullscreen** — one camera, full window. `Esc` closes it.

Live video is the phone's own H.264 stream, repackaged by go2rtc and played in the
browser — native resolution, well under a tenth of a second behind. If a stream
fails three times the tile falls back to a lower-resolution MJPEG feed; a tile
stuck on the fallback usually means the phone is unreachable rather than the
server being busy.

**Events** (top right) opens the live event feed: detections as Frigate reports
them, newest first, with camera, object, score and arrival time.

---

## 5. Check on the nodes

**Health** lists every camera with its status, battery level and Wi-Fi strength,
refreshed automatically every few seconds.

This is the page to open when something looks wrong. A node that shows Offline
here is not a dashboard problem — the phone stopped answering, so look at the
phone: screen off with the app killed by battery optimisation, dropped Wi-Fi, or
simply unplugged.

---

## 6. Events and recordings

**Events** shows everything detected, from two sources merged into one list:
Frigate's own object detection, and the fire/smoke detector. Filter by **Camera**,
**Object** (`person`, `car`, `fire`, `smoke`, …) and **Limit**. Click a row for
the snapshot and details.

**Recordings** lists the saved clips. Filter by **Camera** and **Range** (today,
last 7 days, last 30 days), then play a clip in the browser or download it.

How long clips are kept is set on the Settings page, separately for
motion-triggered and event-triggered recordings.

---

## 7. Tune one camera

**Cam Settings** → pick a node.

- **Display name** — same rename as on the tile.
- **Orientation**, **Resolution**, **FPS** — written to the *phone's* app over its
  API. The phone applies them and the stream restarts.
- **Mirror image**, **Front camera (FFC)** — swaps to the selfie camera.

After saving, the page reports which fields the phone actually accepted — not
every model honours every combination.

**Danger zone → Delete node** removes the camera from the Frigate config and drops
its alias. **Recordings are kept.**

---

## 8. System settings

**Settings** edits the Frigate configuration. **Saving restarts Frigate**, so
live views drop for a few seconds.

- **Hardware acceleration** — `cpu`, `nvidia`, `intel` or `coral`. Options your
  server cannot support are disabled rather than hidden.
- **RTSP transport** — TCP unless you have a reason.
- **Detect FPS** — how often Frigate looks for objects. 5 is plenty; this is not
  the live-view frame rate.
- **Detect resolution** — 640×360, 1280×720 or 1920×1080. **Keep this low.**
  Motion detection runs on full detect-resolution frames in Python, so an
  oversized value costs several hundred percent CPU on a stream that is really
  720p. If the dropdown shows a value that is not one of the three, the config
  was hand-edited and is worth fixing.
- **Tracked objects** — `person`, `car`, `cat`, `dog`, `bicycle`, `motorcycle`.
- **Retention** — days to keep motion and event recordings.

---

## 9. Fire and smoke detection

A separate service polls each camera every few seconds and runs a YOLOv8
fire/smoke model on the frame. Above the confidence threshold it records an event
and pushes an alert, which appears as a toast in the dashboard and as a `fire` or
`smoke` row on the Events page.

The threshold defaults to **0.8** (`CONFIDENCE` in `docker/docker-compose.yml`).
Do not lower it casually: measurements during development showed the 0.5–0.8 band
to be almost entirely false alarms — sunset light on a wall, a red jacket.

---

## 10. On a phone

The dashboard is responsive. On a narrow screen the sidebar is replaced by a
bottom tab bar with Cams, Events, Recs, Health and Scan; **More** opens the
remaining sections (Settings, Camera Settings, Users) on a sheet that slides up.
The event table becomes a card list so it stays readable without sideways
scrolling.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Camera Offline on Health | Phone unreachable: app killed by battery optimisation, Wi-Fi dropped, or unplugged. |
| Live view is a slideshow at night | Auto-exposure dropped the sensor frame rate. Turn the torch on. |
| Camera never appears after a scan | **Update Frigate config** was unchecked, or the phone's app is not serving on the scanned port. |
| Server CPU pinned with few cameras | Detect resolution far above the real stream resolution. Check Settings. |
| A camera reappears under a new name | Its IP changed. Give the phone a static DHCP lease. |
| Logged out after reloading the page | Expected — the token is kept in memory only. |
