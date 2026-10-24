#!/bin/sh
# Exports the YOLOv9 object detector Frigate uses to docker/frigate/model_cache/yolo.onnx.
# Recipe from Frigate's docs (Object Detectors → YOLOv9); needs Docker and ~5 GB of temp space.
set -e
cd "$(dirname "$0")"
mkdir -p model_cache
docker build . --build-arg MODEL_SIZE=s --build-arg IMG_SIZE=320 --output model_cache -f- <<'DOCKERFILE'
FROM python:3.11 AS build
RUN apt-get update && apt-get install --no-install-recommends -y cmake libgl1 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.10.4 /uv /bin/
WORKDIR /yolov9
ADD https://github.com/WongKinYiu/yolov9.git .
RUN uv pip install --system -r requirements.txt
RUN uv pip install --system onnx==1.18.0 onnxruntime onnx-simplifier==0.4.* onnxscript
ARG MODEL_SIZE
ARG IMG_SIZE
ADD https://github.com/WongKinYiu/yolov9/releases/download/v0.1/yolov9-${MODEL_SIZE}-converted.pt yolov9-${MODEL_SIZE}.pt
RUN sed -i "s/ckpt = torch.load(attempt_download(w), map_location='cpu')/ckpt = torch.load(attempt_download(w), map_location='cpu', weights_only=False)/g" models/experimental.py
RUN python3 export.py --weights ./yolov9-${MODEL_SIZE}.pt --imgsz ${IMG_SIZE} --simplify --include onnx
FROM scratch
ARG MODEL_SIZE
ARG IMG_SIZE
COPY --from=build /yolov9/yolov9-${MODEL_SIZE}.onnx /yolov9-${MODEL_SIZE}-${IMG_SIZE}.onnx
DOCKERFILE
mv model_cache/yolov9-s-320.onnx model_cache/yolo.onnx
echo "Wrote $(pwd)/model_cache/yolo.onnx"
