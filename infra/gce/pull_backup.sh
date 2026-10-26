#!/usr/bin/env bash
# Nightly from the ops laptop (Task Scheduler "PyMasters-DbBackup" → Git Bash):
# take a consistent SQLite backup on the VM and pull it here. Keeps 14 copies.
# Third copy of the data after the VM disk and the Litestream replica in GCS.
set -euo pipefail
IP="${PYM_VM_IP:-35.206.69.198}"; USER_="${SSH_USER:-muthu}"
KEY="$HOME/.ssh/google_compute_engine"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 "$USER_@$IP")
DEST="${HOME}/.pymasters/backups"; mkdir -p "$DEST"
stamp="$(date +%Y%m%d-%H%M)"
"${SSH[@]}" 'sudo docker exec pymasters-app sqlite3 /app/data/pymasters.db ".backup /app/data/backup.db" && sudo gzip -f /opt/pymasters/data/backup.db && sudo chmod 644 /opt/pymasters/data/backup.db.gz'
scp -q -i "$KEY" "$USER_@$IP:/opt/pymasters/data/backup.db.gz" "$DEST/pymasters-$stamp.db.gz"
"${SSH[@]}" 'sudo rm -f /opt/pymasters/data/backup.db.gz'
ls -1t "$DEST"/pymasters-*.db.gz | tail -n +15 | xargs -r rm -f
echo "$(date +%FT%T) backup saved: $DEST/pymasters-$stamp.db.gz ($(du -h "$DEST/pymasters-$stamp.db.gz" | cut -f1))" | tee -a "$DEST/backup.log"
