FROM python:3.11-slim

WORKDIR /app
COPY services/api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY shared /app/shared
COPY policy /app/policy
COPY services/api /app/services/api

ENV PYTHONPATH=/app
EXPOSE 8088
CMD ["uvicorn", "services.api.main:app", "--host", "0.0.0.0", "--port", "8088"]
