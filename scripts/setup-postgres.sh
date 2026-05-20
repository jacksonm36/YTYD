#!/usr/bin/env bash
# Create PostgreSQL role/database for YAYTD (standalone step).
set -euo pipefail

DB_NAME="${YAYTD_DB_NAME:-yaytd}"
DB_USER="${YAYTD_DB_USER:-yaytd}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo YAYTD_DB_PASSWORD='...' ./scripts/setup-postgres.sh"
  exit 1
fi

if [[ -z "${YAYTD_DB_PASSWORD:-}" ]]; then
  read -rsp "PostgreSQL password for user '${DB_USER}': " YAYTD_DB_PASSWORD
  echo
  read -rsp "Confirm password: " YAYTD_DB_PASSWORD_CONFIRM
  echo
  if [[ "${YAYTD_DB_PASSWORD}" != "${YAYTD_DB_PASSWORD_CONFIRM}" ]]; then
    echo "Passwords do not match."
    exit 1
  fi
fi

SQL_PASSWORD="${YAYTD_DB_PASSWORD//\'/\'\'}"

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${SQL_PASSWORD}';"
else
  sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${SQL_PASSWORD}';"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
fi

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

echo "DATABASE_URL=\"postgresql://${DB_USER}:<password>@127.0.0.1:5432/${DB_NAME}?schema=public\""
