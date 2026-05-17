import asyncio

from fastapi import APIRouter, HTTPException

import state
from services.frigate_client import frigate_post
from services.frigate_config import (
    ConfigSettings,
    apply_settings,
    extract_settings,
    read_yaml,
    update_compose_nvidia,
    write_yaml,
)
from settings import COMPOSE_CMD, FRIGATE_CONFIG

router = APIRouter()


@router.get("/api/config", response_model=ConfigSettings)
def get_config():
    if not FRIGATE_CONFIG.exists():
        raise HTTPException(404, "Frigate config not found")
    return extract_settings(read_yaml(FRIGATE_CONFIG))


@router.post("/api/config")
async def save_config(settings: ConfigSettings):
    if not FRIGATE_CONFIG.exists():
        raise HTTPException(404, "Frigate config not found")

    loop = asyncio.get_event_loop()
    old = extract_settings(read_yaml(FRIGATE_CONFIG))
    decoder_changed = old.decoder != settings.decoder

    config = read_yaml(FRIGATE_CONFIG)
    write_yaml(FRIGATE_CONFIG, apply_settings(config, settings))

    if decoder_changed:
        update_compose_nvidia(settings.decoder == "nvidia")

    frigate_restarted = False
    if decoder_changed:
        proc = await asyncio.create_subprocess_exec(
            *COMPOSE_CMD, "up", "-d", "--force-recreate", "frigate",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        frigate_restarted = True
    else:
        try:
            r = await frigate_post("/api/restart")
            frigate_restarted = r.ok
        except Exception:
            pass

    return {"ok": True, "decoder_changed": decoder_changed, "frigate_restarted": frigate_restarted}
