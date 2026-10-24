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
    """The rotation actually applied in the go2rtc pipeline (0/90/180/270)."""
    for url in _urls(_streams(config).get(name)):
        m = _ROTATE_RE.search(url)
        if m:
            return int(m.group(1))
    return 0


def camera_source_url(config: dict, name: str) -> str | None:
    """The phone's H.264 URL, wherever it currently sits: in the plain or the _raw stream."""
    streams = _streams(config)
    for key in (name + RAW_SUFFIX, name):
        for url in _urls(streams.get(key)):
            if url.startswith(("http://", "https://")):
                return url
    return None


def auto_detect_size(detect: dict) -> dict:
    """
    Removes the fixed detect size so Frigate reads it from the stream
    (`width`/`height` are optional). Required for rotated cameras: the phone's
    resolution may change (`streamRes: auto`), and a size written into the
    config would not match after rotation, so Frigate would fill the
    difference with black bars.
    """
    detect = dict(detect)
    detect.pop("width", None)
    detect.pop("height", None)
    return detect


def set_camera_rotation(config: dict, name: str, rotation: int) -> dict:
    """
    Rotation is done in go2rtc, not on the phone: the /video/h264 stream
    ignores the rotate parameter, only MJPEG is rotated.
    When rotating, the plain phone URL moves to the `{name}_raw` stream and the
    camera's own name gets an ffmpeg transpose source — so Frigate detect/record,
    the Frigate UI live view and the dashboard all get the same orientation.
    rotation == 0 restores the passthrough without re-encoding.

    `#hardware=cuda` decodes on NVDEC and re-encodes with NVENC
    (`-hwaccel cuda -hwaccel_output_format nv12 ... -vf transpose=N,hwupload`),
    the transpose stays on the CPU. Measured on 720p25: libx264 44%, NVENC 6% of
    one core — about 7x cheaper, and the output matches the software transpose
    pixel for pixel (PSNR 44.7 dB / SSIM 0.993), so it really does rotate.
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

    # The fixed detect size only needs to be dropped when rotating; when set back
    # to 0 the configured size must stay, otherwise every rotation toggle would
    # silently lose the detect resolution set on the Settings page.
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
    # Rotated cameras have no explicit size (Frigate detects it) — the global
    # setting's value is taken from the first camera that has one.
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
        # Frigate only substitutes the preset if input_args is exactly the
        # preset name — no raw flag may be appended, otherwise ffmpeg takes
        # the preset name as an output file and crashes.
        #
        # For rotated cameras go2rtc re-encodes, and the transcode loses the
        # timestamps (the stream arrives with 90k tbr). The detect branch's
        # `fps=5` filter selects on PTS, so it would emit zero frames — while the
        # record branch (`-c:v copy`) seemingly works. The generic preset's
        # `+genpts` and `-use_wallclock_as_timestamps 1` flags restore them.
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
    """The compose file can be read from a :ro mount, but only written through an rw mount."""
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
