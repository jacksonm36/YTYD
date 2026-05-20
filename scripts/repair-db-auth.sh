#!/usr/bin/env bash
# Fix P1000: align PostgreSQL with /opt/yaytd/.env (or .install-secrets).
set -euo pipefail

APP_DIR="${YAYTD_APP_DIR:-/opt/yaytd}"
ENV_FILE="${APP_DIR}/.env"
SECRETS_FILE="${APP_DIR}/.install-secrets"
MODE="env"

usage() {
  cat <<EOF
Fix database authentication (Prisma P1000).

  sudo ./scripts/repair-db-auth.sh              # set Postgres password from .env
  sudo ./scripts/repair-db-auth.sh --from-secrets   # use .install-secrets, update .env too
  sudo ./scripts/repair-db-auth.sh --auto         # test .env; if fail, use .install-secrets

EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-secrets) MODE="secrets" ;;
    --auto) MODE="auto" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/repair-db-auth.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib-db.sh
. "${SCRIPT_DIR}/lib-db.sh"

if [[ "${MODE}" == "auto" ]]; then
  ensure_db_credentials_synced "${APP_DIR}"
  echo ""
  echo "Next: sudo -u yaytd env HOME=${APP_DIR} NPM_CONFIG_CACHE=${APP_DIR}/.cache/npm npm run db:migrate --prefix ${APP_DIR}"
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required"
  exit 1
fi

if [[ "${MODE}" == "secrets" ]]; then
  [[ -f "${SECRETS_FILE}" ]] || { echo "Missing ${SECRETS_FILE}"; exit 1; }
  [[ -f "${ENV_FILE}" ]] || { echo "Missing ${ENV_FILE}"; exit 1; }
  read_database_url_from_env "${ENV_FILE}"
  DB_PASSWORD="$(read_password_from_secrets "${SECRETS_FILE}")"
  [[ -n "${DB_PASSWORD}" ]] || { echo "database_password empty in secrets"; exit 1; }
  if declare -f build_database_url >/dev/null 2>&1; then
    DATABASE_URL="$(build_database_url)"
  else
    DATABASE_URL="$(node -e "const u=new URL(process.argv[1]); u.password=process.argv[2]; console.log(u.toString())" "${DATABASE_URL}" "${DB_PASSWORD}")"
  fi
  echo "Applying password from ${SECRETS_FILE} to PostgreSQL role ${DB_USER}"
  apply_postgres_password "${DB_USER}" "${DB_PASSWORD}"
  write_database_url_to_env "${ENV_FILE}" "${DATABASE_URL}"
else
  [[ -f "${ENV_FILE}" ]] || { echo "Missing ${ENV_FILE}"; exit 1; }
  read_database_url_from_env "${ENV_FILE}"
  echo "Applying PostgreSQL password for role ${DB_USER} from ${ENV_FILE}"
  apply_postgres_password "${DB_USER}" "${DB_PASSWORD}"
  if [[ -f "${SECRETS_FILE}" ]]; then
    sed -i "s/^database_password=.*/database_password=\"${DB_PASSWORD}\"/" "${SECRETS_FILE}" 2>/dev/null || true
  fi
fi

if test_postgres_login "${DB_USER}" "${DB_PASSWORD}" "${DB_HOST}" "${DB_PORT}" "${DB_NAME}"; then
  echo "OK — database login works"
else
  echo "FAILED — try: sudo ./scripts/repair-db-auth.sh --from-secrets"
  exit 1
fi

echo ""
echo "Run: sudo -u yaytd env HOME=${APP_DIR} NPM_CONFIG_CACHE=${APP_DIR}/.cache/npm npm run db:migrate --prefix ${APP_DIR}"
