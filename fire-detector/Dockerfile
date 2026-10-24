FROM python:3.12-slim

WORKDIR /app

# Install dependencies required for OpenCV and other packages
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# CUDA torch/torchvision: YOLO inference runs on the NVIDIA GPU, not the CPU.
# PyPI's default Linux torch wheel brings the CUDA runtime with it
# (nvidia-* packages); the host only needs the driver. In exchange the image grows
# from ~2 GB to ~6 GB - taking the load off the CPU is worth it.
RUN pip install --no-cache-dir torch torchvision \
    && pip install --no-cache-dir -r requirements.txt

COPY detector.py .
CMD ["python", "detector.py"]
