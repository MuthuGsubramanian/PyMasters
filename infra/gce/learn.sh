#!/usr/bin/env bash
# Nightly adaptive-learning cycle (pymasters-learn.timer, 21:00 UTC = 02:30 IST):
# signs in with the ops token from /opt/pymasters/.env and runs
# POST /api/admin/vaathiyaar/learn on the local app (regression check →
# tutor insights → learner notes). Output goes to the journal:
#   sudo journalctl -u pymasters-learn -n 20
set -euo pipefail
B=http://127.0.0.1:8080
OPS="$(grep -E '^OPS_ADMIN_TOKEN=' /opt/pymasters/.env | cut -d= -f2- | tr -d '\r\n')"
[ -n "$OPS" ] || { echo "OPS_ADMIN_TOKEN missing in /opt/pymasters/.env"; exit 1; }
TOK="$(curl -fsS -X POST "$B/api/admin/service-login" -H 'Content-Type: application/json' \
       -d "{\"token\":\"$OPS\"}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
curl -fsS --max-time 1500 -X POST "$B/api/admin/vaathiyaar/learn" -H "Authorization: Bearer $TOK" \
  | python3 -c '
import json, sys
s = json.load(sys.stdin)
print("learning cycle:", "ok" if not s.get("errors") else "errors", "| seconds", s.get("seconds"),
      "| learners", s.get("active_learners"), "| insights", s.get("insights"),
      "| regression", s.get("regression"), "| errors", s.get("errors"))
for l in s.get("learners", []):
    print("  learner", l)
'
