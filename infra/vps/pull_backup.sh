#!/usr/bin/env bash
# Nightly from the ops laptop (Task Scheduler → Git Bash): take a consistent
# SQLite backup on the VPS and pull it here. Keeps 14 daily copies.
#   infra/vps/pull_backup.sh pymasters@<ip>
set -euo pipefail
HOST="${1:?usage: pull_backup.sh user@host}"
DEST="${HOME}/.pymasters/backups"
mkdir -p "$DEST"
stamp="$(date +%Y%m%d-%H%M)"
ssh "$HOST" 'docker exec pymasters-app sqlite3 /app/data/pymasters.db ".backup /app/data/backup.db" && gzip -f /opt/pymasters/data/backup.db'
scp -q "$HOST:/opt/pymasters/data/backup.db.gz" "$DEST/pymasters-$stamp.db.gz"
ssh "$HOST" 'rm -f /opt/pymasters/data/backup.db.gz'
ls -1t "$DEST"/pymasters-*.db.gz | tail -n +15 | xargs -r rm -f
echo "backup saved: $DEST/pymasters-$stamp.db.gz ($(du -h "$DEST/pymasters-$stamp.db.gz" | cut -f1))"
