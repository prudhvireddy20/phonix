# ── Stage 1: dependency builder ───────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# System deps needed to compile some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
 && pip install --prefix=/install --no-cache-dir -r requirements.txt


# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

# Runtime system packages
#   ffmpeg      — audio re-encoding to 16kHz WAV
#   espeak-ng   — IPA phonemization
#   curl        — Docker healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    espeak-ng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

WORKDIR /app

# Copy source
COPY app/ ./app/

# Pre-download the faster-whisper model into the image layer so the
# first real request is not slow. WHISPER_MODEL_SIZE defaults to "base".
# Override with --build-arg WHISPER_MODEL_SIZE=small for better accuracy.
ARG WHISPER_MODEL_SIZE=base
ENV WHISPER_MODEL_SIZE=${WHISPER_MODEL_SIZE}

RUN python - <<'EOF'
from faster_whisper import WhisperModel
import os
model_size = os.environ.get("WHISPER_MODEL_SIZE", "base")
print(f"Pre-downloading faster-whisper '{model_size}' model…")
WhisperModel(model_size, device="cpu", compute_type="int8")
print("Done.")
EOF

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
