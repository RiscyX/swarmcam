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
