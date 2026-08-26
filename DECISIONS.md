# DECISIONS

Tervezési döntések és azok indoklása — szakdolgozati szöveghez újrahasznosítható formában.

---

## D-001: Kamera-protokoll csere — IP Webcam → Android IP Camera (2026-08, issue #80)

### Kontextus

A kamera-node-ok eredetileg a Pavel Khlebovich féle **IP Webcam** APK-t futtatták. Az alkalmazás zárt forrású, kizárólag a Google Play áruházból telepíthető. Egy teljesen self-hosted, felhőfüggetlen rendszerben ez idegen függőség: a Play áruház nem minden készüléken nyitja meg az app oldalát (gyártói szolgáltatások és régiós korlátok miatt — függetlenül a készülék korától), így nem minden kéznél lévő telefon tehető node-dá. Emellett a régi protokoll az RTSP-re (`h264_ulaw.sdp`) épült, amelynek a Frigate-ben való közvetlen dekódolása rugalmatlan.

### Döntés

Teljes csere, nem párhuzamos támogatás: minden IP Webcam kód-útvonal megszűnik, a rendszer az nyílt forrású (**GPL**, F-Droid-on is elérhető) [Android IP Camera](https://github.com/DigitallyRefined/android-ip-camera) appra áll át (alap port: **4444**).

A teljes csere mellett szólt:

- egyetlen protokoll = egyetlen tesztelt kód-útvonal; a párhuzamos támogatás megduplázná a discovery és a health-poll logikát,
- a régi app elérhetősége (Play-exkluzivitás) maga a kiváltott probléma,
- az új app reproducible build-et és F-Droid terjesztést biztosít — telepítés Google-fiók nélkül.

### Protokoll-leképezés (röviden)

| Funkció | Régi | Új |
|---|---|---|
| Port | 8080 | 4444 |
| Fingerprint | `/status.json` (`curvals`) | `/info.json` (`cameras[]` + `settings{}`) |
| MJPEG élőkép | `/videofeed` | `/video/mjpeg` |
| Frigate forrás | direkt RTSP | `/video/h264` → go2rtc restream |
| Torch | `/enabletorch`, `/disabletorch` | `/?torch=on\|off` |
| Beállításírás | per-kulcs `/settings/{k}?set={v}` | egyetlen `GET /?k1=v1&k2=v2` |

A kamera-nevek (`cam_{ip_aláhúzásokkal}`) sémája szándékosan változatlan maradt, így az `aliases.json`-ban tárolt megjelenített nevek migráció nélkül tovább élnek.

### Tudatosan vállalt veszteségek

Az új protokoll nem szolgáltatja az alábbi adatokat, ezért ezek a funkciók kikerültek:

- `quality` (JPEG minőség) és `night_vision` beállítás/monitorozás,
- `free_space_gb`, `battery_temp_c`, `battery_voltage` health-mezők,
- `video_connections` (élő nézők száma) és az ezen alapuló `isLive` badge,
- **töltő rá-/lecsatlakozás alert** (nincs `batteryCharging` adatforrás) — a 24/7 üzemű telefonok védelme érdekében később külső megoldást igényel,
- Android < 7.0 telefonok támogatása.

Cserébe **új** lehetőségek jöttek: Wi-Fi jelerősség (`wifiStrength`, RSSI dBm), zoom, expozíció, kontraszt, natív H.264 hardveres enkódolás.

### Miért go2rtc restream, és nem direkt ffmpeg?

A telefon H.264 streamje (`http://ip:4444/video/h264`) nyers Annex-B elemi folyam, nem RTSP. A Frigate ffmpeg inputja ezt közvetlenül is fogyasztaná, de:

1. **Egy kapcsolat, több fogyasztó:** a telefon HTTP szervere korlátozott számú klienst szolgál ki. A go2rtc-n belüli restream (`rtsp://127.0.0.1:8554/{name}`, `preset-rtsp-restream`) után a Frigate detect/record role-jai — és esetleges jövőbeli fogyasztók — a helyi go2rtc-hez csatlakoznak, nem magához a telefonhoz.
2. **Robusztus újracsatlakozás:** a go2rtc kezeli a forrás kiesését és visszatérését; a Frigate ffmpeg folyamatai stabil, lokális RTSP forrást látnak.
3. **Backend restart biztonság:** a kamera IP-je/portja a Frigate config `go2rtc.streams` URL-eiből visszaparszolható (`http://ip:port/video/h264`), mivel a Frigate camera entry path-ja ezután `127.0.0.1:8554`. Ezért a backend induláskor a `cameras:` szekció helyett a `go2rtc.streams` bejegyzésekből tölti vissza a kameralistát.

### Következmények a kódban

- `discovery/discovery.py`: `/info.json` fingerprint, `stream_url`, a Frigate config írás **két** szekciót érint (`cameras:` + `go2rtc.streams:`).
- `backend/main.py`: startup-visszatöltés a `go2rtc.streams` URL-ekből.
- `backend/services/health.py`: `/info.json` poll; töltő-alert és az elavult mezők törlése.
- `backend/routers/cameras.py`: MJPEG proxy `/video/mjpeg`-re; torch és beállítások query-paraméteres vezérlése.
