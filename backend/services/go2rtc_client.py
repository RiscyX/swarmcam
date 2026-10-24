"""go2rtc HTTP REST API client — changes streams dynamically without a Frigate restart.

go2rtc (embedded in Frigate) offers a REST API for changing the stream
configuration in the running process. This module wraps those calls in
async functions so the rest of the backend can use them easily.

API referencia: https://github.com/AlexxIT/go2rtc (PUT/PATCH/DELETE /api/streams)
"""
import asyncio
import logging

import requests as http

from settings import GO2RTC_API_URL

logger = logging.getLogger(__name__)
_TIMEOUT = 3  # seconds — go2rtc is on the local network, replies fast


async def go2rtc_list_streams() -> dict:
    """Returns the state of every go2rtc stream."""
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
    """Creates or replaces the given stream.

    PUT replaces the stream's source entirely. If the stream does not exist,
    it is created. The change takes effect immediately in go2rtc's in-memory
    state and is persisted to the go2rtc config file.

    Returns: True if the operation succeeded (200 OK).
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
    """Deletes the given stream from go2rtc.

    Returns: True if the operation succeeded (200 OK).
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
    """Checks whether the go2rtc HTTP API is reachable."""
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: http.get(f"{GO2RTC_API_URL}/api/streams", timeout=1),
        )
        return r.status_code == 200
    except Exception:
        return False
