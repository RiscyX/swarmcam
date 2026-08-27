# SwarmCam mérőszkript

A `measure.py` a szakdolgozat 3.5. fejezetéhez (Tesztelés és eredmények) gyűjti
a ténylegesen mért adatokat. A NUC-on / a SwarmCam stacket futtató gépen kell
lefuttatni, miközben legalább egy valódi kamera (Android telefon) csatlakozik
a hálózathoz.

## Telepítés

```bash
pip install requests websockets paho-mqtt
```

## Használat

### 1. CPU/RAM a kameraszám függvényében

Futtasd le **külön-külön, minden vizsgált kameraszámnál** (pl. 1, 2, 3 aktív
telefonnal bekapcsolva), a köztük lévő kameraszám-változtatás után:

```bash
python3 measure.py resources --duration 60
```

A kameraszámot a backend `/api/cameras` végpontjáról olvassa ki automatikusan
(felülírható: `--cameras 3`). Az eredmény a `results/resources.csv`-be
fűződik hozzá, konténerenként (frigate, swarmcam-backend,
swarmcam-fire-detector, mosquitto, swarmcam-dashboard) egy sorral.

### 2. Health-polling jitter + MQTT→WebSocket késleltetés

```bash
python3 measure.py latency --duration 120
```

A mérés alatt **generálj eseményeket** (mozogj a kamera előtt, esetleg tarts
tüzet/gyufát a lencse elé egy pillanatra a tűzdetekcióhoz), különben nem lesz
mit mérni az esemény-késleltetésen. Két dolgot mér:
- a `health_loop` 5 másodperces ciklusának tényleges szórását (jitter),
- a Frigate/tűzdetektor MQTT eseménytől a WebSocket-en történő kézbesítésig
  eltelt időt (a backend event-relay pipeline valós késleltetése).

Eredmény: `results/latency.csv`.

### 3. GPU vs CPU-only detekciós sebesség

```bash
python3 measure.py detection --label gpu --duration 60
```

Ezután állítsd át a `docker/frigate/config.yml` detektor szekcióját CPU-only
módra, indítsd újra a frigate konténert (`docker compose restart frigate`),
várj míg stabilizálódik (kb. 30-60mp), majd:

```bash
python3 measure.py detection --label cpu --duration 60
```

Eredmény: `results/detection.csv` — a két `label` sor közvetlenül
összehasonlítható (detektor inferencia-idő ms-ben, összesített detection_fps).
**A mérés után ne felejtsd el visszaállítani a GPU-gyorsítást a config.yml-ben
és újraindítani a frigate konténert.**

## Az eredmények visszaküldése

A `results/*.csv` fájlokat küldd vissza (vagy a tartalmukat írd be a
beszélgetésbe) — ezekből írom meg a szakdolgozat 3.5. fejezetének végleges
szövegét, a jelenlegi placeholder helyére.

---

## Automatizált futtatás (`run_all.py`)

A teljes mérési sorozat kézi beavatkozás nélkül is végigfuttatható:

```bash
../backend/venv/bin/python3 run_all.py              # mindhárom fázis
../backend/venv/bin/python3 run_all.py detection    # csak egy fázis
```

A szkript a `docker/frigate/config.yml`-t írja át fázisonként, újraindítja a
frigate konténert, megvárja a stabilizálódást, majd meghívja a `measure.py`
megfelelő alparancsát. **A futás végén (`finally` ágban) visszaállítja az
eredeti configot** — ez a `benchmark/config.yml.original` fájlba mentődik az
első futáskor.

### Mérési bemenet

A kameraszám-skálázás és a GPU/CPU összehasonlítás azonos bemenetet kíván
minden mérési ponton, különben a különbség nem a vizsgált változóból ered.
Ezért a bemenet egy korábban a telefonokról rögzített, valós H.264 felvétel
(`/media/frigate/bench_source.mp4`, 1280×720, 10 fps, ~24 perc), amit a
Frigate `-re -stream_loop -1` input_args-szal olvas, N különálló kameraként.

A fájl előállítása (a frigate konténerből, a saját felvételekből):

```bash
docker exec frigate sh -c 'D=/media/frigate/recordings/<nap>/<ora>/<kamera>; \
  ls $D/*.mp4 | sort | head -24 | sed "s|^|file |" > /tmp/c1.txt; \
  /usr/lib/ffmpeg/7.0/bin/ffmpeg -y -f concat -safe 0 -i /tmp/c1.txt -c copy -an /tmp/seg.mp4; \
  /usr/lib/ffmpeg/7.0/bin/ffmpeg -y -i /tmp/seg.mp4 -an -vf "fps=10,scale=1280:720" \
    -c:v libx264 -preset veryfast -crf 24 -g 50 -sc_threshold 0 /tmp/clean.mp4'
```

A `-c copy` konkatenálás önmagában **nem elég**: a szegmenshatárokon törött
időbélyegeket hagy, amitől a Frigate ffmpeg-folyamatai újraindulási hurokba
kerülnek, és a mért CPU nagyságrendekkel torzul. Ezért kell az újrakódolás.

### Miért nem a go2rtc-n keresztül?

A Frigate a go2rtc konfigurációjában elutasítja a `{input}` és `{output}`
helyettesítéseket („Invalid substitution found”), így sem `ffmpeg:…#input=`,
sem `exec:…{output}` formában nem adható meg hurkolt fájlforrás. A `#video=copy`
fájlforrás pedig több párhuzamos kamera esetén nem tartja a névleges
képsebességet. A mérés ezért a go2rtc-t kihagyva, közvetlen fájlbemenettel
készül — a go2rtc újracsomagolása kicsi és állandó hozzájárulás.

### Detektor telítése

A `detection` fázis a config-ba `motion.threshold: 10` / `contour_area: 5`
értékeket ír, hogy a detektor gyakorlatilag minden képkockán lefusson.
Alapbeállítás mellett a mozgásmaszk annyira jól szűr, hogy a detektor túl
ritkán szólal meg a megbízható méréshez.

### Esemény-injektálás

Az `inject_events.py` a Frigate formátumával megegyező, szintetikus
eseményeket publikál a `frigate/events` topicra, hogy a `latency` fázis
akkor is tudja mérni az MQTT → backend → WebSocket relay késleltetést,
ha éppen nincs valódi mozgás a kamerák előtt. A backend ezeket nem írja
adatbázisba, csak továbbítja.
