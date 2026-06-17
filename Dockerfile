# ============================================
# PyMasters — Unified Dockerfile for Cloud Run
# Serves React frontend via Nginx + FastAPI backend via Uvicorn
# ============================================

# --- Stage 1: Build React Frontend ---
FROM node:18-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ENV VITE_API_URL=/api
RUN npm run build

# --- Stage 2: Production Image ---
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    curl \
    ca-certificates \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# --- Litestream (continuous SQLite -> GCS replication) ---
ARG LITESTREAM_VERSION=v0.3.13
RUN curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-amd64.tar.gz" \
      | tar -xz -C /usr/local/bin litestream \
    && litestream version
COPY litestream.yml /etc/litestream.yml

# Backend dependencies
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the Whisper STT model into the image so /api/voice/transcribe
# never fetches from HuggingFace at runtime (avoids HF IP rate-limits + slow
# cold starts). Must match VOICE_WHISPER_MODEL (default "tiny").
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('tiny', device='cpu', compute_type='int8')"

# Backend code
COPY backend/ .

# Frontend built assets
COPY --from=frontend-build /frontend/dist /usr/share/nginx/html

# Nginx config
RUN rm -f /etc/nginx/sites-enabled/default
COPY nginx.conf /etc/nginx/conf.d/pymasters.conf

# Supervisord config
COPY supervisord.conf /etc/supervisor/conf.d/pymasters.conf

# Startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Data directory for DuckDB
RUN mkdir -p /app/data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["/app/start.sh"]
