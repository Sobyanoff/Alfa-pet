#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-tracker.example.com}"
REPO_URL="${REPO_URL:-https://github.com/CHANGE_ME/alfa-project.git}"
EMAIL="${EMAIL:-admin@${DOMAIN}}"
APP_DIR="${APP_DIR:-/opt/alfa-tracker}"
APP_USER="${APP_USER:-alfa}"
DB_DIR="${DB_DIR:-/var/lib/alfa-tracker}"
DB_PATH="${DB_PATH:-${DB_DIR}/alfa.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/alfa}"
ENV_FILE="${ENV_FILE:-/etc/alfa-tracker.env}"
ADMIN_PASSWORD_DEFAULT="${ADMIN_PASSWORD:-alfa2026}"
NODE_MAJOR="${NODE_MAJOR:-20}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git build-essential ca-certificates ufw nginx unattended-upgrades sqlite3

if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" != "${NODE_MAJOR}" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
npm i -g pm2

id -u "${APP_USER}" >/dev/null 2>&1 || useradd -m -s /bin/bash "${APP_USER}"
mkdir -p "${DB_DIR}" "${BACKUP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${DB_DIR}" "${BACKUP_DIR}"

if [ ! -f "${ENV_FILE}" ]; then
  JWT_SECRET="$(openssl rand -hex 32)"
  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=3000
DB_PATH=${DB_PATH}
JWT_SECRET=${JWT_SECRET}
ADMIN_PASSWORD=${ADMIN_PASSWORD_DEFAULT}
EOF
  chmod 640 "${ENV_FILE}"
  chown root:"${APP_USER}" "${ENV_FILE}"
fi

if [ ! -d "${APP_DIR}/.git" ]; then
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone "${REPO_URL}" "${APP_DIR}"
else
  git -C "${APP_DIR}" pull --ff-only
fi
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && npm ci --omit=dev"
sudo -u "${APP_USER}" env DB_PATH="${DB_PATH}" bash -lc "cd '${APP_DIR}' && npm run init-db"

cat > "${APP_DIR}/ecosystem.config.js" <<'EOF'
const fs = require('fs');
const env = {};
const envFile = process.env.ENV_FILE || '/etc/alfa-tracker.env';
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  });
}
module.exports = {
  apps: [{
    name: 'alfa-tracker',
    script: 'server.js',
    cwd: __dirname,
    env,
    max_memory_restart: '300M',
    restart_delay: 3000,
    autorestart: true
  }]
};
EOF
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/ecosystem.config.js"

sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && pm2 delete alfa-tracker >/dev/null 2>&1 || true; pm2 start ecosystem.config.js"
sudo -u "${APP_USER}" bash -lc "pm2 save"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" | tail -n 1 | bash || true

sed "s/__DOMAIN__/${DOMAIN}/g" "${APP_DIR}/deploy/nginx.conf" > /etc/nginx/sites-available/alfa-tracker
ln -sf /etc/nginx/sites-available/alfa-tracker /etc/nginx/sites-enabled/alfa-tracker
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "${DOMAIN}" -m "${EMAIL}" --agree-tos --non-interactive --redirect || true

chmod +x "${APP_DIR}/deploy/backup.sh" || true
cat > /etc/cron.d/alfa-tracker-backup <<EOF
0 */6 * * * ${APP_USER} DB_PATH=${DB_PATH} BACKUP_DIR=${BACKUP_DIR} ${APP_DIR}/deploy/backup.sh >/dev/null 2>&1
EOF
chmod 644 /etc/cron.d/alfa-tracker-backup
dpkg-reconfigure -f noninteractive -plow unattended-upgrades || true

echo "Ready: https://${DOMAIN}"
