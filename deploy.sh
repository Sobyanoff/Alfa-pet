#!/usr/bin/env bash
# Alfa Tracker — деплой на свежий Ubuntu 22.04 VPS.
# Запуск под root (или через sudo). Идемпотентен: можно гонять повторно.
#
# Минимальный запуск:
#   DOMAIN=tracker.example.com REPO_URL=https://github.com/you/alfa.git EMAIL=you@example.com bash deploy.sh
#
# Что делает:
#   - ставит Node.js, nginx, pm2, certbot, ufw, unattended-upgrades
#   - кладёт код в /opt/alfa-tracker, БД в /var/lib/alfa-tracker/alfa.db
#   - генерит /etc/alfa-tracker.env с JWT_SECRET (один раз) и ADMIN_PASSWORD
#   - запускает через pm2 с автозапуском при ребуте
#   - бэкап БД каждые 6 часов в /var/backups/alfa (хранится 14 дней)
#   - HTTPS через Let's Encrypt + авто-обновление сертификата (cron certbot)

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

echo "==> [1/10] apt update + базовые пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git build-essential ca-certificates ufw nginx unattended-upgrades sqlite3

echo "==> [2/10] Node.js ${NODE_MAJOR}.x (NodeSource) + pm2"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" != "${NODE_MAJOR}" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
npm i -g pm2
sudo -u "$(id -un 1000 2>/dev/null || echo root)" pm2 install pm2-logrotate >/dev/null 2>&1 || pm2 install pm2-logrotate || true

echo "==> [3/10] Пользователь ${APP_USER}, директории"
id -u "${APP_USER}" >/dev/null 2>&1 || useradd -m -s /bin/bash "${APP_USER}"
mkdir -p "${DB_DIR}" "${BACKUP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${DB_DIR}" "${BACKUP_DIR}"

echo "==> [4/10] Env-файл с секретами (${ENV_FILE})"
if [ ! -f "${ENV_FILE}" ]; then
  JWT_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 48)"
  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=3000
DB_PATH=${DB_PATH}
JWT_SECRET=${JWT_SECRET}
ADMIN_PASSWORD=${ADMIN_PASSWORD_DEFAULT}
EOF
  chmod 640 "${ENV_FILE}"
  chown root:"${APP_USER}" "${ENV_FILE}"
  echo "    JWT_SECRET сгенерирован, ADMIN_PASSWORD=${ADMIN_PASSWORD_DEFAULT}"
else
  echo "    ${ENV_FILE} уже существует — не трогаю"
fi

echo "==> [5/10] Клон/обновление репо в ${APP_DIR}"
if [ ! -d "${APP_DIR}/.git" ]; then
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone "${REPO_URL}" "${APP_DIR}"
else
  git -C "${APP_DIR}" pull --ff-only
fi
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "==> [6/10] npm install + init БД"
sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && (npm ci --omit=dev 2>/dev/null || npm install --omit=dev)"
if [ ! -f "${DB_PATH}" ]; then
  sudo -u "${APP_USER}" env DB_PATH="${DB_PATH}" bash -lc "cd '${APP_DIR}' && node database/init.js"
fi

echo "==> [7/10] pm2 (автозапуск + env из ${ENV_FILE})"
# Генерим ecosystem с env-файлом — pm2 подхватит переменные при старте
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
    max_restarts: 10,
    restart_delay: 3000,
    autorestart: true,
  }],
};
EOF
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/ecosystem.config.js"

sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && pm2 delete alfa-tracker >/dev/null 2>&1 || true; pm2 start ecosystem.config.js"
sudo -u "${APP_USER}" bash -lc "pm2 save"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" | tail -n 1 | bash || true

echo "==> [8/10] nginx + firewall"
NGINX_CONF="/etc/nginx/sites-available/alfa-tracker"
sed "s/__DOMAIN__/${DOMAIN}/g" "${APP_DIR}/nginx.conf" > "${NGINX_CONF}"
ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/alfa-tracker
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

echo "==> [9/10] HTTPS через certbot"
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "${DOMAIN}" -m "${EMAIL}" --agree-tos --non-interactive --redirect || \
  echo "!! certbot не смог выпустить сертификат — проверь A-запись DNS ${DOMAIN} → IP сервера"

echo "==> [10/10] Бэкапы БД + автообновления безопасности"
cat > /etc/cron.d/alfa-tracker-backup <<EOF
# Snapshot SQLite каждые 6 часов; чистка > 14 дней
0 */6 * * * ${APP_USER} /usr/bin/sqlite3 ${DB_PATH} ".backup '${BACKUP_DIR}/alfa-\$(date +\\%Y\\%m\\%d-\\%H).db'" >/dev/null 2>&1
30 3 * * * ${APP_USER} find ${BACKUP_DIR} -name 'alfa-*.db' -mtime +14 -delete
EOF
chmod 644 /etc/cron.d/alfa-tracker-backup

# unattended-upgrades — только security
dpkg-reconfigure -f noninteractive -plow unattended-upgrades || true

echo
echo "============================================================"
echo "✓ Готово. Открой: https://${DOMAIN}"
echo "  Health: https://${DOMAIN}/api/health"
echo "  Логи:   sudo -u ${APP_USER} pm2 logs alfa-tracker"
echo "  Рестарт:sudo -u ${APP_USER} pm2 restart alfa-tracker"
echo "  БД:     ${DB_PATH}"
echo "  Бэкапы: ${BACKUP_DIR}"
echo "  Env:    ${ENV_FILE}  (ADMIN_PASSWORD здесь)"
echo "============================================================"
