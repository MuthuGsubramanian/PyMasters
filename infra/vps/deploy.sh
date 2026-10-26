#!/usr/bin/env bash
# Deploy PyMasters to the VPS from the ops laptop (Git Bash) or from CI.
#
#   infra/vps/deploy.sh <host> [git-ref]        e.g. infra/vps/deploy.sh pymasters@203.0.113.10 main
#
# Reads runtime secrets from the laptop vault (python ops/vault/pmvault.py) and
# writes them to /opt/pymasters/.env on the host (0600). Builds the image ON the
# host from the given git ref, runs the compose stack, waits for /health, and
# keeps the previous image tagged :previous for a one-command rollback:
#   ssh <host> 'cd /opt/pymasters && docker tag pymasters:previous pymasters:latest && docker compose -f docker-compose.prod.yml up -d app'
set -euo pipefail

HOST="${1:?usage: deploy.sh user@host [git-ref]}"
REF="${2:-main}"
REPO_URL="https://github.com/MuthuGsubramanian/PyMasters.git"
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="${PYTHON:-python}"
VAULT="$HERE/../../ops/vault/pmvault.py"

# Secrets the container needs (names only; values come from the vault).
RUNTIME_SECRETS=(JWT_SECRET OLLAMA_API_KEY QUBRID_API_KEY QUBRID2_API_KEY EXPORT_TOKEN SOCIAL_WORKER_TOKEN
  SMTP_USER SMTP_PASS FROM_EMAIL SMTP_BACKUP_USER SMTP_BACKUP_PASS
  GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET
  RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET
  LITESTREAM_ACCESS_KEY_ID LITESTREAM_SECRET_ACCESS_KEY REPLICA_BUCKET REPLICA_ENDPOINT REPLICA_REGION
  OLLAMA_MODEL VAATHIYAAR_PROVIDERS QUBRID2_MODEL)

tmp_env="$(mktemp)"
trap 'rm -f "$tmp_env"' EXIT
missing=()
for name in "${RUNTIME_SECRETS[@]}"; do
  if val="$("$PY" "$VAULT" get "$name" 2>/dev/null)"; then
    printf '%s=%s\n' "$name" "$val" >> "$tmp_env"
  else
    missing+=("$name")
  fi
done
if ((${#missing[@]})); then
  echo "WARNING: not in vault (container will run without them): ${missing[*]}" >&2
fi

echo "== syncing config + secrets to $HOST"
ssh "$HOST" 'mkdir -p /opt/pymasters && chmod 750 /opt/pymasters'
scp -q "$tmp_env" "$HOST:/opt/pymasters/.env"
scp -q "$HERE/docker-compose.prod.yml" "$HERE/Caddyfile" "$HERE/litestream.yml" "$HOST:/opt/pymasters/"
ssh "$HOST" 'chmod 600 /opt/pymasters/.env'

echo "== building $REF on the host"
ssh "$HOST" bash -s "$REF" "$REPO_URL" <<'REMOTE'
set -euo pipefail
REF="$1"; REPO_URL="$2"
cd /opt/pymasters
if [ ! -d src/.git ]; then git clone --depth 50 "$REPO_URL" src; fi
git -C src fetch --depth 50 origin "$REF"
git -C src checkout -q FETCH_HEAD
docker image inspect pymasters:latest >/dev/null 2>&1 && docker tag pymasters:latest pymasters:previous || true
DOCKER_BUILDKIT=1 docker build -q -t pymasters:latest src
docker compose -f docker-compose.prod.yml up -d --remove-orphans
for i in $(seq 1 60); do
  if curl -fsS http://localhost:8080/health >/dev/null 2>&1 || docker exec pymasters-app curl -fsS http://localhost:8080/health >/dev/null 2>&1; then
    echo "healthy after ${i}x5s"; docker image prune -f >/dev/null; exit 0
  fi
  sleep 5
done
echo "app did not become healthy; rolling back to :previous" >&2
docker tag pymasters:previous pymasters:latest && docker compose -f docker-compose.prod.yml up -d app
exit 1
REMOTE
echo "== deployed $REF to $HOST"
