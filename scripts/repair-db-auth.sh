#!/usr/bin/env bash
# Fix Prisma P1000 — align PostgreSQL with /opt/yaytd/.env and .install-secrets.
set -euo pipefail

APP_DIR="${YAYTD_APP_DIR:-/opt/yaytd}"
MODE="auto"
SOURCE_DIR=""

usage() {
  cat <<'EOF'
Fix database authentication (Prisma P1000).

  sudo ./repair-db.sh --auto              Repair (env → secrets → new password)
  sudo ./repair-db.sh --from-secrets      Force password from .install-secrets
  sudo ./repair-db.sh --from-env          Force password from .env into PostgreSQL
  sudo ./repair-db.sh --reset             New random DB password + .env + .install-secrets

  sudo ./repair-db.sh --app-dir /opt/yaytd
  sudo ./repair-db.sh --source-dir ~/YTYD   Also search clone for .install-secrets

Run from ~/YTYD (git clone) or /opt/yaytd after deploy.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto) MODE="auto" ;;
    --from-secrets) MODE="secrets" ;;
    --from-env) MODE="env" ;;
    --reset) MODE="reset" ;;
    --source-dir)
      SOURCE_DIR="${2:?}"
      shift
      ;;
    --app-dir)
      APP_DIR="${2:?}"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo ./repair-db.sh --auto"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -f "${SCRIPT_DIR}/lib-db.sh" ]]; then
  echo "ERROR: ${SCRIPT_DIR}/lib-db.sh not found."
  echo "  cd ~/YTYD && git pull origin main"
  exit 1
fi
# shellcheck source=lib-db.sh
. "${SCRIPT_DIR}/lib-db.sh"

ENV_FILE="${APP_DIR}/.env"
SECRETS_FILE="${APP_DIR}/.install-secrets"

echo "YAYTD database repair"
echo "  app dir: ${APP_DIR}"
echo "  mode:    ${MODE}"
echo ""

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found."
  echo "  Run install first, or: sudo ./repair-db.sh --app-dir /opt/yaytd"
  exit 1
fi

if [[ -z "${SOURCE_DIR}" && -d "$(dirname "${SCRIPT_DIR}")/.git" ]]; then
  SOURCE_DIR="$(cd "$(dirname "${SCRIPT_DIR}")" && pwd)"
fi

if [[ "${MODE}" == "auto" ]]; then
  ensure_db_credentials_synced "${APP_DIR}" "${SOURCE_DIR}"
  echo ""
  echo "Next:"
  echo "  cd ${APP_DIR} && sudo -u yaytd npm run db:migrate"
  echo "  cd ${APP_DIR} && sudo -u yaytd npm run db:seed-admin"
  exit 0
fi

if [[ "${MODE}" == "reset" ]]; then
  read_database_url_from_env "${ENV_FILE}" || exit 1
  reset_db_password_and_env "${APP_DIR}" || exit 1
  echo "OK — password reset. Save ${APP_DIR}/.install-secrets then delete it."
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is required"
  exit 1
fi

read_database_url_from_env "${ENV_FILE}" || {
  echo "ERROR: could not parse DATABASE_URL in ${ENV_FILE}"
  exit 1
}

if [[ "${MODE}" == "secrets" ]]; then
  SECRETS_FILE="$(find_install_secrets_file "${APP_DIR}" "${SOURCE_DIR}" 2>/dev/null || true)"
  [[ -n "${SECRETS_FILE}" && -f "${SECRETS_FILE}" ]] || {
    echo "ERROR: no .install-secrets in ${APP_DIR} or ${SOURCE_DIR:-clone}"
    echo "  Run: sudo ./repair-db.sh --reset"
    exit 1
  }
  DB_PASSWORD="$(read_password_from_secrets "${SECRETS_FILE}")"
  [[ -n "${DB_PASSWORD}" ]] || { echo "ERROR: database_password empty in secrets"; exit 1; }
  DATABASE_URL="$(build_database_url)"
  echo "Applying password from ${SECRETS_FILE} to role ${DB_USER}"
  apply_postgres_password "${DB_USER}" "${DB_PASSWORD}"
  write_database_url_to_env "${ENV_FILE}" "${DATABASE_URL}"
  sync_secrets_database_password "${SECRETS_FILE}" "${DB_PASSWORD}"
else
  echo "Applying password from ${ENV_FILE} to role ${DB_USER}"
  apply_postgres_password "${DB_USER}" "${DB_PASSWORD}"
  if [[ -f "${SECRETS_FILE}" ]]; then
    sync_secrets_database_password "${SECRETS_FILE}" "${DB_PASSWORD}"
  fi
fi

if test_postgres_login "${DB_USER}" "${DB_PASSWORD}" "${DB_HOST}" "${DB_PORT}" "${DB_NAME}"; then
  echo "OK — database login works"
else
  echo "FAILED — try: sudo ./repair-db.sh --from-secrets"
  exit 1
fi

echo ""
echo "Next: cd ${APP_DIR} && sudo -u yaytd npm run db:migrate && sudo -u yaytd npm run db:seed-admin"
