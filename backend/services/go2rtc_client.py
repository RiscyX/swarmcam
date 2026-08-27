"""go2rtc HTTP REST API kliens — streamek dinamikus módosítása Frigate restart nélkül.

A go2rtc (a Frigate-be ágyazva) REST API-t kínál a stream konfiguráció
módosítására a futó folyamatban. Ez a modul ezeket a hívásokat csomagolja
async függvényekbe, hogy a backend többi része egyszerűen használhassa.

API referencia: https://github.com/AlexxIT/go2rtc (PUT/PATCH/DELETE /api/streams)
"""
import asyncio
import logging

import requests as http

from settings import GO2RTC_API_URL

logger = logging.getLogger(__name__)
_TIMEOUT = 3  # másodperc — go2rtc helyi hálózaton, gyors válasz


async def go2rtc_list_streams() -> dict:
    """Visszaadja az összes go2rtc stream állapotát."""
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.get(f"{GO2RTC_API_URL}/api/streams", timeout=_TIMEOUT),
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        logger.warning("go2rtc LIST streams failed: %s", e)
    return {}


async def go2rtc_put_stream(name: str, src: str) -> bool:
    """Létrehozza vagy lecseréli a megadott streamet.

    A PUT művelet teljesen lecseréli a stream forrását. Ha a stream nem
    létezik, létrehozza. A módosítás azonnal érvénybe lép a go2rtc
    in-memory állapotában, és persistálódik a go2rtc config fájlba.

    Visszatérés: True ha a művelet sikeres (200 OK).
    """
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.put(
                f"{GO2RTC_API_URL}/api/streams",
                params={"name": name, "src": src},
                timeout=_TIMEOUT,
            ),
        )
        if r.status_code == 200:
            logger.info("go2rtc PUT stream '%s' = '%s'", name, src)
            return True
        logger.warning("go2rtc PUT stream '%s' failed: HTTP %d", name, r.status_code)
    except Exception as e:
        logger.warning("go2rtc PUT stream '%s' failed: %s", name, e)
    return False


async def go2rtc_delete_stream(name: str) -> bool:
    """Törli a megadott streamet a go2rtc-ből.

    Visszatérés: True ha a művelet sikeres (200 OK).
    """
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.delete(
                f"{GO2RTC_API_URL}/api/streams",
                params={"src": name},
                timeout=_TIMEOUT,
            ),
        )
        if r.status_code == 200:
            logger.info("go2rtc DELETE stream '%s'", name)
            return True
        logger.warning("go2rtc DELETE stream '%s' failed: HTTP %d", name, r.status_code)
    except Exception as e:
        logger.warning("go2rtc DELETE stream '%s' failed: %s", name, e)
    return False


async def go2rtc_is_available() -> bool:
    """Ellenőrzi, hogy a go2rtc HTTP API elérhető-e."""
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.get(f"{GO2RTC_API_URL}/api/streams", timeout=1),
        )
        return r.status_code == 200
    except Exception:
        return False
