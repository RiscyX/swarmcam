import asyncio
import ipaddress
from pathlib import Path

from fastapi import APIRouter

import state
from services.frigate_config import read_yaml
from settings import COMPOSE_FILE, FRIGATE_URL

router = APIRouter()


@router.get("/api/networks")
def get_networks():
    results = []
    seen: set[str] = set()

    # Primary: derive subnet from registered cameras (most reliable in Docker).
    # If cameras are at 192.168.0.x we know the correct /24 subnet.
    for cam in state._last_cameras:
        ip = cam.get("ip", "")
        if not ip:
            continue
        try:
            subnet = str(ipaddress.IPv4Network(f"{ip}/24", strict=False))
            if subnet not in seen:
                seen.add(subnet)
                results.append({"iface": "cameras", "ip": ip, "subnet": subnet})
        except Exception:
            pass

    # Fallback: netifaces (works when not inside Docker or host-networked)
    try:
        import netifaces
        for iface in netifaces.interfaces():
            addrs = netifaces.ifaddresses(iface).get(netifaces.AF_INET, [])
            for addr in addrs:
                ip = addr.get("addr", "")
                netmask = addr.get("netmask", "255.255.255.0")
                if not ip or ip.startswith("127.") or ip.startswith("172."):
                    continue
                try:
                    subnet = str(ipaddress.IPv4Network(f"{ip}/{netmask}", strict=False))
                    if subnet not in seen:
                        seen.add(subnet)
                        results.append({"iface": iface, "ip": ip, "subnet": subnet})
                except Exception:
                    pass
    except Exception:
        pass

    return results


@router.get("/api/system")
async def get_system():
    async def _run(cmd: list[str]) -> bool:
        try:
            p = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await p.wait()
            return p.returncode == 0
        except Exception:
            return False

    nvidia_gpu = await _run(["nvidia-smi"])
    nvidia_docker = False
    if COMPOSE_FILE.exists():
        compose = read_yaml(COMPOSE_FILE)
        nvidia_docker = compose.get("services", {}).get("frigate", {}).get("runtime") == "nvidia"

    return {
        "nvidia_gpu":    nvidia_gpu,
        "nvidia_docker": nvidia_docker,
        "intel_gpu":     Path("/dev/dri/renderD128").exists(),
    }


@router.get("/api/debug/health")
def debug_health():
    return {
        "cameras":    state._last_cameras,
        "cache":      state._health_cache,
        "ws_clients": len(state._ws_clients),
    }
