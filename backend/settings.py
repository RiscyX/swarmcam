import os
from pathlib import Path

DISCOVERY_SCRIPT    = Path(__file__).parent.parent / "discovery" / "discovery.py"
FRIGATE_CONFIG   = Path(__file__).parent.parent / "docker" / "frigate" / "config.yml"
COMPOSE_FILE     = Path(__file__).parent.parent / "docker" / "docker-compose.yml"
MEDIA_DIR        = Path(__file__).parent.parent / "docker" / "media"

FRIGATE_URL    = os.getenv("FRIGATE_URL", "http://localhost:5000")
# A Frigate-be ágyazott go2rtc. A saját portján nincs auth, a Frigate
# nginxén keresztül lenne — a backend hálózatilag amúgy is mellette fut.
GO2RTC_WS_URL  = os.getenv("GO2RTC_WS_URL", "ws://localhost:1984/api/ws")
GO2RTC_API_URL  = os.getenv("GO2RTC_API_URL", "http://localhost:1984")
MQTT_HOST      = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT      = int(os.getenv("MQTT_PORT", "1883"))
COMPOSE_CMD      = ["docker", "compose", "-f", str(COMPOSE_FILE)]
HEALTH_INTERVAL  = 5  # seconds

# Default admin credentials (used only when Frigate has no users yet)
DEFAULT_USER     = os.getenv("DEFAULT_USER", "admin")
DEFAULT_PASSWORD = os.getenv("DEFAULT_PASSWORD", "admin")
