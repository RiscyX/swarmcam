import os
import re
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel

from settings import COMPOSE_FILE


RAW_SUFFIX = "_raw"
_ROTATE_RE = re.compile(r"#rotate=(\d+)")


def _streams(config: dict) -> dict:
    return (config.get("go2rtc") or {}).get("streams") or {}


def _urls(entry) -> list[str]:
    return [entry] if isinstance(entry, str) else [str(u) for u in (entry or [])]


def camera_rotation(config: dict, name: str) -> int:
    """A go2rtc pipeline-ban ténylegesen alkalmazott forgatás (0/90/180/270)."""
    for url in _urls(_streams(config).get(name)):
        m = _ROTATE_RE.search(url)
        if m:
            return int(m.group(1))
    return 0


def camera_source_url(config: dict, name: str) -> str | None:
    """A telefon H.264 URL-je, akárhol is áll épp: a nyers vagy a _raw streamben."""
    streams = _streams(config)
    for key in (name + RAW_SUFFIX, name):
        for url in _urls(streams.get(key)):
            if url.startswith(("http://", "https://")):
                return url
    return None


def auto_detect_size(detect: dict) -> dict:
    """
    Kiveszi a detect fix méretét, hogy a Frigate a streamből olvassa ki
    (a `width`/`height` opcionális). Forgatott kameránál muszáj: a telefon
    felbontása változhat (`streamRes: auto`), a configba írt méret pedig a
    forgatás után nem stimmelne, és a Frigate fekete sávokkal tölti ki a
    különbséget.
    """
    detect = dict(detect)
    detect.pop("width", None)
    detect.pop("height", None)
    return detect


def set_camera_rotation(config: dict, name: str, rotation: int) -> dict:
    """
    A forgatást a go2rtc-ben végezzük, nem a telefonon: a /video/h264 stream
    figyelmen kívül hagyja a rotate paramétert, csak az MJPEG-et forgatja.
    Forgatáskor a nyers telefon-URL a `{name}_raw` streambe kerül, a kamera
    nevén pedig egy ffmpeg transpose forrás áll — így a Frigate detect/record,
    a Frigate UI élő képe és a dashboard is ugyanazt a képállást kapja.
    rotation == 0 esetén visszaáll az újrakódolás nélküli passthrough.

    A `#hardware=cuda` az NVDEC-en dekódol és NVENC-cel kódol vissza
    (`-hwaccel cuda -hwaccel_output_format nv12 ... -vf transpose=N,hwupload`),
    a transpose marad a CPU-n. Mérve 720p25-ön: libx264 44%, NVENC 6% egy
    magból — kb. 7x olcsóbb, és a kimenet pixelre egyezik a szoftveres
    transpose-zal (PSNR 44,7 dB / SSIM 0,993), tehát tényleg forgat.
    """
    src = camera_source_url(config, name)
    if src is None:
        raise KeyError(name)

    go2rtc = config.get("go2rtc") or {}
    streams = go2rtc.get("streams") or {}
    raw = name + RAW_SUFFIX
    if rotation:
        streams[raw] = [src]
        streams[name] = [f"ffmpeg:{raw}#video=h264#rotate={rotation}#hardware=cuda"]
    else:
        streams.pop(raw, None)
        streams[name] = [src]
    go2rtc["streams"] = streams
    config["go2rtc"] = go2rtc

    # A fix detect-méretet csak forgatáskor kell elengedni; 0-ra visszaállva
    # a beállított méret maradjon meg, különben minden forgatás-kapcsolgatás
    # némán elveszítené a Settings oldalon megadott detect felbontást.
    cam = (config.get("cameras") or {}).get(name)
    if cam:
        detect = cam.get("detect") or {"enabled": True}
        cam["detect"] = auto_detect_size(detect) if rotation else detect
    return config


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
        decoder = {
            "tensorrt": "nvidia",
            "onnx":     "nvidia",
            "edgetpu":  "coral",
            "openvino": "intel",
        }.get(t, "cpu")
        break

    detection_fps, detection_width, detection_height = 5, 1920, 1080
    rtsp_transport = "tcp"
    cams = list((config.get("cameras") or {}).values())
    if cams:
        d = cams[0].get("detect", {})
        detection_fps = d.get("fps", detection_fps)
        for inp in cams[0].get("ffmpeg", {}).get("inputs", []):
            args = str(inp.get("input_args", ""))
            rtsp_transport = "udp" if "udp" in args else "tcp"
    # Forgatott kamerán nincs kiírt méret (a Frigate detektálja) — a globális
    # beállítás értékét az első olyan kameráról vesszük, amelyiken van.
    for cam in cams:
        d = cam.get("detect", {})
        if "width" in d and "height" in d:
            detection_width, detection_height = d["width"], d["height"]
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
        "nvidia": {"onnx_0":   {"type": "onnx"}},
        "coral":  {"coral":    {"type": "edgetpu",  "device": "usb"}},
        "intel":  {"openvino": {"type": "openvino", "device": "GPU"}},
        "cpu":    {"cpu1":     {"type": "cpu",      "num_threads": 3}},
    }
    if s.decoder in detector_map:
        config["detectors"] = detector_map[s.decoder]
    config["objects"] = {
        "track": s.objects,
        "filters": {"person": {"min_area": 2000, "min_score": 0.6, "threshold": 0.7}},
    }
    config.setdefault("record", {})
    config["record"].setdefault("motion", {})["days"] = s.record_motion_days
    config["record"].setdefault("detections", {}).setdefault("retain", {})["days"] = s.record_event_days
    config["record"].setdefault("alerts",     {}).setdefault("retain", {})["days"] = s.record_event_days

    for cam_name, cam in (config.get("cameras") or {}).items():
        detect = {
            "enabled": True,
            "width":   s.detection_width,
            "height":  s.detection_height,
            "fps":     s.detection_fps,
        }
        if camera_rotation(config, cam_name):
            detect = auto_detect_size(detect)
        cam["detect"] = detect
        ffmpeg = cam.setdefault("ffmpeg", {})
        ffmpeg.pop("hwaccel_args", None)
        # A Frigate csak akkor cseréli ki a presetet, ha az input_args pontosan
        # a preset neve — nyers kapcsolót nem szabad mellé fűzni, mert akkor
        # az ffmpeg a preset nevét kimeneti fájlnak veszi és elszáll.
        #
        # Forgatott kameránál a go2rtc újrakódol, és a transzkód elveszti az
        # időbélyegeket (a stream 90k tbr-rel jön). A detect ág `fps=5` szűrője
        # PTS alapján válogat, így nulla frame-et adna — a record ág (`-c:v
        # copy`) közben látszólag működik. A generic preset `+genpts` és
        # `-use_wallclock_as_timestamps 1` kapcsolói pótolják a bélyegeket.
        if s.rtsp_transport == "udp":
            preset = "preset-rtsp-udp"
        elif camera_rotation(config, cam_name):
            preset = "preset-rtsp-generic"
        else:
            preset = "preset-rtsp-restream"
        for inp in ffmpeg.get("inputs", []):
            inp["input_args"] = preset

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
