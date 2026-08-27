#!/usr/bin/env python3
"""
SwarmCam benchmark orchestrator (szakdolgozat 3.5. fejezet).

Automatikusan végigfuttatja a mérési sorozatot:
  1) resources  – CPU/RAM N = 0,1,2,3,4 kameránál
  2) detection  – GPU (ONNX/CUDA) vs CPU-only inferencia, azonos modellel
  3) latency    – health_loop jitter + MQTT -> WebSocket relay késleltetés

A kameraszám-skálázáshoz ugyanazt a fizikai telefonstreamet regisztrálja N
külön Frigate kameraként: a szerveroldali erőforrásigény szempontjából a forrás
azonossága közömbös, minden kamera saját ffmpeg dekóder- és detect-folyamattal
fut. A futás végén az eredeti config.yml visszaáll.
"""
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CFG = os.path.join(ROOT, "docker", "frigate", "config.yml")
CFG_ORIG = os.path.join(HERE, "config.yml.original")
COMPOSE_DIR = os.path.join(ROOT, "docker")
PY = os.path.join(ROOT, "backend", "venv", "bin", "python3")
MEASURE = os.path.join(HERE, "measure.py")


def _env(key, default):
    """A docker/.env-bol olvassa ki a Frigate belepesi adatait."""
    path = os.path.join(ROOT, "docker", ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            if line.strip().startswith(key + "="):
                return line.split("=", 1)[1].strip()
    return default


FRIGATE_USER = _env("DEFAULT_USER", "admin")
FRIGATE_PASS = _env("DEFAULT_PASSWORD", "admin")

REAL_CAM = "bench_cam_1"
# A meresi bemenet a telefonokrol korabban rogzitett, valos H.264 felvetel (1280x720),
# ciklikusan visszajatszva. Igy minden meresi pont pontosan azonos bemenetet kap.
BENCH_FILE = "/media/frigate/bench_source.mp4"


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


BASE_HEAD = """auth:
  enabled: true
mqtt:
  enabled: true
  host: localhost
  port: 1883
detectors:
  onnx_0:
    type: onnx
{device_line}model:
  model_type: yolo-generic
  width: 320
  height: 320
  input_tensor: nchw
  input_dtype: float
  path: /config/model_cache/yolo.onnx
  labelmap_path: /labelmap/coco-80.txt
objects:
  track:
  - person
  - car
  - cat
  - dog
  filters:
    person:
      min_area: 2000
      min_score: 0.6
      threshold: 0.7
record:
  enabled: true
  alerts:
    retain:
      days: 14
  detections:
    retain:
      days: 14
  continuous:
    days: 0
  motion:
    days: 7
snapshots:
  enabled: true
  timestamp: true
  bounding_box: false
  retain:
    default: 14
"""

BASE_TAIL = """version: 0.17-0
semantic_search:
  enabled: false
  model_size: small
face_recognition:
  enabled: true
  model_size: small
lpr:
  enabled: false
classification:
  bird:
    enabled: false
"""


def cam_names(n):
    names = []
    for i in range(1, n + 1):
        names.append(f"bench_cam_{i}")
    return names


def build_config(n_cams, cpu_only=False, force_detect=False):
    """force_detect: a mozgasmaszk kuszobet minimumra veszi, igy a detektor
    gyakorlatilag minden kepkockan lefut -- ez telíti a detektort, ami a
    GPU/CPU osszehasonlitashoz kell (a mozgasfuggo alapbeallitas mellett a
    detektor tul ritkan futna ahhoz, hogy merheto legyen)."""
    device_line = "    device: CPU\n" if cpu_only else ""
    out = BASE_HEAD.format(device_line=device_line)
    if force_detect:
        out += "motion:\n  threshold: 10\n  contour_area: 5\n  improve_contrast: true\n"
    names = cam_names(n_cams)
    if names:
        out += "cameras:\n"
        for nm in names:
            out += (
                f"  {nm}:\n"
                f"    ffmpeg:\n"
                f"      inputs:\n"
                f"      - path: {BENCH_FILE}\n"
                f"        input_args: -re -stream_loop -1\n"
                f"        roles:\n"
                f"        - detect\n"
                f"        - record\n"
                f"    detect:\n"
                f"      enabled: true\n"
                f"      width: 640\n"
                f"      height: 360\n"
                f"      fps: 5\n"
            )
    else:
        # Frigate legalabb egy kamerat kovetel -> a detect kikapcsolasaval
        # kapunk "0 aktiv kamera" alapvonalat (csak a stack overheadje).
        out += (
            f"cameras:\n"
            f"  {REAL_CAM}:\n"
            f"    enabled: false\n"
            f"    ffmpeg:\n"
            f"      inputs:\n"
            f"      - path: {BENCH_FILE}\n"
            f"        input_args: -re -stream_loop -1\n"
            f"        roles:\n"
            f"        - detect\n"
            f"        - record\n"
        )
    out += BASE_TAIL
    return out


def write_cfg(text):
    with open(CFG, "w", encoding="utf-8") as f:
        f.write(text)


def restart_frigate():
    subprocess.run(["docker", "compose", "restart", "frigate"], cwd=COMPOSE_DIR,
                   capture_output=True, timeout=180)


def wait_healthy(timeout=180):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen("http://localhost:5000/api/stats", timeout=5) as r:
                json.loads(r.read())
                return True
        except Exception:
            time.sleep(3)
    return False


def measure(*args):
    cmd = [PY, MEASURE] + list(args)
    log("  -> " + " ".join(args))
    p = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True, timeout=900)
    sys.stdout.write(p.stdout)
    sys.stderr.write(p.stderr)
    sys.stdout.flush()


def phase_resources():
    for n in [0, 1, 2, 3, 4]:
        log(f"=== resources: {n} kamera ===")
        write_cfg(build_config(n))
        restart_frigate()
        if not wait_healthy():
            log("  !! frigate nem allt fel, kihagyva")
            continue
        log("  stabilizalas 60s...")
        time.sleep(60)
        measure("resources", "--duration", "60", "--cameras", str(n))


def phase_detection():
    for label, cpu_only, settle in [("gpu", False, 60), ("cpu", True, 90)]:
        log(f"=== detection: {label} (3 kamera) ===")
        write_cfg(build_config(3, cpu_only=cpu_only, force_detect=True))
        restart_frigate()
        if not wait_healthy(240):
            log("  !! frigate nem allt fel, kihagyva")
            continue
        log(f"  stabilizalas {settle}s...")
        time.sleep(settle)
        measure("detection", "--label", label, "--duration", "60",
                "--user", FRIGATE_USER, "--password", FRIGATE_PASS)


def phase_latency():
    log("=== latency (eredeti config) ===")
    shutil.copy(CFG_ORIG, CFG)
    restart_frigate()
    wait_healthy()
    log("  stabilizalas 45s...")
    time.sleep(45)
    # szintetikus esemenyinjektor a relay-keslelteteshez
    inj = subprocess.Popen([PY, os.path.join(HERE, "inject_events.py"), "30", "3"],
                           cwd=HERE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    measure("latency", "--duration", "120")
    inj.terminate()


def main():
    only = sys.argv[1:] or ["resources", "detection", "latency"]
    if not os.path.exists(CFG_ORIG):
        shutil.copy(CFG, CFG_ORIG)
        log(f"eredeti config elmentve: {CFG_ORIG}")
    try:
        if "resources" in only:
            phase_resources()
        if "detection" in only:
            phase_detection()
        if "latency" in only:
            phase_latency()
    finally:
        log("=== visszaallitas ===")
        shutil.copy(CFG_ORIG, CFG)
        restart_frigate()
        ok = wait_healthy()
        log(f"eredeti config visszaallitva, frigate healthy={ok}")


if __name__ == "__main__":
    main()
