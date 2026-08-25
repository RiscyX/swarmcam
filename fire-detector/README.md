# SwarmCam Fire Detector

Ez egy microservice a SwarmCam projekthez, ami MQTT-n keresztül riasztásokat küld, ha tüzet (vagy füstöt) érzékel a kamerák képén. A szolgáltatás egy előre tanított YOLOv2.6 modellt használ a detektáláshoz, a kamerák képét pedig az IP Webcam backend proxyn keresztül éri el.

## Modell információk
- **Név**: YOLOv2.6 Fire & Smoke Detection
- **Forrás URL**: [https://huggingface.co/SalahALHaismawi/yolov26-fire-detection](https://huggingface.co/SalahALHaismawi/yolov26-fire-detection)
- **Modell fájl letöltése**: A modell fájl mérete miatt nincs a git repóba commitolva. A modell futtatásához töltsd le a `best.pt` fájlt a fenti linkről, és helyezd el a `models/fire_smoke.pt` néven a `models` könyvtárban.
- **Osztálylista (Classes)**: `{0: 'fire', 1: 'other', 2: 'smoke'}`
- **Input méret**: YOLO default (640x640)

## Validálási tapasztalatok
A modellt helyben generált képeken validáltuk a következő eredménnyel:
- **Tábortűz kép**: Detektált `fire` (91% confidence).
- **Épülettűz sűrű füsttel kép**: Detektált `smoke` (90% confidence), valamint `fire` (43% confidence).
- **Napos erdei táj (tűz nélkül)**: Helyesen nem jelzett tévesen tüzet (0 detection).
Tapasztalat alapján az 50% (0.5) confidence limit megfelelően kiszűri a téves riasztásokat, miközben a valódi tüzet/füstöt nagy pontossággal felismeri.

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
- `CONFIDENCE`: Mi az a legkisebb bizonyosság (0.0 - 1.0), ami felett riasztást küld (default: 0.5)
- `MODEL_PATH`: A modell fájl elérési útja (default: models/fire_smoke.pt)
