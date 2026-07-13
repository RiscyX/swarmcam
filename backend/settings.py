import os
from pathlib import Path

DISCOVERY_SCRIPT    = Path(__file__).parent.parent / "discovery" / "discovery.py"
FRIGATE_CONFIG   = Path(__file__).parent.parent / "docker" / "frigate" / "config.yml"
COMPOSE_FILE     = Path(__file__).parent.parent / "docker" / "docker-compose.yml"
MEDIA_DIR        = Path(__file__).parent.parent / "docker" / "media"

FRIGATE_URL    = os.getenv("FRIGATE_URL", "http://localhost:5000")
MQTT_HOST      = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT      = int(os.getenv("MQTT_PORT", "1883"))
COMPOSE_CMD      = ["docker", "compose", "-f", str(COMPOSE_FILE)]
HEALTH_INTERVAL  = 5  # seconds

# Default admin credentials (used only when Frigate has no users yet)
DEFAULT_USER     = os.getenv("DEFAULT_USER", "admin")
DEFAULT_PASSWORD = os.getenv("DEFAULT_PASSWORD", "admin")
