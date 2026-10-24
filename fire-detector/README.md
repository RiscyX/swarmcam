# SwarmCam Fire Detector

A microservice for SwarmCam that sends alerts over MQTT when it detects fire or smoke in the camera images. It runs a third-party pretrained **YOLO26s** model. It fetches the camera list from the backend and reads the image directly from the first complete JPEG frame of the Android IP Camera `https://{ip}:{port}/video/mjpeg` stream.

## Model information
- **Architecture**: YOLO26s (`yolo26s.yaml`, `yolo26s.pt` in the local checkpoint's metadata; not YOLOv8, and not "YOLOv2.6").
- **Source URL**: [https://huggingface.co/SalahALHaismawi/yolov26-fire-detection](https://huggingface.co/SalahALHaismawi/yolov26-fire-detection)
- **Downloading the model file**: because of its size, the model file is not committed to the git repo. To run the model, download `best.pt` from the link above and place it in the `models` directory as `models/fire_smoke.pt`.
- **Classes**: `{0: 'fire', 1: 'other', 2: 'smoke'}`
- **Input size**: YOLO default (640x640)
- **Verified weight file SHA-256**: `52684ddffd4797f1bc5ff1bd2b72af3ec34eabf0c1646c37f518bb766b27b79f` — matches the publisher's `best.pt` (checked: 2026-10-24).

## License

SwarmCam's code is [AGPL-3.0-only](../LICENSE); the Ultralytics library is AGPL-3.0. We retain the model publisher's MIT declaration and attribution, and comply with the underlying Ultralytics AGPL terms for the integrated application. The MIT label is not used to remove AGPL obligations; the weight file's embedded license field is also `AGPL-3.0`. The [original model card](../licenses/model-provenance/YOLO26s-model-card.md) is included at a pinned revision. The weight file is not distributed in Git. Sources and scope: [third-party licenses](../docs/THIRD_PARTY_LICENSES.md).

## Validation notes
The model was tried on locally generated images with the following results:
- **Campfire image**: detected `fire` (91% confidence).
- **Building fire with dense smoke**: detected `smoke` (90% confidence) and `fire` (43% confidence).
- **Sunny forest landscape (no fire)**: correctly raised no false fire alarm (0 detections).

These are three illustrative checks, not a representative accuracy measurement. The alert threshold in the code and the Compose configuration is **0.8**, not 0.5; confidence is not the system's measured accuracy. The inference time in Frigate's `benchmark/results/detection.csv` is not a measurement of this separate fire model.

## Running with Docker
```bash
docker build -t swarmcam-fire-detector .
docker run -e MQTT_HOST=mosquitto -e BACKEND_URL=http://backend:8000 swarmcam-fire-detector
```

## Environment variables
- `MQTT_HOST`: MQTT broker address (default: localhost)
- `MQTT_PORT`: MQTT broker port (default: 1883)
- `BACKEND_URL`: backend address to fetch the camera list from (default: http://localhost:8000)
- `SCAN_INTERVAL`: how often to check the cameras, in seconds (default: 5)
- `CONFIDENCE`: minimum confidence (0.0 - 1.0) above which an alert is sent (default: 0.8)
- `MODEL_PATH`: path to the model file (default: models/fire_smoke.pt)
