#!/usr/bin/env bash
# One-time VPS bootstrap (Ubuntu 24.04). Run as root on a fresh server:
#   curl -fsSL https://raw.githubusercontent.com/MuthuGsubramanian/PyMasters/main/infra/vps/bootstrap.sh | bash
# Idempotent. Installs Docker, hardens SSH/firewall, creates the deploy user
# and /opt/pymasters. deploy.sh (from the laptop) does the rest.
set -euo pipefail

DEPLOY_USER=pymasters
APP_DIR=/opt/pymasters

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades sqlite3 git

# Docker CE
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
systemctl enable --now docker

# Deploy user (SSH key is injected by the cloud provider for root; copy it over)
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash -G docker "$DEPLOY_USER"
  mkdir -p /home/$DEPLOY_USER/.ssh
  cp /root/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/authorized_keys 2>/dev/null || true
  chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
  chmod 700 /home/$DEPLOY_USER/.ssh; chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys || true
fi

mkdir -p $APP_DIR/data $APP_DIR/src
chown -R $DEPLOY_USER:$DEPLOY_USER $APP_DIR
chmod 750 $APP_DIR; chmod 700 $APP_DIR/data

# Firewall: SSH + HTTP/HTTPS only
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# SSH hardening
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd

# Automatic security updates + fail2ban defaults
dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now fail2ban

# Swap (2 GB) so a memory spike degrades instead of OOM-killing the app
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "bootstrap complete: docker $(docker --version | cut -d' ' -f3) ; deploy user=$DEPLOY_USER ; app dir=$APP_DIR"
