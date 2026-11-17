FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models \
    WHISPER_MODEL=small \
    WHISPER_DEVICE=cpu \
    WHISPER_COMPUTE_TYPE=int8 \
    WHISPER_CPU_THREADS=4

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 speech \
    && mkdir /models && chown speech:speech /models
COPY worker.py ./
USER speech
EXPOSE 8000
# Exactly one process: each process would otherwise load another model and slot.
CMD ["uvicorn", "worker:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
