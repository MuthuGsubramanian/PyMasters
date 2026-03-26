#!/bin/bash
set -e

echo "=== PyMasters Starting ==="
echo "Python: $(python --version)"
echo "Working dir: $(pwd)"
echo "Files in /app/backend:"
ls -la /app/backend/
echo "Packages:"
ls -la /app/backend/vaathiyaar/ 2>/dev/null || echo "NO vaathiyaar/"
ls -la /app/backend/routes/ 2>/dev/null || echo "NO routes/"
ls -la /app/backend/lessons/ 2>/dev/null || echo "NO lessons/"
echo "Testing import..."
cd /app/backend && python -c "from main import app; print('Import OK')" 2>&1
echo "=== Starting services ==="

exec supervisord -c /etc/supervisor/conf.d/pymasters.conf
