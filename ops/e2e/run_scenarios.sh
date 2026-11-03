#!/usr/bin/env bash
# Run the scenario suites against a disposable copy of the production image.
#   ops/e2e/run_scenarios.sh tier1   [extra pytest args]   # every route + journeys + modules (deploy gate)
#   ops/e2e/run_scenarios.sh nightly [extra pytest args]   # every lesson/path/boss battle/org type
# Env: PM_E2E_IMAGE (image to test; built from the repo if unset), PM_E2E_DOCKER (docker|podman),
#      PM_E2E_PORT (default 8080), PM_E2E_WORKERS (pytest -n, default auto), PM_E2E_PYTHON (default python3).
set -uo pipefail
TIER="${1:-tier1}"; shift || true
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
DOCKER="${PM_E2E_DOCKER:-docker}"; PORT="${PM_E2E_PORT:-8080}"; NAME="${PM_E2E_CONTAINER:-pm-e2e}"
OUT="$HERE/out"; mkdir -p "$OUT"
IMAGE="${PM_E2E_IMAGE:-}"
if [ -z "$IMAGE" ]; then
  IMAGE=pymasters:e2e
  "$DOCKER" build -q --build-arg BUILD_SHA=e2e-local -t "$IMAGE" "$REPO" >/dev/null || { echo "image build failed"; exit 2; }
fi
rnd() { python3 -c "import secrets;print(secrets.token_urlsafe($1))"; }
export PM_E2E_OPS_TOKEN="$(rnd 24)" PM_E2E_BASE="http://127.0.0.1:$PORT" PM_E2E_CONTAINER="$NAME" PM_E2E_DOCKER="$DOCKER"
"$DOCKER" rm -f "$NAME" >/dev/null 2>&1 || true
"$DOCKER" run -d --name "$NAME" --cap-add NET_ADMIN -p "127.0.0.1:$PORT:8080" \
  -e DB_PATH=/app/data/e2e.db -e PYMASTERS_ENV=ci -e VAATHIYAAR_PROVIDERS=stub -e PYMASTERS_JOBS=0 \
  -e JWT_SECRET="$(rnd 48)" -e OPS_ADMIN_TOKEN="$PM_E2E_OPS_TOKEN" -e EXPORT_TOKEN="$(rnd 24)" \
  -e RAZORPAY_KEY_ID=rzp_test_ci -e RAZORPAY_KEY_SECRET="${PM_E2E_RZP_SECRET:=$(rnd 24)}" \
  -e SEMANTIC_AUTOSTART=1 -e APP_BASE_URL="http://127.0.0.1:$PORT" -e FRONTEND_URL="http://127.0.0.1:$PORT" \
  "$IMAGE" >/dev/null || { echo "container start failed"; exit 2; }
export PM_E2E_RZP_SECRET
"$DOCKER" exec "$NAME" mkdir -p /app/ops_e2e && "$DOCKER" cp "$HERE/scenarios/_dbtool.py" "$NAME:/app/ops_e2e/_dbtool.py" \
  && "$DOCKER" cp "$HERE/solutions/verify.py" "$NAME:/app/ops_e2e/verify.py"
for i in $(seq 1 90); do curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; sleep 2; done
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null || { "$DOCKER" logs "$NAME" > "$OUT/container.log" 2>&1; echo "container never became healthy"; exit 2; }

cd "$HERE/scenarios"
if [ "$TIER" = nightly ]; then SEL=(-m nightly nightly); else SEL=(-m "not nightly" --ignore=nightly); fi
"${PM_E2E_PYTHON:-python3}" -m pytest "${SEL[@]}" -n "${PM_E2E_WORKERS:-auto}" --reruns "${PM_E2E_RERUNS:-1}" -q -rfER --tb=short \
  --junitxml="$OUT/junit-$TIER.xml" "$@"
RC=$?
"$DOCKER" logs "$NAME" > "$OUT/container.log" 2>&1
[ -n "${PM_E2E_KEEP:-}" ] || "$DOCKER" rm -f "$NAME" >/dev/null 2>&1
exit $RC
