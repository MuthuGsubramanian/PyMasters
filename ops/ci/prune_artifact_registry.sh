#!/usr/bin/env bash
# Prune all older Docker image digests from an Artifact Registry package,
# keeping ONLY the digest tagged `:latest` (and any child manifests referenced
# by `:latest` if it is an OCI index / manifest list).
set -euo pipefail

REPO="${1:?Usage: $0 <registry>/<project>/<repository>/<package>}"

LATEST_DIGEST=$(gcloud artifacts docker images describe "$REPO:latest" \
  --format='value(image_summary.digest)' 2>/dev/null || true)

if [ -z "$LATEST_DIGEST" ]; then
  echo "No :latest tag found for $REPO — skipping prune to stay safe."
  exit 0
fi

KEEP_DIGESTS=$(
  REPO="$REPO" LATEST_DIGEST="$LATEST_DIGEST" TOKEN="$(gcloud auth print-access-token)" \
  python3 - <<'PY'
import json, os, urllib.request

repo = os.environ["REPO"]
digest = os.environ["LATEST_DIGEST"]
token = os.environ["TOKEN"]
host, path = repo.split("/", 1)
keep = {digest}

req = urllib.request.Request(
    f"https://{host}/v2/{path}/manifests/{digest}",
    headers={
        "Authorization": f"Bearer {token}",
        "Accept": ",".join([
            "application/vnd.oci.image.index.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.docker.distribution.manifest.v2+json",
        ]),
    },
)
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        manifest = json.loads(resp.read().decode("utf-8"))
    for child in manifest.get("manifests", []):
        if child.get("digest"):
            keep.add(child["digest"])
except Exception as exc:
    raise SystemExit(f"Failed to inspect :latest manifest {digest}: {exc}")

for d in sorted(keep):
    print(d)
PY
)

echo "Keeping :latest digests for $REPO:"
echo "$KEEP_DIGESTS"

TO_DELETE=""
ALL_DIGESTS=$(gcloud artifacts docker images list "$REPO" --format='value(version)')
for d in $ALL_DIGESTS; do
  if ! echo "$KEEP_DIGESTS" | grep -qx "$d"; then
    TO_DELETE="$TO_DELETE $d"
  fi
done

for pass in 1 2; do
  [ -z "${TO_DELETE// /}" ] && break
  NEXT_RETRY=""
  for d in $TO_DELETE; do
    echo "Deleting older digest $REPO@$d (pass $pass)"
    if ! gcloud artifacts docker images delete "$REPO@$d" --delete-tags --quiet; then
      NEXT_RETRY="$NEXT_RETRY $d"
    fi
  done
  TO_DELETE="$NEXT_RETRY"
done
