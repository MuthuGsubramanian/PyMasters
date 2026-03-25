# ============================================
# PyMasters — Unified Dockerfile for Cloud Run
# Serves React frontend via Nginx + FastAPI backend via Uvicorn
# Managed by supervisord in a single container
# ============================================

# --- Stage 1: Build React Frontend ---
FROM node:18-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Stage 2: Production Image ---
FROM python:3.11-slim

# Install nginx and supervisor
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

# --- Backend setup ---
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

# --- Frontend setup ---
COPY --from=frontend-build /frontend/dist /usr/share/nginx/html

# --- Nginx config: serve SPA + proxy /api to backend ---
RUN rm /etc/nginx/sites-enabled/default
COPY <<'NGINX_CONF' /etc/nginx/conf.d/pymasters.conf
server {
    listen 8080;
    server_name _;

    # Serve React SPA
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to FastAPI backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:8000/;
    }
}
NGINX_CONF

# --- Supervisord config: run both nginx and uvicorn ---
COPY <<'SUPERVISOR_CONF' /etc/supervisor/conf.d/pymasters.conf
[supervisord]
nodaemon=true
logfile=/var/log/supervisord.log
pidfile=/var/run/supervisord.pid

[program:nginx]
command=nginx -g "daemon off;"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:backend]
command=uvicorn main:app --host 0.0.0.0 --port 8000
directory=/app/backend
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=DB_PATH="/app/data/pymasters.duckdb",OLLAMA_API_KEY="%(ENV_OLLAMA_API_KEY)s",OLLAMA_API_URL="%(ENV_OLLAMA_API_URL)s",OLLAMA_MODEL="%(ENV_OLLAMA_MODEL)s"
SUPERVISOR_CONF

# Create data directory for DuckDB
RUN mkdir -p /app/data

# Cloud Run uses port 8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]
