#!/usr/bin/env bash
# One-time preparation of an Ubuntu 22.04 / 24.04 VPS (Hostinger). Run as root:  bash server-setup.sh
# Installs Node 22 + pnpm + pm2, Docker (for the database only), nginx + certbot (HTTPS reverse proxy — skipped if
# nginx is already installed, e.g. serving other apps on this box), a firewall (SSH/HTTP/HTTPS only) and swap, and
# creates an unprivileged `mashkoor` user that owns the app and runs pm2. Safe to run twice.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run as root (sudo bash server-setup.sh)"; exit 1; fi
APP_USER=mashkoor

echo "==> Base packages"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg git rsync ufw unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https

echo "==> Node 22, pnpm, pm2"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable
npm install -g pm2
pm2 install pm2-logrotate >/dev/null 2>&1 || true

echo "==> Docker (database only)"
if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | sh; fi
systemctl enable --now docker

echo "==> nginx + certbot (HTTPS reverse proxy)"
if ! command -v nginx >/dev/null 2>&1; then apt-get install -y nginx; fi
apt-get install -y certbot python3-certbot-nginx
systemctl enable --now nginx

echo "==> Firewall: SSH, HTTP, HTTPS only (Postgres and the Node apps are not reachable from outside)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Swap (building the apps needs more memory than a small VPS has)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo "==> App user and folders"
id "$APP_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$APP_USER"
usermod -aG docker "$APP_USER"
mkdir -p /var/www/mashkoor /var/www/mashkoor-app /var/backups/mashkoor
chown -R "$APP_USER":"$APP_USER" /var/www/mashkoor /var/www/mashkoor-app
# nginx (running as www-data) reads the static build as "other" — a normal build's default permissions
# (world-readable files, traversable directories) already allow this; nothing extra to grant here.

# Uploaded documents (visas, tickets, vouchers) live here, encrypted at rest — outside the app folder, readable
# only by the app user. Must match UPLOAD_DIR in backend/.env.
mkdir -p /var/lib/mashkoor/uploads
chown -R "$APP_USER":"$APP_USER" /var/lib/mashkoor
chmod 700 /var/lib/mashkoor/uploads

echo "==> pm2 starts by itself after a reboot"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null

echo "Done. Next: follow deploy/README.md from step 3."
