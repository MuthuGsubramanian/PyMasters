#!/bin/bash
# Nightly consistent SQLite backup of production, pulled to the ops laptop (free: ~1 MB/day egress).
# Safety net behind Litestream, which syncs to GCS only every 30 min to stay in the free tier.
set -euo pipefail
MEDIA=/mnt/eternity-store/EternityModels/pymasters-social
[ -d "${MEDIA%/*}" ] || MEDIA=~/.local/share/pymasters-social/media   # machines without the Eternity model store
DEST=$MEDIA/db-backups
mkdir -p "$DEST"
out="$DEST/pymasters-$(date +%Y%m%d-%H%M).db.gz"
gcloud compute ssh pymasters-vm --project pymasters-app --zone us-central1-a --quiet --tunnel-through-iap --account=muthu@pymasters.net \
  --command 'sudo docker exec pymasters-app sqlite3 /app/data/pymasters.db ".backup /tmp/nightly.db" && sudo docker exec pymasters-app sh -c "gzip -c /tmp/nightly.db && rm -f /tmp/nightly.db"' > "$out.part"
gzip -t "$out.part" && mv "$out.part" "$out"
python3 -c "
import gzip, sqlite3, sys, tempfile
with tempfile.NamedTemporaryFile(suffix='.db') as t:
    t.write(gzip.open(sys.argv[1]).read()); t.flush()
    c = sqlite3.connect(t.name); ok = c.execute('PRAGMA integrity_check').fetchone()[0]; n = c.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    print('integrity', ok, 'users', n); sys.exit(0 if ok == 'ok' else 1)
" "$out"
ls -1t "$DEST"/pymasters-*.db.gz | tail -n +15 | xargs -r rm -f
echo "$(date '+%F %T') saved $out ($(du -h "$out" | cut -f1))" | tee -a "$DEST/backup.log"
