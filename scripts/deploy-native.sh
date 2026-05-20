#!/usr/bin/env bash
# Redeploy app only (assumes install.sh already ran). Run from project root.
set -euo pipefail

APP_DIR="${YAYTD_APP_DIR:-/opt/yaytd}"
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SYSTEM_USER="${YAYTD_USER:-yaytd}"
DATA_DIR="${YAYTD_DATA_DIR:-/var/lib/yaytd/downloads}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/deploy-native.sh"
  exit 1
fi

if [[ ! -f "${SOURCE_DIR}/.env" ]]; then
  echo "Create ${SOURCE_DIR}/.env from .env.example first."
  exit 1
fi

mkdir -p "${APP_DIR}" "${DATA_DIR}"
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git \
  "${SOURCE_DIR}/" "${APP_DIR}/"
cp "${SOURCE_DIR}/.env" "${APP_DIR}/.env"
chown "${SYSTEM_USER}:${SYSTEM_USER}" "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"

cd "${APP_DIR}"
sudo -u "${SYSTEM_USER}" npm ci
sudo -u "${SYSTEM_USER}" npm run build
chown -R "${SYSTEM_USER}:${SYSTEM_USER}" "${APP_DIR}" "${DATA_DIR}"

cp "${APP_DIR}/deploy/yaytd.service" /etc/systemd/system/
cp "${APP_DIR}/deploy/yaytd-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl restart yaytd yaytd-worker

echo "Redeployed to ${APP_DIR}"
