#!/usr/bin/env python3
"""
SwarmCam mérőszkript a szakdolgozat 3.5. fejezetéhez (Tesztelés és eredmények).

Három alparancs:
  resources  – CPU/RAM terhelés a docker konténerekre, az aktuális kameraszámmal
               címkézve. Futtasd egyszer minden vizsgált kameraszámnál
               (pl. 1, 2, 3 aktív telefonnal).
  latency    – a health_loop ciklus szórása (jitter) + a Frigate/tűzdetektor
               MQTT esemény -> WebSocket kézbesítés közti késleltetés.
  detection  – a Frigate detektor átlagos inferencia-idejét és a kamerák
               detection_fps-ét méri; --label gpu / --label cpu, hogy a két
               futás (GPU-gyorsítással, majd a config.yml-ben CPU-only
               detektorra állítva + frigate újraindítva) összehasonlítható
               legyen.

Használat:
  pip install requests websockets paho-mqtt   # ha még nincs telepítve

  python3 measure.py resources --duration 60
  python3 measure.py latency --duration 120
  python3 measure.py detection --label gpu --duration 60
  # ... majd a config.yml detector szekcióját cpu-ra állítva, frigate restart után:
  python3 measure.py detection --label cpu --duration 60

Minden alparancs eredményt fűz a benchmark/results/*.csv fájlokhoz, hogy
több futtatás (pl. különböző kameraszámmal) egymás alá gyűljön.
"""
import argparse
import csv
import json
import os
import statistics
import subprocess
import sys
import threading
import time
from datetime import datetime

RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
CONTAINERS = [
    "frigate",
    "swarmcam-backend",
    "swarmcam-fire-detector",
    "mosquitto",
    "swarmcam-dashboard",
]


def _ensure_results_dir():
    os.makedirs(RESULTS_DIR, exist_ok=True)


def _append_csv(path: str, rows: list[dict]) -> None:
    if not rows:
        return
    _ensure_results_dir()
    file_exists = os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)


def _parse_mem_to_mb(mem_str: str) -> float:
    """'123.4MiB' / '1.2GiB' / '512KiB' -> megabytes (MiB alapon)."""
    mem_str = mem_str.strip()
    units = (("GiB", 1024.0), ("MiB", 1.0), ("KiB", 1 / 1024.0), ("B", 1 / (1024.0 * 1024.0)))
    for suffix, multiplier in units:
        if mem_str.endswith(suffix):
            value = float(mem_str[: -len(suffix)])
            return value * multiplier
    try:
        return float(mem_str)
    except ValueError:
        return 0.0


def _get_camera_count(backend_url: str) -> int | None:
    try:
        import requests

        resp = requests.get(f"{backend_url}/api/cameras", timeout=5)
        resp.raise_for_status()
        return len(resp.json())
    except Exception as e:
        print(f"WARN: nem sikerült lekérni a kameraszámot a backendtől ({e})", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# resources
# ---------------------------------------------------------------------------

def cmd_resources(args):
    cam_count = args.cameras if args.cameras is not None else _get_camera_count(args.backend_url)
    if cam_count is None:
        print("Adj meg kameraszámot a --cameras kapcsolóval, ha a backend nem elérhető.", file=sys.stderr)
        sys.exit(1)

    n_samples = max(1, int(args.duration / args.interval))
    print(f"[resources] {n_samples} minta, {args.interval}s-enként (~{args.duration}s), kameraszám={cam_count}")

    samples = {c: {"cpu": [], "mem_mb": []} for c in CONTAINERS}
    for i in range(n_samples):
        try:
            out = subprocess.run(
                ["docker", "stats", "--no-stream", "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"],
                capture_output=True, text=True, timeout=10, check=True,
            ).stdout
        except Exception as e:
            print(f"WARN: docker stats hiba: {e}", file=sys.stderr)
            time.sleep(args.interval)
            continue

        for line in out.strip().splitlines():
            parts = line.split("\t")
            if len(parts) != 3:
                continue
            name, cpu_s, mem_s = parts
            if name not in samples:
                continue
            try:
                cpu = float(cpu_s.strip().rstrip("%"))
                mem_used = mem_s.split("/")[0].strip()
                mem_mb = _parse_mem_to_mb(mem_used)
            except ValueError:
                continue
            samples[name]["cpu"].append(cpu)
            samples[name]["mem_mb"].append(mem_mb)

        print(f"  minta {i + 1}/{n_samples}", end="\r", file=sys.stderr)
        time.sleep(args.interval)
    print(file=sys.stderr)

    ts = datetime.now().isoformat(timespec="seconds")
    rows = []
    for name, d in samples.items():
        if not d["cpu"]:
            print(f"WARN: nincs adat a(z) '{name}' konténerhez (fut-e docker compose-ból?)", file=sys.stderr)
            continue
        rows.append({
            "timestamp": ts,
            "cameras": cam_count,
            "container": name,
            "cpu_mean_pct": round(statistics.mean(d["cpu"]), 2),
            "cpu_max_pct": round(max(d["cpu"]), 2),
            "mem_mean_mb": round(statistics.mean(d["mem_mb"]), 1),
            "mem_max_mb": round(max(d["mem_mb"]), 1),
            "n_samples": len(d["cpu"]),
        })

    out_path = os.path.join(RESULTS_DIR, "resources.csv")
    _append_csv(out_path, rows)
    print(f"\n{'konténer':24s} {'CPU átlag':>10s} {'CPU max':>10s} {'RAM átlag':>12s} {'RAM max':>12s}")
    for r in rows:
        print(f"{r['container']:24s} {r['cpu_mean_pct']:>9.1f}% {r['cpu_max_pct']:>9.1f}% "
              f"{r['mem_mean_mb']:>10.1f}M {r['mem_max_mb']:>10.1f}M")
    print(f"\n[resources] eredmény hozzáfűzve: {out_path}")


# ---------------------------------------------------------------------------
# latency
# ---------------------------------------------------------------------------

def cmd_latency(args):
    import asyncio

    import paho.mqtt.client as mqtt
    import websockets

    mqtt_events: list[dict] = []
    ws_events: list[dict] = []
    ws_status_ts: list[float] = []
    lock = threading.Lock()

    def on_mqtt_message(client, userdata, msg):
        now = time.time()
        try:
            payload = json.loads(msg.payload)
        except Exception:
            return
        topic = msg.topic
        with lock:
            if topic == "frigate/events":
                after = payload.get("after", {})
                mqtt_events.append({
                    "ts": now, "kind": "frigate",
                    "id": after.get("id"),
                    "camera": after.get("camera"),
                    "label": after.get("label"),
                })
            elif topic.startswith("swarmcam/fire/"):
                mqtt_events.append({
                    "ts": now, "kind": "fire",
                    "id": None,
                    "camera": payload.get("camera"),
                    "label": payload.get("label"),
                })

    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, f"benchmark-{int(time.time())}")
    mqtt_client.on_message = on_mqtt_message
    mqtt_client.connect(args.mqtt_host, args.mqtt_port)
    mqtt_client.subscribe("frigate/events")
    mqtt_client.subscribe("swarmcam/fire/#")
    mqtt_client.loop_start()

    async def ws_listener():
        uri = args.ws_url
        try:
            async with websockets.connect(uri) as ws:
                print(f"[latency] csatlakozva: {uri}")
                end_time = time.time() + args.duration
                while time.time() < end_time:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=max(1.0, end_time - time.time()))
                    except asyncio.TimeoutError:
                        break
                    now = time.time()
                    try:
                        data = json.loads(raw)
                    except Exception:
                        continue
                    with lock:
                        if data.get("type") == "status":
                            ws_status_ts.append(now)
                        elif data.get("type") == "frigate_event":
                            ws_events.append({
                                "ts": now,
                                "id": data.get("id"),
                                "camera": data.get("camera"),
                                "label": data.get("label"),
                            })
        except Exception as e:
            print(f"HIBA: WebSocket kapcsolat sikertelen ({e}). Fut-e a backend a {uri} címen?", file=sys.stderr)

    print(f"[latency] mérés indul, {args.duration}s ... generálj eseményeket a mérés alatt "
          f"(mozogj a kamera előtt / tarts tüzet a lencse elé), hogy legyen mit mérni.")
    asyncio.run(ws_listener())

    mqtt_client.loop_stop()
    mqtt_client.disconnect()

    # health_loop jitter
    ts_sorted = sorted(ws_status_ts)
    intervals = [b - a for a, b in zip(ts_sorted, ts_sorted[1:])]

    # MQTT -> WebSocket relay latency, event matching
    used_ws = [False] * len(ws_events)
    latencies_ms = []
    for mev in mqtt_events:
        best_idx, best_dt = None, None
        for i, wev in enumerate(ws_events):
            if used_ws[i]:
                continue
            if wev["ts"] < mev["ts"]:
                continue
            if mev["id"] is not None and wev["id"] is not None and wev["id"] != mev["id"]:
                continue
            if mev["camera"] != wev["camera"]:
                continue
            dt = wev["ts"] - mev["ts"]
            if dt > 3.0:
                continue
            if best_dt is None or dt < best_dt:
                best_idx, best_dt = i, dt
        if best_idx is not None:
            used_ws[best_idx] = True
            latencies_ms.append(best_dt * 1000)

    ts = datetime.now().isoformat(timespec="seconds")
    row = {
        "timestamp": ts,
        "duration_s": args.duration,
        "health_interval_samples": len(intervals),
        "health_interval_mean_s": round(statistics.mean(intervals), 3) if intervals else None,
        "health_interval_stdev_s": round(statistics.stdev(intervals), 3) if len(intervals) > 1 else None,
        "mqtt_events_seen": len(mqtt_events),
        "matched_events": len(latencies_ms),
        "relay_latency_mean_ms": round(statistics.mean(latencies_ms), 1) if latencies_ms else None,
        "relay_latency_p95_ms": round(sorted(latencies_ms)[int(0.95 * (len(latencies_ms) - 1))], 1) if latencies_ms else None,
    }
    out_path = os.path.join(RESULTS_DIR, "latency.csv")
    _append_csv(out_path, [row])

    print("\n--- health_loop ciklus (WebSocket 'status' üzenetek közti idő) ---")
    if intervals:
        print(f"  minta: {len(intervals)}, átlag: {row['health_interval_mean_s']}s, szórás: {row['health_interval_stdev_s']}s")
    else:
        print("  nincs elég 'status' üzenet (legalább 2 kell) - fut-e legalább egy kamera?")

    print("\n--- MQTT esemény -> WebSocket kézbesítés késleltetése ---")
    print(f"  MQTT eseményből érkezett: {len(mqtt_events)}, ebből párosítva: {len(latencies_ms)}")
    if latencies_ms:
        print(f"  átlag: {row['relay_latency_mean_ms']} ms, p95: {row['relay_latency_p95_ms']} ms")
    else:
        print("  nem történt detektálási esemény a mérés alatt - generálj eseményt (mozgás/tűz) és ismételd meg.")

    print(f"\n[latency] eredmény hozzáfűzve: {out_path}")


# ---------------------------------------------------------------------------
# detection
# ---------------------------------------------------------------------------

def cmd_detection(args):
    import requests

    session = requests.Session()
    try:
        r = session.post(f"{args.frigate_url}/api/login",
                          json={"user": args.user, "password": args.password}, timeout=5)
        r.raise_for_status()
    except Exception as e:
        print(f"HIBA: Frigate bejelentkezés sikertelen ({e}).", file=sys.stderr)
        sys.exit(1)

    n_samples = max(1, int(args.duration / args.interval))
    print(f"[detection] label='{args.label}', {n_samples} minta, {args.interval}s-enként")

    detector_speeds: dict[str, list[float]] = {}
    total_detection_fps: list[float] = []

    for i in range(n_samples):
        try:
            r = session.get(f"{args.frigate_url}/api/stats", timeout=5)
            r.raise_for_status()
            stats = r.json()
        except Exception as e:
            print(f"WARN: /api/stats hiba: {e}", file=sys.stderr)
            time.sleep(args.interval)
            continue

        for det_name, det in stats.get("detectors", {}).items():
            speed = det.get("inference_speed")
            if speed is not None:
                detector_speeds.setdefault(det_name, []).append(float(speed))

        cams = stats.get("cameras", {})
        fps_sum = sum(c.get("detection_fps", 0) or 0 for c in cams.values())
        total_detection_fps.append(fps_sum)

        print(f"  minta {i + 1}/{n_samples}", end="\r", file=sys.stderr)
        time.sleep(args.interval)
    print(file=sys.stderr)

    ts = datetime.now().isoformat(timespec="seconds")
    rows = []
    for det_name, speeds in detector_speeds.items():
        rows.append({
            "timestamp": ts,
            "label": args.label,
            "detector": det_name,
            "inference_speed_mean_ms": round(statistics.mean(speeds), 2),
            "inference_speed_max_ms": round(max(speeds), 2),
            "detection_fps_total_mean": round(statistics.mean(total_detection_fps), 2) if total_detection_fps else None,
            "n_samples": len(speeds),
        })

    if not rows:
        print("HIBA: nem érkezett detector statisztika - ellenőrizd, hogy legalább egy kamera aktívan detektál-e.",
              file=sys.stderr)
        sys.exit(1)

    out_path = os.path.join(RESULTS_DIR, "detection.csv")
    _append_csv(out_path, rows)
    for row in rows:
        print(f"  detector={row['detector']:12s} inferencia átlag={row['inference_speed_mean_ms']:6.2f}ms "
              f"max={row['inference_speed_max_ms']:6.2f}ms  összes detection_fps={row['detection_fps_total_mean']}")
    print(f"\n[detection] eredmény hozzáfűzve: {out_path}")
    print("Futtasd le mindkét label-lel (pl. 'gpu' és 'cpu', a config.yml detector szekciójának "
          "átállítása + frigate újraindítás után), hogy a detection.csv-ben összehasonlítható legyen.")


# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_res = sub.add_parser("resources", help="CPU/RAM a kameraszám függvényében")
    p_res.add_argument("--duration", type=float, default=60, help="mérés hossza másodpercben (alap: 60)")
    p_res.add_argument("--interval", type=float, default=2, help="mintavételi köz másodpercben (alap: 2)")
    p_res.add_argument("--cameras", type=int, default=None, help="kameraszám kézi megadása (alap: backendtől lekérve)")
    p_res.add_argument("--backend-url", dest="backend_url", default="http://localhost:8000")
    p_res.set_defaults(func=cmd_resources)

    p_lat = sub.add_parser("latency", help="health_loop jitter + MQTT->WebSocket késleltetés")
    p_lat.add_argument("--duration", type=float, default=120, help="mérés hossza másodpercben (alap: 120)")
    p_lat.add_argument("--ws-url", dest="ws_url", default="ws://localhost:8000/ws/cameras")
    p_lat.add_argument("--mqtt-host", dest="mqtt_host", default="localhost")
    p_lat.add_argument("--mqtt-port", dest="mqtt_port", type=int, default=1883)
    p_lat.set_defaults(func=cmd_latency)

    p_det = sub.add_parser("detection", help="Frigate detektor inferencia-idő (GPU vs CPU-only)")
    p_det.add_argument("--label", required=True, help="pl. 'gpu' vagy 'cpu' - a config.yml aktuális detektor módja")
    p_det.add_argument("--duration", type=float, default=60, help="mérés hossza másodpercben (alap: 60)")
    p_det.add_argument("--interval", type=float, default=2, help="mintavételi köz másodpercben (alap: 2)")
    p_det.add_argument("--frigate-url", dest="frigate_url", default="http://localhost:5000")
    p_det.add_argument("--user", default="admin")
    p_det.add_argument("--password", default="admin")
    p_det.set_defaults(func=cmd_detection)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
