#!/usr/bin/env bash
# Pull the newest production image from Artifact Registry and restart the app
# only if the digest changed (or --force). Runs every 2 minutes from the
# pymasters-update.timer, so a push to main → CI image → live on the VM within
# ~15 minutes, with no SSH from CI. Keeps the previous digest for rollback:
#   /opt/pymasters/update.sh --rollback
set -euo pipefail
IMG="us-central1-docker.pkg.dev/pymasters-app/cloud-run-source-deploy/pymasters:latest"
DIR=/opt/pymasters
cd "$DIR"

login() {
  curl -fsS -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' \
    | docker login -u oauth2accesstoken --password-stdin https://us-central1-docker.pkg.dev >/dev/null 2>&1
}
digest() { docker image inspect --format '{{index .RepoDigests 0}}' "$1" 2>/dev/null || true; }
healthy() {
  for _ in $(seq 1 36); do
    curl -fsS http://127.0.0.1:8080/health >/dev/null 2>&1 && return 0
    sleep 5
  done
  return 1
}

if [ "${1:-}" = "--rollback" ]; then
  [ -f "$DIR/.previous_digest" ] || { echo "no previous digest recorded"; exit 1; }
  docker tag "$(cat "$DIR/.previous_digest")" "$IMG"
  docker compose up -d app
  healthy && echo "rolled back" || { echo "rollback unhealthy"; exit 1; }
  exit 0
fi

login
before="$(digest "$IMG")"
docker pull -q "$IMG" >/dev/null
after="$(digest "$IMG")"
if [ "$before" = "$after" ] && [ "${1:-}" != "--force" ]; then
  exit 0
fi
[ -n "$before" ] && echo "$before" > "$DIR/.previous_digest"
echo "$(date -u +%FT%TZ) deploying $after (was ${before:-none})"
docker compose up -d --remove-orphans
if healthy; then
  echo "$(date -u +%FT%TZ) healthy"
  docker image prune -f >/dev/null
else
  echo "$(date -u +%FT%TZ) UNHEALTHY — rolling back" >&2
  if [ -n "$before" ]; then
    docker tag "$before" "$IMG" && docker compose up -d app
  fi
  exit 1
fi
