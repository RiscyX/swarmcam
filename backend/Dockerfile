FROM docker:27-cli AS docker-cli

FROM python:3.12-slim

WORKDIR /swarmcam/backend

RUN apt-get update && apt-get install -y --no-install-recommends gcc python3-dev && rm -rf /var/lib/apt/lists/*

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY discovery/ /swarmcam/discovery/

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
