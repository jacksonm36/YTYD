#!/usr/bin/env bash
# Complete a partial install: sync code, repair DB, migrate, seed, systemd.
set -euo pipefail

APP_DIR="${YAYTD_APP_DIR:-/opt/yaytd}"
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SYSTEM_USER="${YAYTD_USER:-yaytd}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo ./finish-install.sh  (from ~/YTYD clone)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib-app-user.sh
. "${SCRIPT_DIR}/lib-app-user.sh"
# shellcheck source=lib-db.sh
. "${SCRIPT_DIR}/lib-db.sh"
# shellcheck source=lib-npm.sh
. "${SCRIPT_DIR}/lib-npm.sh"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '\033[32m✓\033[0m %s\n' "$*"; }

echo "YAYTD — finish install"
echo "  source: ${SOURCE_DIR}"
echo "  app:    ${APP_DIR}"
echo ""

bold "==> Sync application (preserve .env)"
rsync -a \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude data \
  --exclude .env \
  --exclude .install-secrets \
  --exclude .env.development.local \
  --exclude .env.local \
  --exclude '.env.*.local' \
  "${SOURCE_DIR}/" "${APP_DIR}/"
# shellcheck source=lib-install-env.sh
. "${SCRIPT_DIR}/lib-install-env.sh"
strip_production_dev_env_files
chmod +x "${APP_DIR}/install.sh" "${APP_DIR}/repair-db.sh" "${APP_DIR}/upgrade-npm.sh" \
  "${APP_DIR}/finish-install.sh" 2>/dev/null || true
if [[ -d "${APP_DIR}/scripts" ]]; then
  chmod -R a+rX "${APP_DIR}/scripts"
  chmod +x "${APP_DIR}"/scripts/*.sh 2>/dev/null || true
fi
repair_npm_permissions "${APP_DIR}" "${SYSTEM_USER}"
ok "Synced to ${APP_DIR}"

bold "==> Upgrade npm (optional)"
upgrade_system_npm || echo "WARN: npm upgrade skipped"

bold "==> Repair database credentials"
ensure_db_credentials_synced "${APP_DIR}" "${SOURCE_DIR}"

bold "==> npm ci"
cd "${APP_DIR}"
run_as_app_user npm ci

bold "==> Migrate and seed"
run_as_app_user npm run db:migrate
# shellcheck source=lib-env.sh
. "${SCRIPT_DIR}/lib-env.sh"
ADMIN_DEFAULT_PASSWORD="admin"
secrets="$(find_install_secrets_file "${APP_DIR}" "${SOURCE_DIR}" 2>/dev/null || true)"
if [[ -n "${secrets}" ]]; then
  pw="$(env_file_get admin_password "${secrets}" || true)"
  [[ -n "${pw}" ]] && ADMIN_DEFAULT_PASSWORD="${pw}"
fi
ADMIN_DEFAULT_PASSWORD="${ADMIN_DEFAULT_PASSWORD}" run_as_app_user npm run db:seed-admin
ok "Database ready"

bold "==> Systemd services"
if [[ -f "${APP_DIR}/deploy/yaytd.service" ]]; then
  cp "${APP_DIR}/deploy/yaytd.service" /etc/systemd/system/
  cp "${APP_DIR}/deploy/yaytd-worker.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable yaytd.service yaytd-worker.service 2>/dev/null || true
  systemctl restart yaytd.service yaytd-worker.service 2>/dev/null \
    || systemctl start yaytd.service yaytd-worker.service
  sleep 2
  if systemctl is-active --quiet yaytd.service; then
    ok "yaytd.service running"
  else
    echo "WARN: yaytd.service not active — journalctl -u yaytd -n 40"
  fi
else
  echo "WARN: missing deploy/*.service"
fi

echo ""
echo "Done."
echo "  Admin: see ${APP_DIR}/.install-secrets (if present)"
echo "  URL:   grep APP_URL ${APP_DIR}/.env"
