#!/bin/bash
# Re-authenticate gcloud for both PyMasters operator accounts:
#   1. muthu@pymasters.net             (primary org, VM IAP SSH, main billing/storage)
#   2. muthu.g.subramanian@gmail.com   (fallback + legacy project owner)
#
# Usage:
#   ~/pymasters-ops/gcloud_reauth.sh              # browser login for whichever accounts are expired (or both)
#   ~/pymasters-ops/gcloud_reauth.sh --all        # force browser login for both accounts
#   ~/pymasters-ops/gcloud_reauth.sh --org        # only muthu@pymasters.net
#   ~/pymasters-ops/gcloud_reauth.sh --gmail      # only muthu.g.subramanian@gmail.com
#   ~/pymasters-ops/gcloud_reauth.sh --no-browser # print URL + paste code in terminal
#   ~/pymasters-ops/gcloud_reauth.sh --status     # check token status without logging in
set -euo pipefail

ORG_ACC="muthu@pymasters.net"
GMAIL_ACC="muthu.g.subramanian@gmail.com"
BROWSER_FLAG=""
MODE="expired"

for arg in "$@"; do
  case "$arg" in
    --no-browser|--no-launch-browser) BROWSER_FLAG="--no-launch-browser" ;;
    --all|--both) MODE="all" ;;
    --org) MODE="org" ;;
    --gmail) MODE="gmail" ;;
    --status) MODE="status" ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
  esac
done

check_token() {
  local acc="$1"
  CLOUDSDK_CORE_DISABLE_PROMPTS=1 timeout 15 gcloud auth print-access-token --quiet --account="$acc" >/dev/null 2>&1
}

print_status() {
  echo "=== gcloud Account Token Status ==="
  if check_token "$ORG_ACC"; then
    echo "  [OK]      $ORG_ACC (primary org / VM IAP SSH)"
  else
    echo "  [EXPIRED] $ORG_ACC (primary org / VM IAP SSH)"
  fi
  if check_token "$GMAIL_ACC"; then
    echo "  [OK]      $GMAIL_ACC (fallback / legacy projects)"
  else
    echo "  [EXPIRED] $GMAIL_ACC (fallback / legacy projects)"
  fi
}

if [ "$MODE" = "status" ]; then
  print_status
  exit 0
fi

login_account() {
  local acc="$1"
  echo ""
  echo ">>> Authenticating $acc ..."
  # Revoke any stale RAPT-expired credential first so gcloud launches the browser OAuth flow
  # instead of hanging on a terminal 'Reauthentication required. Please enter your password:' prompt.
  CLOUDSDK_CORE_DISABLE_PROMPTS=1 gcloud auth revoke "$acc" >/dev/null 2>&1 || true
  gcloud auth login "$acc" $BROWSER_FLAG
}

print_status

if [ "$MODE" = "org" ]; then
  login_account "$ORG_ACC"
elif [ "$MODE" = "gmail" ]; then
  login_account "$GMAIL_ACC"
elif [ "$MODE" = "all" ]; then
  login_account "$ORG_ACC"
  login_account "$GMAIL_ACC"
else
  # Default: login any account whose token is currently expired/missing
  if ! check_token "$ORG_ACC"; then
    login_account "$ORG_ACC"
  fi
  if ! check_token "$GMAIL_ACC"; then
    login_account "$GMAIL_ACC"
  fi
fi

# Always set the org account as the active default account
gcloud config set account "$ORG_ACC" >/dev/null 2>&1 || true

echo ""
print_status

if check_token "$ORG_ACC"; then
  echo ""
  echo ">>> Running immediate production DB backup (db_backup.sh) to clear backlog..."
  ~/pymasters-ops/db_backup.sh || echo "WARN: db_backup.sh failed"
  systemctl --user reset-failed pymasters-db-backup.service 2>/dev/null || true
fi

echo ""
echo ">>> Refreshing today's status report (collect_status.sh)..."
~/pymasters-ops/collect_status.sh
