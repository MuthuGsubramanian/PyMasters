#!/usr/bin/env bash
#
# deploy.sh — one-command deploy service for the PyMasters Cloud Run app.
#
# Builds the container with Cloud Build, deploys to Cloud Run, wires the
# Ollama API key from Secret Manager, then verifies the revision is serving.
# Safe to run repeatedly (idempotent). Mirrors the GitHub Actions deploy so you
# can ship a hotfix from a laptop without waiting on CI.
#
# Usage:
#   ./scripts/deploy.sh                 # build + deploy + verify
#   ./scripts/deploy.sh --skip-build    # redeploy last image
#   ./scripts/deploy.sh --no-traffic    # deploy revision but hold traffic (canary)
#
# Requires: gcloud (authenticated), roles to run Cloud Build + deploy Cloud Run.
set -euo pipefail

# ── Config (override via env) ─────────────────────────────────────────────
PROJECT_ID="${PROJECT_ID:-pymasters-app}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pymasters}"
REPO="${REPO:-pymasters}"                       # Artifact Registry repo
IMAGE_NAME="${IMAGE_NAME:-pymasters}"
SECRET_NAME="${SECRET_NAME:-ollama-api-key}"    # Secret Manager secret
DOMAIN="${DOMAIN:-https://pymasters.net}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SKIP_BUILD=0; NO_TRAFFIC=0
for a in "$@"; do
  case "$a" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-traffic) NO_TRAFFIC=1 ;;
    *) echo "Unknown arg: $a"; exit 2 ;;
  esac
done

GIT_SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo manual)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${GIT_SHA}"

log() { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[deploy:FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

command -v gcloud >/dev/null || fail "gcloud not found. Install the Google Cloud SDK."
gcloud config set project "$PROJECT_ID" >/dev/null

# ── Preflight: secret must exist so the app can reach Ollama ──────────────
if ! gcloud secrets describe "$SECRET_NAME" >/dev/null 2>&1; then
  fail "Secret '$SECRET_NAME' not found in Secret Manager. Create it first:
       echo -n \"\$OLLAMA_API_KEY\" | gcloud secrets create $SECRET_NAME --data-file=-"
fi

# ── 1) Build ───────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  log "Building image $IMAGE (Cloud Build)…"
  gcloud builds submit "$ROOT" --tag "$IMAGE" --quiet || fail "Cloud Build failed."
else
  log "Skipping build (using last deployed image)."
fi

# ── 2) Deploy ────────────────────────────────────────────────────────────
TRAFFIC_FLAG=()
[[ "$NO_TRAFFIC" -eq 1 ]] && TRAFFIC_FLAG=(--no-traffic)

log "Deploying revision to Cloud Run service '$SERVICE' ($REGION)…"
DEPLOY_ARGS=(
  run deploy "$SERVICE"
  --region "$REGION"
  --platform managed
  --allow-unauthenticated
  --port 8001
  --memory 1Gi
  --cpu 1
  --min-instances 0
  --max-instances 4
  --set-secrets "OLLAMA_API_KEY=${SECRET_NAME}:latest"
  --quiet
)
[[ "$SKIP_BUILD" -eq 0 ]] && DEPLOY_ARGS+=(--image "$IMAGE")
gcloud "${DEPLOY_ARGS[@]}" "${TRAFFIC_FLAG[@]}" || fail "Cloud Run deploy failed."

# ── 3) Verify ────────────────────────────────────────────────────────────
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
log "Service URL: $URL"

log "Health check…"
for i in $(seq 1 10); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$URL/" || true)"
  if [[ "$code" == "200" ]]; then log "Healthy (HTTP 200) on attempt $i."; break; fi
  [[ "$i" == "10" ]] && fail "Service did not return 200 after 10 attempts (last: $code)."
  sleep 3
done

if [[ "$NO_TRAFFIC" -eq 1 ]]; then
  log "Revision deployed WITHOUT traffic (canary). Promote with:"
  echo "    gcloud run services update-traffic $SERVICE --region $REGION --to-latest"
else
  log "Live. Verifying public domain $DOMAIN …"
  dcode="$(curl -s -o /dev/null -w '%{http_code}' "$DOMAIN/" || true)"
  log "Domain $DOMAIN responded HTTP $dcode."
fi
log "Deploy complete ✓  (image: $IMAGE)"
