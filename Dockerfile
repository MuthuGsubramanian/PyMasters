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
    && rm -rf /var/lib/apt/lists/*

# Backend dependencies
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend code
COPY backend/ .

# Frontend built assets
COPY --from=frontend-build /frontend/dist /usr/share/nginx/html

# Nginx config
RUN rm -f /etc/nginx/sites-enabled/default
COPY nginx.conf /etc/nginx/conf.d/pymasters.conf

# Supervisord config
COPY supervisord.conf /etc/supervisor/conf.d/pymasters.conf

# Data directory for DuckDB
RUN mkdir -p /app/data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/pymasters.conf"]
