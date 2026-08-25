FROM python:3.12-slim

WORKDIR /app

# Install dependencies required for OpenCV and other packages
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# CPU-only torch/torchvision, hogy ultralytics ne a CUDA-s (GPU) buildet
# húzza le - ezen a szerveren nincs GPU, a CUDA csomagok csak feleslegesen
# növelnék az image méretét és a build idejét.
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY detector.py .
CMD ["python", "detector.py"]
