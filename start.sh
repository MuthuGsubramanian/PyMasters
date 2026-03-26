#!/bin/bash
set -e

echo "=== PyMasters Starting ==="
echo "DB_PATH=${DB_PATH:-not set}"
echo "OLLAMA_API_KEY=${OLLAMA_API_KEY:+set (hidden)}"

# Test DB access
cd /app/backend
python -c "
import os
db = os.getenv('DB_PATH', 'pymasters.duckdb')
print(f'DB path: {db}')
import duckdb
conn = duckdb.connect(db)
conn.execute('SELECT 1').fetchone()
conn.close()
print('DuckDB OK')
from main import app
print('App import OK')
" 2>&1

echo "=== Starting services ==="
exec supervisord -c /etc/supervisor/conf.d/pymasters.conf
