import os
import re
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel

from settings import COMPOSE_FILE


class ConfigSettings(BaseModel):
    decoder: Literal["cpu", "nvidia", "intel", "coral"] = "cpu"
    detection_fps: int = 5
    detection_width: int = 1920
    detection_height: int = 1080
    rtsp_transport: Literal["tcp", "udp"] = "tcp"
    record_motion_days: int = 7
    record_event_days: int = 14
    objects: list[str] = ["person", "car", "cat", "dog"]


def read_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f) or {}


def write_yaml(path: Path, data: dict) -> None:
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def extract_settings(config: dict) -> ConfigSettings:
    decoder = "cpu"
    for _, det in (config.get("detectors") or {}).items():
        t = det.get("type", "cpu")
        decoder = {"tensorrt": "nvidia", "edgetpu": "coral", "openvino": "intel"}.get(t, "cpu")
        break

    detection_fps, detection_width, detection_height = 5, 1920, 1080
    rtsp_transport = "tcp"
    for cam in (config.get("cameras") or {}).values():
        d = cam.get("detect", {})
        detection_fps    = d.get("fps", detection_fps)
        detection_width  = d.get("width", detection_width)
        detection_height = d.get("height", detection_height)
        for inp in cam.get("ffmpeg", {}).get("inputs", []):
            args = str(inp.get("input_args", ""))
            rtsp_transport = "udp" if "udp" in args else "tcp"
        break

    rec = config.get("record", {})
    record_motion_days = (rec.get("motion") or {}).get("days", 7)
    record_event_days  = (rec.get("detections") or {}).get("retain", {}).get("days", 14)

    return ConfigSettings(
        decoder=decoder,
        detection_fps=detection_fps,
        detection_width=detection_width,
        detection_height=detection_height,
        rtsp_transport=rtsp_transport,
        record_motion_days=record_motion_days,
        record_event_days=record_event_days,
        objects=(config.get("objects") or {}).get("track", ["person", "car", "cat", "dog"]),
    )


def apply_settings(config: dict, s: ConfigSettings) -> dict:
    detector_map = {
        "nvidia": {"cpu1":     {"type": "cpu",      "num_threads": 3}},
        "coral":  {"coral":    {"type": "edgetpu",  "device": "usb"}},
        "intel":  {"openvino": {"type": "openvino", "device": "GPU"}},
        "cpu":    {"cpu1":     {"type": "cpu",      "num_threads": 3}},
    }
    config["detectors"] = detector_map[s.decoder]
    config["objects"] = {
        "track": s.objects,
        "filters": {"person": {"min_area": 2000, "min_score": 0.6, "threshold": 0.7}},
    }
    config.setdefault("record", {})
    config["record"].setdefault("motion", {})["days"] = s.record_motion_days
    config["record"].setdefault("detections", {}).setdefault("retain", {})["days"] = s.record_event_days
    config["record"].setdefault("alerts",     {}).setdefault("retain", {})["days"] = s.record_event_days

    for cam in (config.get("cameras") or {}).values():
        cam["detect"] = {
            "enabled": True,
            "width":   s.detection_width,
            "height":  s.detection_height,
            "fps":     s.detection_fps,
        }
        ffmpeg = cam.setdefault("ffmpeg", {})
        ffmpeg.pop("hwaccel_args", None)
        for inp in ffmpeg.get("inputs", []):
            current = inp.get("input_args", "")
            cleaned = re.sub(r"-rtsp_transport\s+\S+", "", current).strip()
            transport = f"-rtsp_transport {s.rtsp_transport}"
            inp["input_args"] = f"{transport} {cleaned}".strip() if cleaned else transport

    return config


def compose_writable() -> bool:
    """A compose fájl :ro mountról is olvasható, de írni csak rw mountról lehet."""
    return COMPOSE_FILE.exists() and os.access(COMPOSE_FILE, os.W_OK)


def update_compose_nvidia(enable: bool) -> None:
    compose = read_yaml(COMPOSE_FILE)
    frigate_svc = compose["services"]["frigate"]
    env = frigate_svc.get("environment") or {}
    if isinstance(env, list):
        env = dict(e.split("=", 1) for e in env)

    if enable:
        frigate_svc["runtime"] = "nvidia"
        env.update({"NVIDIA_VISIBLE_DEVICES": "all", "NVIDIA_DRIVER_CAPABILITIES": "all"})
    else:
        frigate_svc.pop("runtime", None)
        env.pop("NVIDIA_VISIBLE_DEVICES", None)
        env.pop("NVIDIA_DRIVER_CAPABILITIES", None)

    frigate_svc["environment"] = env
    write_yaml(COMPOSE_FILE, compose)
