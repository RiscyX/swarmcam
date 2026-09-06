FROM python:3.12-slim

WORKDIR /app

# Install dependencies required for OpenCV and other packages
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# CUDA-s torch/torchvision: a YOLOv8 inference az NVIDIA GPU-n fut, nem a CPU-n.
# A PyPI alapértelmezett linuxos torch wheel hozza magával a CUDA runtime-ot
# (nvidia-* csomagok), a hoszton csak a driver kell. Cserébe az image ~2 GB-ról
# ~6 GB-ra hízik - ezt a CPU-tehermentesítés megéri.
RUN pip install --no-cache-dir torch torchvision \
    && pip install --no-cache-dir -r requirements.txt

COPY detector.py .
CMD ["python", "detector.py"]
