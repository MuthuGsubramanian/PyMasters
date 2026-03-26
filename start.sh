#!/bin/bash
set -e

echo "=== PyMasters Starting ==="
echo "DB_PATH=${DB_PATH:-not set}"
echo "OLLAMA_API_KEY=${OLLAMA_API_KEY:+set (hidden)}"

# Test DB access
cd /app/backend
python -c "
import os, sqlite3
db = os.getenv('DB_PATH', 'pymasters.db')
print(f'DB path: {db}')
conn = sqlite3.connect(db)
conn.execute('SELECT 1').fetchone()
conn.close()
print('SQLite OK')
from main import app
print('App import OK')
" 2>&1

echo "=== Starting services ==="
exec supervisord -c /etc/supervisor/conf.d/pymasters.conf
