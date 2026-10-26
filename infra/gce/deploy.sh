#!/usr/bin/env bash
# Deploy/refresh PyMasters on the GCE VM from the ops laptop (Git Bash).
#
#   infra/gce/deploy.sh            # sync config + secrets, (re)start the stack
#   infra/gce/deploy.sh --bootstrap  # first run: install docker, firewall, swap, timer
#
# Secrets are read from the laptop vault (ops/vault/pmvault.py) and written to
# /opt/pymasters/.env on the VM (0600). Image updates afterwards need no laptop:
# the VM's systemd timer pulls :latest from Artifact Registry every 2 minutes.
set -euo pipefail
PROJECT=pymasters-app; ZONE=us-central1-a; VM=pymasters-vm
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="${PYTHON:-python}"
VAULT="$HERE/../../ops/vault/pmvault.py"
# Plain OpenSSH with the key gcloud registered in project metadata (gcloud compute ssh
# on Windows shells out to PuTTY, which cannot take a script on stdin).
HOST="$(gcloud compute instances describe "$VM" --project "$PROJECT" --zone "$ZONE" --format='value(networkInterfaces[0].accessConfigs[0].natIP)')"
KEY="$HOME/.ssh/google_compute_engine"
SSH_USER="${SSH_USER:-muthu}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 "$SSH_USER@$HOST")
SCP=(scp -q -i "$KEY" -o StrictHostKeyChecking=accept-new)

RUNTIME_SECRETS=(JWT_SECRET OLLAMA_API_KEY QUBRID_API_KEY QUBRID2_API_KEY EXPORT_TOKEN SOCIAL_WORKER_TOKEN
  OPS_ADMIN_TOKEN SMTP_USER SMTP_PASS FROM_EMAIL SMTP_BACKUP_USER SMTP_BACKUP_PASS
  GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET
  RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET)

if [ "${1:-}" = "--bootstrap" ]; then
  echo "== bootstrap (docker, firewall, swap, deploy dir)"
  "${SSH[@]}" "sudo bash -s" < "$HERE/../vps/bootstrap.sh"
  "${SSH[@]}" 'sudo usermod -aG docker "$USER"; sudo chown -R "$USER":"$USER" /opt/pymasters; sudo chmod 700 /opt/pymasters/data'
fi

tmp_env="$(mktemp)"; trap 'rm -f "$tmp_env"' EXIT
missing=()
for name in "${RUNTIME_SECRETS[@]}"; do
  if val="$("$PY" "$VAULT" get "$name" 2>/dev/null)"; then printf '%s=%s\n' "$name" "$val" >> "$tmp_env"; else missing+=("$name"); fi
done
((${#missing[@]})) && echo "WARNING: not in vault: ${missing[*]}" >&2

echo "== syncing config + secrets"
"${SCP[@]}" "$tmp_env" "$SSH_USER@$HOST:/tmp/pm.env"
"${SCP[@]}" "$HERE/docker-compose.yml" "$HERE/Caddyfile" "$HERE/litestream.yml" "$HERE/update.sh" \
  "$HERE/pymasters-update.service" "$HERE/pymasters-update.timer" "$HERE/learn.sh" \
  "$HERE/pymasters-learn.service" "$HERE/pymasters-learn.timer" "$SSH_USER@$HOST:/tmp/"
"${SSH[@]}" 'set -e
  sudo install -m 600 -o "$USER" /tmp/pm.env /opt/pymasters/.env && rm -f /tmp/pm.env
  sudo install -m 644 /tmp/docker-compose.yml /tmp/Caddyfile /tmp/litestream.yml /opt/pymasters/
  sudo install -m 755 /tmp/update.sh /opt/pymasters/update.sh
  sudo install -m 755 /tmp/learn.sh /opt/pymasters/learn.sh
  sudo install -m 644 /tmp/pymasters-update.service /tmp/pymasters-update.timer /tmp/pymasters-learn.service /tmp/pymasters-learn.timer /etc/systemd/system/
  sudo systemctl daemon-reload && sudo systemctl enable --now pymasters-update.timer pymasters-learn.timer
  sudo /opt/pymasters/update.sh --force'
echo "== done: $HOST"
