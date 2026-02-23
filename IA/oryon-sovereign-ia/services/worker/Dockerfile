FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY services/worker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY shared /app/shared
COPY policy /app/policy
COPY services/worker /app/services/worker

ENV PYTHONPATH=/app
CMD ["python", "-m", "services.worker.worker"]
