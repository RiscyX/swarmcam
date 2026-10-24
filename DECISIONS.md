# DECISIONS

Design decisions and the reasoning behind them.

---

## D-002: AGPL-3.0-only project license (2026-10-24)

The goal is to release SwarmCam as open source together with its current
Ultralytics integration. Instead of the earlier MIT label, which implied the whole
project was MIT, the current application code is licensed AGPL-3.0-only. The full
text is in `LICENSE`; the earlier MIT copyright and permission notice is kept in
`licenses/MIT-legacy.txt`, and rights already granted under MIT remain valid.

We accept the AGPL's source-availability terms; a closed-source release or buying an
Enterprise license is not a goal. MIT on its own is still an open-source license, but
it does not override the terms of the integrated AGPL dependency.

This does not change the licenses of external components and models. The YOLO26s
publisher's MIT declaration is retained and the Ultralytics AGPL terms are complied
with as well; the two labels are not inherently incompatible. All 371 learned
tensors of Frigate's local ONNX weight file were numerically matched against the
original WongKinYiu YOLOv9-s checkpoint, and the upstream project's GPL-3.0 license is
included. Neither model needs a behaviour-changing replacement because of these two
questions. Details: [third-party licenses and model provenance](docs/THIRD_PARTY_LICENSES.md).

## D-001: Camera protocol swap — IP Webcam → Android IP Camera (2026-08, issue #80)

### Context

The camera nodes originally ran Pavel Khlebovich's **IP Webcam** APK. The app is closed source and can only be installed from the Google Play Store. In a fully self-hosted, cloud-independent system this is a foreign dependency: the Play Store does not open the app's page on every device (because of vendor services and regional restrictions — regardless of the device's age), so not every phone at hand can become a node. The old protocol was also built on RTSP (`h264_ulaw.sdp`), which is inflexible to decode directly in Frigate.

### Decision

A full replacement, not parallel support: every IP Webcam code path is removed, and the system moves to the open-source (**MIT**, also on F-Droid) [Android IP Camera](https://github.com/DigitallyRefined/android-ip-camera) app (default port: **4444**).

In favour of a full replacement:

- one protocol = one tested code path; parallel support would duplicate the discovery and health-poll logic,
- the old app's availability (Play exclusivity) is the very problem being solved,
- the new app offers reproducible builds and F-Droid distribution — installation without a Google account.

### Protocol mapping (short)

| Function | Old | New |
|---|---|---|
| Port | 8080 | 4444 |
| Fingerprint | `/status.json` (`curvals`) | `/info.json` (`cameras[]` + `settings{}`) |
| MJPEG live view | `/videofeed` | `/video/mjpeg` |
| Frigate source | direct RTSP | `/video/h264` → go2rtc restream |
| Torch | `/enabletorch`, `/disabletorch` | `/?torch=on\|off` |
| Writing settings | per key `/settings/{k}?set={v}` | a single `GET /?k1=v1&k2=v2` |

The camera naming scheme (`cam_{ip_with_underscores}`) was deliberately kept, so the display names stored in `aliases.json` carry over without migration.

### Losses accepted on purpose

The new protocol does not provide the following data, so these features were removed:

- the `quality` (JPEG quality) and `night_vision` setting/monitoring,
- the `free_space_gb`, `battery_temp_c`, `battery_voltage` health fields,
- `video_connections` (number of live viewers) and the `isLive` badge built on it,
- **charger connect/disconnect alert** (no `batteryCharging` data source) — protecting phones that run 24/7 will need an external solution later,
- support for phones below Android 7.0.

In return, **new** capabilities arrived: Wi-Fi signal strength (`wifiStrength`, RSSI dBm), zoom, exposure, contrast, native hardware H.264 encoding.

### Why accept a self-signed certificate without verification? (issue #88)

The Android IP Camera app **serves HTTPS by default** with a self-signed certificate (the `tls_version` setting defaults to `"1.3"`); plain HTTP is only available after explicitly turning it off. TLS is therefore the app's intended default, not an exception — so instead of a "turn off TLS on every phone" provisioning step, the backend and discovery send every camera-bound request over `https://` with `verify=False`.

Reasons for accepting the certificate without verification:

1. **LAN-only system:** traffic only travels on the local network; there is no intermediate attack surface for MITM protection to defend against.
2. **No CA:** the app generates its own self-signed certificate on first start; there is no certificate authority, so verification would have nothing to verify against.
3. **Encryption is kept:** the goal is encrypting network traffic (password, stream), not authenticating the server's identity — `verify=False` does not affect that.
4. **No configuration switch:** accepting the self-signed certificate is a deliberate, system-wide decision, not an option.

`urllib3`'s `InsecureRequestWarning` messages are silenced centrally so they do not flood the log.

### Why a go2rtc restream rather than direct ffmpeg?

The phone's H.264 stream (`https://ip:4444/video/h264`) is a raw Annex-B elementary stream, not RTSP. Frigate's ffmpeg input could consume it directly, but:

1. **One connection, many consumers:** the phone's HTTP server serves a limited number of clients. After the restream inside go2rtc (`rtsp://127.0.0.1:8554/{name}`, `preset-rtsp-restream`), Frigate's detect/record roles — and any future consumers — connect to the local go2rtc, not to the phone itself.
2. **Robust reconnection:** go2rtc handles the source dropping out and coming back; Frigate's ffmpeg processes see a stable, local RTSP source.
3. **Backend restart safety:** the camera's IP/port can be parsed back from the `go2rtc.streams` URLs in the Frigate config (`https?://ip:port/video/h264`), since the Frigate camera entry's path then points to `127.0.0.1:8554`. So at startup the backend restores the camera list from the `go2rtc.streams` entries instead of the `cameras:` section.

### Consequences in the code

- `discovery/discovery.py`: `/info.json` fingerprint, `stream_url`; writing the Frigate config touches **two** sections (`cameras:` + `go2rtc.streams:`).
- `backend/main.py`: restores cameras at startup from the `go2rtc.streams` URLs.
- `backend/services/health.py`: `/info.json` poll; charger alert and obsolete fields removed.
- `backend/routers/cameras.py`: MJPEG proxy to `/video/mjpeg`; torch and settings controlled through query parameters.
