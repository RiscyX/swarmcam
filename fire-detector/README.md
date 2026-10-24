# SwarmCam Fire Detector

Ez egy microservice a SwarmCam projekthez, ami MQTT-n keresztül riasztásokat küld, ha tüzet vagy füstöt érzékel a kamerák képén. Egy harmadik fél által előre tanított **YOLO26s** modellt futtat. A kameralistát a backendtől kéri le, a képet közvetlenül az Android IP Camera `https://{ip}:{port}/video/mjpeg` folyamának első teljes JPEG-képkockájából olvassa ki.

## Modell információk
- **Architektúra**: YOLO26s (`yolo26s.yaml`, `yolo26s.pt` a helyi checkpoint metaadataiban; nem YOLOv8, és nem „YOLOv2.6”).
- **Forrás URL**: [https://huggingface.co/SalahALHaismawi/yolov26-fire-detection](https://huggingface.co/SalahALHaismawi/yolov26-fire-detection)
- **Modell fájl letöltése**: A modell fájl mérete miatt nincs a git repóba commitolva. A modell futtatásához töltsd le a `best.pt` fájlt a fenti linkről, és helyezd el a `models/fire_smoke.pt` néven a `models` könyvtárban.
- **Osztálylista (Classes)**: `{0: 'fire', 1: 'other', 2: 'smoke'}`
- **Input méret**: YOLO default (640x640)
- **Ellenőrzött súlyfájl SHA-256**: `52684ddffd4797f1bc5ff1bd2b72af3ec34eabf0c1646c37f518bb766b27b79f` — egyezik a közzétevő `best.pt` fájljával (ellenőrizve: 2026-10-24).

## Licenc

A SwarmCam kódja [AGPL-3.0-only](../LICENSE), az Ultralytics könyvtár AGPL-3.0 licencű. Megőrizzük a modell közzétevőjének MIT-nyilatkozatát és szerzői hivatkozását, és az integrált alkalmazásra teljesítjük az alapul szolgáló Ultralytics AGPL-feltételeit. Az MIT-jelölést nem használjuk az AGPL-kötelezettségek eltávolítására; a súlyfájl beágyazott licencmezője is `AGPL-3.0`. Az [eredeti modellkártya](../licenses/model-provenance/YOLO26s-model-card.md) rögzített verzióban mellékelve van. A súlyfájl nincs Gitben terjesztve. Források és hatókör: [külső licencek](../docs/THIRD_PARTY_LICENSES.md).

## Validálási tapasztalatok
A modellt helyben generált képeken validáltuk a következő eredménnyel:
- **Tábortűz kép**: Detektált `fire` (91% confidence).
- **Épülettűz sűrű füsttel kép**: Detektált `smoke` (90% confidence), valamint `fire` (43% confidence).
- **Napos erdei táj (tűz nélkül)**: Helyesen nem jelzett tévesen tüzet (0 detection).
Ez három szemléltető próba, nem reprezentatív pontosságmérés. A kód és a Compose-konfiguráció riasztási küszöbe **0,8**, nem 0,5; a konfidencia nem a rendszer mért pontossága. A Frigate `benchmark/results/detection.csv` fájlban szereplő inferenciaideje nem ennek a külön tűzmodellnek a mérése.

## Futtatás Dockerrel
```bash
docker build -t swarmcam-fire-detector .
docker run -e MQTT_HOST=mosquitto -e BACKEND_URL=http://backend:8000 swarmcam-fire-detector
```

## Környezeti változók
- `MQTT_HOST`: Az MQTT broker címe (default: localhost)
- `MQTT_PORT`: Az MQTT broker portja (default: 1883)
- `BACKEND_URL`: A backend címe, ahonnan a kameralistát lekérdezi (default: http://localhost:8000)
- `SCAN_INTERVAL`: Hány másodpercenként ellenőrizze a kamerákat (default: 5)
- `CONFIDENCE`: Mi az a legkisebb bizonyosság (0.0 - 1.0), ami felett riasztást küld (default: 0.8)
- `MODEL_PATH`: A modell fájl elérési útja (default: models/fire_smoke.pt)
