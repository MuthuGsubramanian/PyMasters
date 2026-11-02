#!/bin/bash
# 08:00 IST autonomous triage (spec §6): collect today's red test signals; if any, a headless Claude session
# fixes them on branches behind the same gates a human change goes through. Nothing red → exits quietly.
#   e2e_triage.sh [--dry-run]     (--dry-run prints the prompt and exits)
set -u
export PATH=/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin
REPO=~/Documents/Development/PyMasters
R=${PM_TRIAGE_REPORTS:-$HOME/pymasters-ops/reports}   # overridable for dry runs with synthetic reports
D=$(date +%F)
REPORT=$R/triage-$D.md
mkdir -p "$R"

{
  echo "# Red test signals — $D"
  RUN=$(cd "$REPO" && gh run list -w deploy.yml -b main -L 1 --json databaseId,conclusion,displayTitle \
        -q '.[0] | select(.conclusion == "failure") | "\(.databaseId) \(.displayTitle)"' 2>/dev/null)
  [ -n "$RUN" ] && echo "## Tier 1 failing on main (deploy run ${RUN%% *}: ${RUN#* })" \
    && echo "Inspect with: gh run view ${RUN%% *} --log-failed | tail -200"

  NDIR=$(mktemp -d)
  NID=$(cd "$REPO" && gh run list -w nightly-e2e.yml -L 1 --json databaseId -q '.[0].databaseId' 2>/dev/null)
  if [ -n "$NID" ] && (cd "$REPO" && gh run download "$NID" -n nightly-report -D "$NDIR" >/dev/null 2>&1); then
    python3 - "$NDIR/nightly-report.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
if r["failures"]:
    print(f"## Nightly failures ({r['date']}, image {r['image']}): {len(r['failures'])}")
    for f in r["failures"]:
        print(f"- {f['test']}: {f['message'][:300]}")
PY
  fi
  rm -rf "$NDIR"

  PS=$R/prod-smoke-$D.json
  if [ ! -s "$PS" ]; then
    echo "## Production smoke did not run today (systemctl --user status pymasters-prod-smoke)"
  else
    python3 - "$PS" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
bad = [c for c in r["checks"] if not c["ok"]]
if bad:
    print("## Production smoke failures")
    for c in bad:
        print(f"- {c['name']}: {c['detail']}")
PY
  fi
} > "$REPORT"

if ! grep -q '^## ' "$REPORT"; then
  echo "nothing red on $D"; rm -f "$REPORT"; exit 0
fi

PROMPT="You are the PyMasters owner's autonomous maintainer, running unattended at 08:00 IST. The red test
signals below came from the deploy gate (Tier 1), the nightly suite (Tier 2) or the production smoke. Fix them.

Work in $REPO. For EACH distinct defect:
1. git fetch origin && git switch -c triage/$D-<short-slug> origin/main.
2. Reproduce it first (ops/e2e/run_scenarios.sh tier1 -k <name>, or nightly -k <name>, PM_E2E_DOCKER=podman
   PM_E2E_PYTHON=~/pymasters-ops/e2e-venv/bin/python). Find the root cause; fix the product, or the content
   (lesson JSON), or the test only when the test is provably wrong.
3. Run the gates: backend (inside the test container: its image has every backend dependency), frontend
   (cd frontend && npx -y node@20 node_modules/vitest/vitest.mjs run && npm run build — this laptop's Node 26
   breaks jsdom's localStorage, CI uses Node 20), and ops/e2e/run_scenarios.sh tier1. All must be green.
4. Push the branch, open a PR (gh pr create) describing cause and fix, wait for its checks, and merge
   (gh pr merge --squash) ONLY when every check is green.

Guardrails (never break these):
- At most 3 fix attempts per defect. If still red, stop on that defect and append one line to
  ~/pymasters-ops/reminders.txt: '- ACTION FOR OWNER (triage $D): <defect> — <what you found>'.
- Never delete, skip, xfail or weaken a test to make it pass.
- Never touch secrets, credentials, .env files, billing, DNS, Cloudflare, firewall rules or IAM.
- Never push to main directly; never force-push; never merge a PR with a failing or pending check.
- A production-smoke failure that is infrastructure (site down, VM, certificates) is NOT yours to fix:
  write it to reminders.txt as an owner action and move on.
Finish with a short summary: each defect, fixed (PR link) or handed to the owner.

$(cat "$REPORT")"

if [ "${1:-}" = "--dry-run" ]; then
  echo "$PROMPT"; exit 0
fi
cd "$REPO" && claude -p "$PROMPT" --permission-mode acceptEdits --allowedTools "Bash,Read,Edit,Write" \
  --output-format text > "$R/triage-$D.log" 2>&1
