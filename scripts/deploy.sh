#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PyMasters safe deploy — one command for the whole image-only release recipe.
#
#   ./scripts/deploy.sh           # build current HEAD and deploy
#   ./scripts/deploy.sh --no-build # redeploy the last-built tag (skip build)
#
# What it does (and why it's safe):
#   1. Verifies gcloud auth (the only step a human must do: `gcloud auth login`
#      when the token has expired — this script tells you when).
#   2. Records the current live revision as a ROLLBACK TARGET.
#   3. Builds the image from the Dockerfile via Cloud Build (NOT the stale
#      committed cloudbuild.yaml, which would wipe Secret Manager mappings).
#   4. Deploys IMAGE-ONLY (`gcloud run deploy --image`) so all env vars,
#      secrets and scaling (min=max=1) are preserved.
#   5. Smoke-tests the live URL; on failure, AUTO-ROLLS-BACK to the recorded
#      revision so a bad deploy never stays live.
# ---------------------------------------------------------------------------
set -euo pipefail

PROJECT="pymasters-app"
REGION="us-central1"
SERVICE="pymasters"
REPO="us-central1-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/${SERVICE}"
APEX="https://pymasters.net"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# 1. Auth -------------------------------------------------------------------
say "Checking gcloud auth"
if ! timeout 25 gcloud auth print-access-token >/dev/null 2>&1; then
  die "gcloud token expired. Run:  gcloud auth login   (then re-run this script)."
fi
gcloud config set project "$PROJECT" >/dev/null 2>&1 || true
echo "auth OK as $(gcloud config get-value account 2>/dev/null)"

SHA="$(git rev-parse --short HEAD)"
TAG="${REPO}:autoweek-${SHA}"

# 2. Rollback target --------------------------------------------------------
say "Recording rollback target"
PREV="$(gcloud run services describe "$SERVICE" --region="$REGION" \
        --format='value(status.latestReadyRevisionName)')"
[ -n "$PREV" ] || die "Could not read current revision."
echo "current live revision (rollback target) = $PREV"

# 3. Build ------------------------------------------------------------------
if [ "${1:-}" != "--no-build" ]; then
  say "Building image  $TAG"
  gcloud builds submit --tag "$TAG" --region="$REGION" .
else
  say "Skipping build (--no-build); deploying existing tag $TAG"
fi

# 4. Deploy (image-only) ----------------------------------------------------
say "Deploying image-only (preserves env/secrets/scaling)"
gcloud run deploy "$SERVICE" --image "$TAG" --region="$REGION" \
  --platform=managed --quiet

NEW="$(gcloud run services describe "$SERVICE" --region="$REGION" \
       --format='value(status.latestReadyRevisionName)')"
URL="$(gcloud run services describe "$SERVICE" --region="$REGION" \
       --format='value(status.url)')"
echo "new revision = $NEW"

# 5. Smoke test + auto-rollback --------------------------------------------
say "Smoke-testing $URL/health and $APEX"
ok=1
for target in "$URL/health" "$URL/" "$APEX/"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$target" || echo 000)"
  echo "  $target -> $code"
  case "$code" in 2*|3*) ;; *) ok=0 ;; esac
done

if [ "$ok" -ne 1 ]; then
  say "Smoke test FAILED — rolling back to $PREV"
  gcloud run services update-traffic "$SERVICE" --region="$REGION" \
    --to-revisions "${PREV}=100" --quiet
  die "Rolled back to $PREV. New revision $NEW was NOT kept."
fi

say "Deploy OK — $NEW is live at $URL (rollback target was $PREV)"
