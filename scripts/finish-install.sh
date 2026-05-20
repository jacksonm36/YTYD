#!/usr/bin/env bash
# Complete a partial install: repair DB, migrate, seed admin, start systemd.
set -euo pipefail

APP_DIR="${YAYTD_APP_DIR:-/opt/yaytd}"
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/finish-install.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib-app-user.sh
. "${SCRIPT_DIR}/lib-app-user.sh"
# shellcheck source=lib-db.sh
. "${SCRIPT_DIR}/lib-db.sh"

SYSTEM_USER="${YAYTD_USER:-yaytd}"
APP_DIR="${APP_DIR}"

echo "YAYTD — finish install at ${APP_DIR}"

if [[ -f "${SOURCE_DIR}/repair-db.sh" ]]; then
  bash "${SOURCE_DIR}/repair-db.sh" --auto --app-dir "${APP_DIR}"
elif [[ -f "${SCRIPT_DIR}/repair-db-auth.sh" ]]; then
  bash "${SCRIPT_DIR}/repair-db-auth.sh" --auto --app-dir "${APP_DIR}"
else
  ensure_db_credentials_synced "${APP_DIR}"
fi

cd "${APP_DIR}"
run_as_app_user npm run db:migrate
# shellcheck source=lib-env.sh
. "${SCRIPT_DIR}/lib-env.sh"
ADMIN_DEFAULT_PASSWORD="admin"
if [[ -f "${APP_DIR}/.install-secrets" ]]; then
  pw="$(env_file_get admin_password "${APP_DIR}/.install-secrets" || true)"
  [[ -n "${pw}" ]] && ADMIN_DEFAULT_PASSWORD="${pw}"
fi
ADMIN_DEFAULT_PASSWORD="${ADMIN_DEFAULT_PASSWORD}" run_as_app_user npm run db:seed-admin

if [[ -f "${APP_DIR}/deploy/yaytd.service" ]]; then
  cp "${APP_DIR}/deploy/yaytd.service" /etc/systemd/system/
  cp "${APP_DIR}/deploy/yaytd-worker.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable yaytd.service yaytd-worker.service 2>/dev/null || true
  systemctl restart yaytd.service yaytd-worker.service 2>/dev/null \
    || systemctl start yaytd.service yaytd-worker.service
  echo "OK: systemd services installed and started"
else
  echo "WARN: deploy/*.service missing — run: sudo ./install.sh --services-only"
fi

echo "Done. Check: systemctl status yaytd yaytd-worker"
