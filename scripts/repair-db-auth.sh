#!/usr/bin/env bash
# Sync PostgreSQL yaytd role password with /opt/yaytd/.env (fixes P1000 after redeploy).
set -euo pipefail

APP_DIR="${YAYTD_APP_DIR:-/opt/yaytd}"
ENV_FILE="${APP_DIR}/.env"
SECRETS_FILE="${APP_DIR}/.install-secrets"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/repair-db-auth.sh"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to parse DATABASE_URL"
  exit 1
fi

dburl="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | head -1 | cut -d= -f2- | tr -d '"\r')"
if [[ -z "${dburl}" ]]; then
  echo "DATABASE_URL not found in ${ENV_FILE}"
  exit 1
fi

DB_USER="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent(u.username||''))" "${dburl}")"
DB_PASSWORD="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent(u.password||''))" "${dburl}")"

if [[ -z "${DB_USER}" || -z "${DB_PASSWORD}" ]]; then
  echo "Could not parse database user/password from DATABASE_URL"
  exit 1
fi

echo "Applying PostgreSQL password for role: ${DB_USER}"
sql_pw="${DB_PASSWORD//\'/\'\'}"
sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${sql_pw}';"

if [[ -f "${SECRETS_FILE}" ]]; then
  sed -i "s/^database_password=.*/database_password=\"${DB_PASSWORD}\"/" "${SECRETS_FILE}" 2>/dev/null || true
fi

echo "Testing connection..."
if sudo -u postgres psql -d "$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent((u.pathname||'/').slice(1).split('?')[0]))" "${dburl}")" -U "${DB_USER}" -h 127.0.0.1 -c 'SELECT 1' >/dev/null 2>&1; then
  echo "OK — database credentials match ${ENV_FILE}"
else
  echo "Password applied. If test failed, check DB host/port in DATABASE_URL."
fi

echo "Run: cd ${APP_DIR} && sudo -u yaytd npm run db:migrate"
