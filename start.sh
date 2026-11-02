#!/bin/bash
set -e

echo "=== PyMasters Starting ==="
DB="${DB_PATH:-/app/data/pymasters.db}"
echo "DB_PATH=${DB}"
echo "OLLAMA_API_KEY=${OLLAMA_API_KEY:+set (hidden)}"

mkdir -p "$(dirname "$DB")"
chmod 700 "$(dirname "$DB")" 2>/dev/null || true   # keep the DB out of reach of the sandbox uid
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

# --- Sandbox network isolation (2026-11-02 security fix) ---
# Learner code runs as the unprivileged `sandbox` uid. Docker's seccomp profile forbids `unshare`,
# so the namespace isolation in vaathiyaar/execution.py is unavailable here; reject ALL outbound
# traffic from that uid instead (metadata server, internet, and the API on loopback), then verify.
# Needs cap_add: NET_ADMIN (infra/gce/docker-compose.yml). Only root holds it; the sandbox uid has none.
# The app refuses to execute code unless SANDBOX_NET_FIREWALL=1 (fail closed).
export SANDBOX_NET_FIREWALL=0
if id sandbox >/dev/null 2>&1 && command -v iptables >/dev/null 2>&1; then
  for ipt in iptables ip6tables; do
    $ipt -C OUTPUT -m owner --uid-owner sandbox -j REJECT 2>/dev/null \
      || $ipt -A OUTPUT -m owner --uid-owner sandbox -j REJECT 2>/dev/null || true
  done
  probe=$(su -s /bin/sh sandbox -c "python3 -I -c 'import socket
try:
    socket.create_connection((\"169.254.169.254\", 80), 2).close(); print(\"REACHABLE\")
except Exception:
    print(\"blocked\")'" 2>/dev/null || echo unknown)
  if [ "$probe" = "blocked" ]; then
    export SANDBOX_NET_FIREWALL=1
    echo "Sandbox egress firewall: active (sandbox uid cannot reach the network)"
  else
    echo "WARNING: sandbox egress firewall NOT verified (probe=$probe) - code execution will be refused"
  fi
fi

echo "=== Starting services (nginx + uvicorn + litestream) ==="
exec supervisord -c /etc/supervisor/conf.d/pymasters.conf
