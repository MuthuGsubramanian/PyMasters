#!/usr/bin/env bash
# Cloud Run → GCE VM cut-over, run from the ops laptop.
#
#   infra/gce/cutover.sh freeze    # 1. take Cloud Run off pymasters.net, copy the final DB to the VM
#                                  #    → then change the Wix A records to 35.206.69.198
#   infra/gce/cutover.sh verify    # 2. once DNS resolves: TLS, health, login, build marker
#   infra/gce/cutover.sh finish    # 3. Cloud Run to min-instances 0 (kept a week as cold fallback)
#   infra/gce/cutover.sh rollback  # any time before 'finish': re-create the Cloud Run domain mapping
#
# Why "freeze" before the DNS change: SQLite lives in one place. If users could
# still write to Cloud Run while others already hit the VM, the two copies would
# diverge. Deleting the domain mapping makes stale resolvers get an error page
# instead of a silently forked database; the window is the DNS TTL.
set -euo pipefail
PROJECT=pymasters-app; REGION=us-central1; ZONE=us-central1-a; VM=pymasters-vm
IP=35.206.69.198
KEY="$HOME/.ssh/google_compute_engine"; SSH_USER="${SSH_USER:-muthu}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 "$SSH_USER@$IP")
IMG=us-central1-docker.pkg.dev/pymasters-app/cloud-run-source-deploy/pymasters:latest

case "${1:-}" in
  freeze)
    echo "== 1/3 removing Cloud Run domain mappings (site dark on Cloud Run from now)"
    for d in pymasters.net www.pymasters.net; do
      gcloud beta run domain-mappings delete --domain "$d" --region "$REGION" --project "$PROJECT" --quiet || true
    done
    echo "== 2/3 waiting 15s for Litestream on Cloud Run to flush the last writes"; sleep 15
    echo "== 3/3 restoring the final Cloud Run replica onto the VM"
    "${SSH[@]}" "set -e; cd /opt/pymasters
      sudo docker compose stop app >/dev/null
      sudo rm -f data/pymasters.db data/pymasters.db-wal data/pymasters.db-shm
      sudo rm -rf data/.pymasters.db-litestream
      sudo docker run --rm -v /opt/pymasters/data:/app/data $IMG litestream restore -o /app/data/pymasters.db gcs://pymasters-app-db/pymasters.db 2>&1 | tail -1
      sudo chmod 700 data
      sudo docker compose up -d app >/dev/null
      for i in \$(seq 1 40); do curl -fsS http://127.0.0.1:8080/health >/dev/null 2>&1 && { echo healthy; break; }; sleep 5; done
      sudo docker exec pymasters-app python -c \"import sqlite3;print('users:',sqlite3.connect('/app/data/pymasters.db').execute('select count(*) from users').fetchone()[0])\""
    echo
    echo ">>> NOW change DNS at Wix: A pymasters.net -> $IP ; A www -> $IP (or CNAME www -> pymasters.net)."
    echo ">>> Then: infra/gce/cutover.sh verify"
    ;;
  verify)
    echo "resolves to: $(nslookup -type=A pymasters.net 8.8.8.8 2>/dev/null | awk '/^Address/ {a=$2} END {print a}')"
    curl -sS -o /dev/null -w "https://pymasters.net/  -> %{http_code} (%{time_total}s, TLS ok)\n" https://pymasters.net/
    curl -sS https://pymasters.net/health; echo
    curl -sS -o /dev/null -w "www redirect -> %{http_code} %{redirect_url}\n" https://www.pymasters.net/
    MSYS_NO_PATHCONV=1 python ops/pm_admin.py get /api/admin/overview | head -c 200; echo
    ;;
  finish)
    echo "== Cloud Run to min-instances 0 (cold fallback; delete after a week with: gcloud run services delete pymasters --region $REGION)"
    gcloud run services update pymasters --region "$REGION" --project "$PROJECT" --min-instances 0 --quiet
    gcloud run services describe pymasters --region "$REGION" --project "$PROJECT" --format='value(spec.template.metadata.annotations["autoscaling.knative.dev/minScale"])'
    ;;
  rollback)
    echo "== re-creating the Cloud Run domain mapping (DNS must point back at 216.239.32.21/34.21/36.21/38.21)"
    gcloud beta run domain-mappings create --service pymasters --domain pymasters.net --region "$REGION" --project "$PROJECT"
    gcloud beta run domain-mappings create --service pymasters --domain www.pymasters.net --region "$REGION" --project "$PROJECT"
    ;;
  *) sed -n 2,12p "$0"; exit 2 ;;
esac
