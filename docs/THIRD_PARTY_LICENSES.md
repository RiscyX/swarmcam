# Third-party licenses and model provenance

Checked on 2026-10-24. This is a record of the components used or named by
SwarmCam and its current brag video, not a complete dependency or container SBOM.
Upstream components retain their own licenses. The root [LICENSE](../LICENSE)
applies to SwarmCam's source, not to every file downloaded at runtime.

## Application and services

| Component | License / source | Scope |
|---|---|---|
| SwarmCam | [AGPL-3.0-only](../LICENSE), copyright 2026 Vass Richárd | Current application source; earlier MIT notice retained in [MIT-legacy.txt](../licenses/MIT-legacy.txt). |
| Ultralytics | [AGPL-3.0](https://github.com/ultralytics/ultralytics/blob/v8.4.7/LICENSE) | Imported by the fire detector; 8.4.7 is the checkpoint's recorded exporter/trainer version, not a claim about the installed runtime version. The Python requirement is unpinned. |
| Android IP Camera | [MIT](https://github.com/DigitallyRefined/android-ip-camera/blob/main/LICENSE) | Separate phone application, not vendored. |
| Frigate | [MIT](https://github.com/blakeblackshear/frigate/blob/dev/LICENSE) | Separate NVR; its dependencies and model weights have separate terms. |
| go2rtc | [MIT](https://github.com/AlexxIT/go2rtc/blob/master/LICENSE) | Bundled inside the Frigate container in this deployment. |
| Eclipse Mosquitto | [EPL-2.0 OR BSD-3-Clause (EDL-1.0)](https://github.com/eclipse-mosquitto/mosquitto/blob/master/LICENSE.txt) | Separate MQTT broker. |
| FastAPI | [MIT](https://github.com/fastapi/fastapi/blob/master/LICENSE) | Backend framework. |
| React | [MIT](https://github.com/facebook/react/blob/main/LICENSE) | Frontend framework. |
| ONNX Runtime | [MIT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) | Runtime license does not determine the ONNX model's license. |
| PyTorch | [BSD-style](https://github.com/pytorch/pytorch/blob/main/LICENSE) | Includes upstream notices; see the complete license. |
| FFmpeg | [LGPL/GPL depending on build](https://ffmpeg.org/legal.html) | Check the actual binary's build options before redistributing it. |
| NVIDIA/CUDA | [NVIDIA CUDA terms](https://docs.nvidia.com/cuda/eula/index.html) | GPU deployment uses separately licensed drivers/runtime; the complete GPU stack is not claimed to be AGPL or MIT. |

## Fire/smoke weights

- Publisher: **Salah AL-Haismawi**, [YOLOv26 Fire Detection](https://huggingface.co/SalahALHaismawi/yolov26-fire-detection), 2026.
- Upstream artifact: [`best.pt`](https://huggingface.co/SalahALHaismawi/yolov26-fire-detection/blob/main/best.pt), locally `fire-detector/models/fire_smoke.pt`.
- SHA-256 of both artifacts: `52684ddffd4797f1bc5ff1bd2b72af3ec34eabf0c1646c37f518bb766b27b79f`.
- Metadata inspected without executing/unpickling the model: `yolo26s.yaml`, base `yolo26s.pt`, Ultralytics `8.4.7`, training image size `640`, classes `fire`, `other`, `smoke`.
- **License handling:** retain the publisher's MIT declaration and attribution, and comply with the underlying Ultralytics AGPL-3.0 terms for the combined application. MIT and AGPL notices are not inherently incompatible; we do not rely on the publisher's MIT label to remove upstream AGPL obligations. The matching checkpoint embeds `AGPL-3.0 (https://ultralytics.com/license)`. The original publisher statement is preserved in the [pinned model card](../licenses/model-provenance/YOLO26s-model-card.md), revision `5397b43994c39c2ed4ef81a6996c6334e2b7a5fa`. See the [GNU license compatibility guidance](https://www.gnu.org/licenses/license-compatibility.en.html) and [Ultralytics' licensing terms](https://www.ultralytics.com/license).
- The model card describes its training dataset as CC BY 4.0, but links only to Roboflow Universe generally. The exact dataset and its attribution chain were not independently identified. Training data is not bundled here, and the publisher's accuracy figures are not presented as SwarmCam measurements.
- The checkpoint is downloaded separately and is not tracked in Git. Preserve both the publisher's notices and the applicable AGPL terms in any release containing it; provide the corresponding source required by those terms. No MIT-only relicensing of the checkpoint is claimed. The dataset is not redistributed here, and its full ownership chain is not independently certified by this record.

## Frigate ONNX weights

The configured local file `docker/frigate/model_cache/yolo.onnx` is an export
of **WongKinYiu YOLOv9-s converted**, configured for 320×320 and COCO-80.
Its numerical provenance was checked against the publisher's official
[`yolov9-s-converted.pt` v0.1 release asset](https://github.com/WongKinYiu/yolov9/releases/download/v0.1/yolov9-s-converted.pt).
The upstream project uses [GPL-3.0](https://github.com/WongKinYiu/yolov9/blob/main/LICENSE.md);
its original license text is included in [YOLOv9-GPL-3.0.txt](../licenses/YOLOv9-GPL-3.0.txt).
The model keeps that upstream license; SwarmCam does not claim to relicense it.
GPLv3/AGPLv3 combination is permitted under their section 13 provisions; see the
[GNU compatibility FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#GPLv3Compatibility).

All **371 learned tensors / 7,105,888 values** match the official checkpoint
after standard Conv/BatchNorm and RepConvN export fusion, within `rtol=2e-5`,
`atol=2e-6` (maximum observed absolute difference `1.9073486328125e-6`). The eight
remaining ONNX initializers were verified as derived anchors, strides and export
shape/constants. This establishes weight provenance, not the exact original
export command or the identity of the earlier benchmark artifact.

Hashes, immutable source revision and the numerical check are recorded in
[models.json](../licenses/model-provenance/models.json). To reproduce the check
with Python 3 and NumPy after downloading the linked official checkpoint:

```bash
python3 licenses/model-provenance/verify_yolov9.py \
  docker/frigate/model_cache/yolo.onnx /path/to/yolov9-s-converted.pt
```

The verifier checks both artifact hashes and parses checkpoint storage without
importing PyTorch or executing the checkpoint's model classes. The video's
generic ONNX wording remains accurate; its timings are attributed to Frigate,
not to the separate YOLO26s fire model.

## Current video assets

These notices apply to `brag-output-2026-09-21-163818/`. They do not automatically
clear assets in the other, earlier video folders.

| Asset | Source and terms | Use in the current render |
|---|---|---|
| Neon Skyline Cruise | [ElevenLabs Technology samples](https://elevenlabs.io/music/technology), [source MP3](https://eleven-public-cdn.elevenlabs.io/payloadcms/nftjjgisqrk.mp3) | The page's FAQ permits commercial use of its pregenerated samples and describes them as royalty free with no copyright claimed. This is the public sample, not a new generation or Marketplace purchase. |
| Interface sound effects | [Kenney Interface Sounds — CC0](https://kenney.nl/assets/interface-sounds) | Copied from the original brag asset library, whose SFX analysis identifies Kenney as source. |
| Impact sound effects | [Kenney Impact Sounds — CC0](https://kenney.nl/assets/impact-sounds) | Same provenance as above. |
| Mouse click | [Kenney UI Audio — CC0](https://kenney.nl/assets/ui-audio) | `assets/sfx/ui/mouseclick1.ogg`. |
| Archivo | [SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/archivo/OFL.txt) | Local WOFF2. Preserve its copyright/license when distributing composition assets. |
| IBM Plex Mono | [SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/ibmplexmono/OFL.txt) | Local WOFF2; same distribution requirement. |
| GSAP 3.14.2 | [Package license declaration](https://github.com/greensock/GSAP/blob/3.14.2/package.json), [standard license](https://gsap.com/standard-license/) | Composition runtime, under its own standard no-charge license, not MIT/AGPL. The linked license page redirected to the provider's offline page during this audit; no broader rights are inferred. |
| Camera and event images | Existing local SwarmCam captures | No stock imagery added. The video fire image is byte-identical to local event `62fc6b740280470eb8e781f0d16feb2f`, score 0.861. This verifies provenance, not independent ownership/privacy clearance. |

The unused Ende music file remains in the working asset folder for historical
reference; it is not used or cleared by this render's music notice. Do not treat
the whole composition asset directory as uniformly AGPL-licensed.

## Publishing source and builds

- Include the applicable license texts and upstream notices when redistributing software/assets.
- Publish the corresponding source of the version being distributed or offered to network users, including relevant build scripts and configuration templates. Keep credentials and private runtime recordings out of that source bundle.
- The dashboard's source link points to `https://github.com/RiscyX/swarmcam`; update it for a fork or a deployment whose source is elsewhere. A repository URL must actually provide the version being run.
- Local edits and this license change are not published automatically. Existing MIT releases retain their original grant.
- This audit does not certify every transitive Python/JavaScript package, system library or Docker layer. Inspect the exact locked/built artifacts before distributing an appliance or image bundle.
