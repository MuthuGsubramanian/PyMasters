#!/bin/bash
set -e

echo "=== PyMasters Starting ==="
DB="${DB_PATH:-/app/data/pymasters.db}"
echo "DB_PATH=${DB}"
echo "OLLAMA_API_KEY=${OLLAMA_API_KEY:+set (hidden)}"

mkdir -p "$(dirname "$DB")"
cd /app/backend

# --- Restore database from GCS replica, or seed from baked-in DB on first boot ---
if [ ! -f "$DB" ]; then
  echo "No local DB found. Attempting Litestream restore from GCS..."
  litestream restore -if-replica-exists -config /etc/litestream.yml "$DB" || true
  if [ -f "$DB" ]; then
    echo "Restored DB from GCS replica."
  else
    echo "No GCS replica yet. Seeding from baked-in DB."
    if [ -f /app/backend/pymasters.db ]; then
      cp /app/backend/pymasters.db "$DB"
    else
      echo "No baked-in seed DB; starting empty (app init_db will create schema)."
    fi
  fi
fi

# --- Litestream requires WAL journal mode (persistent property of the db file) ---
sqlite3 "$DB" "PRAGMA journal_mode=WAL;" >/dev/null 2>&1 || \
  python -c "import sqlite3; sqlite3.connect('$DB').execute('PRAGMA journal_mode=WAL')"

# --- Smoke test DB + app import ---
python -c "
import os, sqlite3
db = os.getenv('DB_PATH', '/app/data/pymasters.db')
sqlite3.connect(db).execute('SELECT 1').fetchone()
print('SQLite OK:', db)
from main import app
print('App import OK')
" 2>&1

echo "=== Starting services (nginx + uvicorn + litestream) ==="
exec supervisord -c /etc/supervisor/conf.d/pymasters.conf
