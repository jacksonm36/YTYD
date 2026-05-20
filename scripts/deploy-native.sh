#!/usr/bin/env bash
# Redeploy app only (assumes install.sh already ran). Run from project root.
set -euo pipefail

APP_DIR="${YAYTD_APP_DIR:-/opt/yaytd}"
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SYSTEM_USER="${YAYTD_USER:-yaytd}"
DATA_DIR="${YAYTD_DATA_DIR:-/var/lib/yaytd/downloads}"

# shellcheck source=lib-app-user.sh
. "$(cd "$(dirname "$0")" && pwd)/lib-app-user.sh"
# shellcheck source=lib-db.sh
. "$(cd "$(dirname "$0")" && pwd)/lib-db.sh"

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
chmod +x "${APP_DIR}/install.sh" "${APP_DIR}/repair-db.sh" "${APP_DIR}/upgrade-npm.sh" 2>/dev/null || true
chmod +x "${APP_DIR}"/scripts/*.sh 2>/dev/null || true
if [[ -f "${SOURCE_DIR}/.env" ]]; then
  cp "${SOURCE_DIR}/.env" "${APP_DIR}/.env"
elif [[ -f "${APP_DIR}/.env" ]]; then
  echo "Keeping existing ${APP_DIR}/.env"
else
  echo "ERROR: no .env in source or ${APP_DIR}" >&2
  exit 1
fi
chmod 600 "${APP_DIR}/.env"

verify_package_lock "${SOURCE_DIR}"

ensure_db_credentials_synced "${APP_DIR}" "${SOURCE_DIR}" || {
  echo "WARN: DB auth mismatch — run: sudo ${APP_DIR}/repair-db.sh --auto"
}

cd "${APP_DIR}"
ensure_app_dir_owned
run_as_app_user npm ci
run_as_app_user npm run build
ensure_app_dir_owned

cp "${APP_DIR}/deploy/yaytd.service" /etc/systemd/system/
cp "${APP_DIR}/deploy/yaytd-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl restart yaytd yaytd-worker

echo "Redeployed to ${APP_DIR}"
