import os
import time
import json
import logging
import io
import requests
import base64
import urllib3
import cv2
from PIL import Image
from paho.mqtt import client as mqtt_client
from ultralytics import YOLO

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configuration from environment variables
MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
SCAN_INTERVAL = int(os.getenv("SCAN_INTERVAL", 5))
CONFIDENCE = float(os.getenv("CONFIDENCE", 0.5))
MODEL_PATH = os.getenv("MODEL_PATH", "models/fire_smoke.pt")

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# MQTT Setup
client_id = f'fire-detector-{int(time.time())}'

def connect_mqtt():
    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            logger.info("Connected to MQTT Broker!")
        else:
            logger.error(f"Failed to connect to MQTT broker, return code {rc}")
            
    client = mqtt_client.Client(mqtt_client.CallbackAPIVersion.VERSION1, client_id)
    client.on_connect = on_connect
    
    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT)
            client.loop_start()
            return client
        except Exception as e:
            logger.error(f"MQTT connection failed: {e}. Retrying in 10 seconds...")
            time.sleep(10)

def get_cameras():
    try:
        response = requests.get(f"{BACKEND_URL}/api/cameras", timeout=5)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Failed to fetch cameras from backend: {e}")
        return None

def main():
    logger.info("Initializing Fire/Smoke Detector...")
    
    # Load model
    try:
        model = YOLO(MODEL_PATH)
        logger.info(f"Model loaded successfully from {MODEL_PATH}")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return

    mqtt_c = connect_mqtt()
    
    while True:
        cameras = get_cameras()
        
        if not cameras:
            logger.warning("Camera list is empty or backend unavailable. Waiting 30s...")
            time.sleep(30)
            continue
            
        for cam in cameras:
            cam_name = cam.get("name")
            cam_host = cam.get("ip")
            cam_port = cam.get("port")
            
            if not cam_name or not cam_host or not cam_port:
                logger.warning(f"Invalid camera data: {cam}")
                continue
                
            try:
                # Fetch first MJPEG frame as snapshot (app has no still-image endpoint)
                with requests.get(f"https://{cam_host}:{cam_port}/video/mjpeg",
                                  stream=True, timeout=5, verify=False) as resp:
                    resp.raise_for_status()
                    buf = b""
                    for chunk in resp.iter_content(chunk_size=4096):
                        buf += chunk
                        start = buf.find(b"\xff\xd8")
                        end = buf.find(b"\xff\xd9", start + 2)
                        if start != -1 and end != -1:
                            img_bytes = buf[start:end + 2]
                            break
                    else:
                        raise ValueError("no complete JPEG frame received")

                img = Image.open(io.BytesIO(img_bytes))
                
                # Run inference
                results = model(img, verbose=False)
                
                for r in results:
                    for box in r.boxes:
                        conf = box.conf.item()
                        if conf >= CONFIDENCE:
                            cls_id = int(box.cls.item())
                            label = model.names[cls_id]
                            
                            # Publish if fire or smoke
                            if label.lower() in ["fire", "smoke"]:
                                payload = {
                                    "camera": cam_name,
                                    "label": label.lower(),
                                    "score": round(conf, 3)
                                }
                                
                                try:
                                    frame = r.plot()
                                    h, w = frame.shape[:2]
                                    if w > 1280:
                                        new_w = 1280
                                        new_h = int(h * (1280 / w))
                                        frame = cv2.resize(frame, (new_w, new_h))
                                        
                                    success, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                                    if success:
                                        payload["image"] = base64.b64encode(buffer).decode('utf-8')
                                except Exception as e:
                                    logger.error(f"Failed to generate annotated snapshot for {cam_name}: {e}")
                                
                                topic = f"swarmcam/fire/{cam_name}"
                                mqtt_c.publish(topic, json.dumps(payload))
                                
                                log_payload = payload.copy()
                                if "image" in log_payload:
                                    log_payload["image"] = "<base64 JPEG>"
                                logger.info(f"Published detection on {topic}: {log_payload}")
                                
            except Exception as e:
                logger.error(f"Error processing camera {cam_name}: {e}")
                
        time.sleep(SCAN_INTERVAL)

if __name__ == "__main__":
    main()
