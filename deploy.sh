#!/usr/bin/env bash
# Alfa Tracker — деплой на свежий Ubuntu 22.04 VPS.
# Запуск под root (или через sudo). Идемпотентен: можно гонять повторно.
#
# Перед запуском заполни переменные ниже либо передай через env:
#   DOMAIN=tracker.example.com REPO_URL=https://github.com/you/alfa.git EMAIL=you@example.com bash deploy.sh

set -euo pipefail

DOMAIN="${DOMAIN:-tracker.example.com}"
REPO_URL="${REPO_URL:-https://github.com/CHANGE_ME/alfa-project.git}"
EMAIL="${EMAIL:-admin@${DOMAIN}}"
APP_DIR="${APP_DIR:-/opt/alfa-tracker}"
APP_USER="${APP_USER:-alfa}"
NODE_MAJOR="${NODE_MAJOR:-20}"

echo "==> [1/8] apt update + базовые пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git build-essential ca-certificates ufw nginx

echo "==> [2/8] Node.js ${NODE_MAJOR}.x (NodeSource) + pm2"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" != "${NODE_MAJOR}" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
npm i -g pm2

echo "==> [3/8] Пользователь ${APP_USER}"
id -u "${APP_USER}" >/dev/null 2>&1 || useradd -m -s /bin/bash "${APP_USER}"

echo "==> [4/8] Клон/обновление репо в ${APP_DIR}"
if [ ! -d "${APP_DIR}/.git" ]; then
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone "${REPO_URL}" "${APP_DIR}"
else
  git -C "${APP_DIR}" pull --ff-only
fi
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "==> [5/8] npm install + init БД"
sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && npm ci --omit=dev || npm install --omit=dev"
if [ ! -f "${APP_DIR}/alfa_tracker.db" ]; then
  sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && node database/init.js"
fi

echo "==> [6/8] pm2 (автозапуск + сохранение)"
sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && pm2 start server.js --name alfa-tracker --update-env || pm2 restart alfa-tracker"
sudo -u "${APP_USER}" bash -lc "pm2 save"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" | tail -n 1 | bash || true

echo "==> [7/8] nginx + firewall"
NGINX_CONF="/etc/nginx/sites-available/alfa-tracker"
sed "s/__DOMAIN__/${DOMAIN}/g" "${APP_DIR}/nginx.conf" > "${NGINX_CONF}"
ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/alfa-tracker
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

echo "==> [8/8] HTTPS через certbot (Let's Encrypt)"
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "${DOMAIN}" -m "${EMAIL}" --agree-tos --non-interactive --redirect || \
  echo "!! certbot не смог выпустить сертификат — проверь что DNS A-запись ${DOMAIN} указывает на этот сервер"

echo
echo "Готово. Открой: https://${DOMAIN}"
echo "Логи:   sudo -u ${APP_USER} pm2 logs alfa-tracker"
echo "Рестарт: sudo -u ${APP_USER} pm2 restart alfa-tracker"
