# SwarmCam measurement scripts

`measure.py` collects the measured data for the thesis's testing and results
chapter. Run it on the machine that runs the SwarmCam stack (e.g. the NUC), while
at least one real camera (Android phone) is connected to the network.

## Installation

```bash
pip install requests websockets paho-mqtt
```

## Usage

### 1. CPU/RAM as a function of camera count

Run it **separately for every camera count under test** (e.g. with 1, 2, 3 active
phones switched on), after changing the camera count in between:

```bash
python3 measure.py resources --duration 60
```

The camera count is read automatically from the backend's `/api/cameras` endpoint
(can be overridden: `--cameras 3`). The result is appended to
`results/resources.csv`, one row per container (frigate, swarmcam-backend,
swarmcam-fire-detector, mosquitto, swarmcam-dashboard).

### 2. Health-polling jitter + MQTT→WebSocket latency

```bash
python3 measure.py latency --duration 120
```

**Generate events** during the measurement (move in front of the camera, or hold
a flame/match in front of the lens briefly for fire detection), otherwise there is
nothing to measure for event latency. It measures two things:
- the actual spread (jitter) of the `health_loop`'s 5-second cycle,
- the time from a Frigate/fire-detector MQTT event to its delivery over the
  WebSocket (the real latency of the backend's event-relay pipeline).

Result: `results/latency.csv`.

### 3. GPU vs CPU-only detection speed

```bash
python3 measure.py detection --label gpu --duration 60
```

Then switch the detector section of `docker/frigate/config.yml` to CPU-only mode,
restart the frigate container (`docker compose restart frigate`), wait for it to
stabilise (about 30-60 s), then:

```bash
python3 measure.py detection --label cpu --duration 60
```

Result: `results/detection.csv` — the two `label` rows can be compared directly
(detector inference time in ms, overall detection_fps).
**After the measurement, don't forget to restore GPU acceleration in config.yml
and restart the frigate container.**

---

## Automated run (`run_all.py`)

The whole measurement series can also be run without manual intervention:

```bash
../backend/venv/bin/python3 run_all.py              # all three phases
../backend/venv/bin/python3 run_all.py detection    # a single phase
```

The script rewrites `docker/frigate/config.yml` per phase, restarts the frigate
container, waits for it to stabilise, then calls the matching `measure.py`
subcommand. **At the end (in a `finally` block) it restores the original
config** — which is saved to `benchmark/config.yml.original` (git-ignored) on the
first run.

### Measurement input

Camera-count scaling and the GPU/CPU comparison need the same input at every
measurement point, otherwise the difference does not come from the variable under
test. So the input is a real H.264 recording captured earlier from the phones
(`/media/frigate/bench_source.mp4`, 1280×720, 10 fps, ~24 minutes), which Frigate
reads with `-re -stream_loop -1` input_args, as N separate cameras.

Producing the file (from the frigate container, from your own recordings):

```bash
docker exec frigate sh -c 'D=/media/frigate/recordings/<day>/<hour>/<camera>; \
  ls $D/*.mp4 | sort | head -24 | sed "s|^|file |" > /tmp/c1.txt; \
  /usr/lib/ffmpeg/7.0/bin/ffmpeg -y -f concat -safe 0 -i /tmp/c1.txt -c copy -an /tmp/seg.mp4; \
  /usr/lib/ffmpeg/7.0/bin/ffmpeg -y -i /tmp/seg.mp4 -an -vf "fps=10,scale=1280:720" \
    -c:v libx264 -preset veryfast -crf 24 -g 50 -sc_threshold 0 /tmp/clean.mp4'
```

`-c copy` concatenation alone is **not enough**: it leaves broken timestamps at
the segment boundaries, which put Frigate's ffmpeg processes into a restart loop
and distort the measured CPU by orders of magnitude. That is why re-encoding is
needed.

### Why not through go2rtc?

Frigate rejects the `{input}` and `{output}` substitutions in the go2rtc
configuration ("Invalid substitution found"), so a looped file source cannot be
given as `ffmpeg:…#input=` or as `exec:…{output}`. A `#video=copy` file source, on
the other hand, does not hold the nominal frame rate with several parallel
cameras. So the measurement bypasses go2rtc and uses direct file input — go2rtc's
repackaging is a small, constant contribution.

### Saturating the detector

The `detection` phase writes `motion.threshold: 10` / `contour_area: 5` into the
config so the detector runs on practically every frame. With the default settings
the motion mask filters so well that the detector fires too rarely for a reliable
measurement.

### Event injection

`inject_events.py` publishes synthetic events in Frigate's format to the
`frigate/events` topic, so the `latency` phase can measure the MQTT → backend →
WebSocket relay latency even when there is no real motion in front of the
cameras. The backend does not store these in the database, it only relays them.
