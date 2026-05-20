# PostgreSQL credential helpers (sourced by install.sh and repair-db-auth.sh).
# Requires: node, psql, and optionally build_database_url from install.sh

read_database_url_from_env() {
  local envfile="${1:?}"
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "${envfile}" | head -1 | cut -d= -f2- | tr -d '"\r' || true)"
  [[ -n "${DATABASE_URL}" ]] || return 1
  DB_USER="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent(u.username||''))" "${DATABASE_URL}")"
  DB_PASSWORD="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent(u.password||''))" "${DATABASE_URL}")"
  DB_HOST="$(node -e "const u=new URL(process.argv[1]); console.log(u.hostname)" "${DATABASE_URL}")"
  DB_PORT="$(node -e "const u=new URL(process.argv[1]); console.log(u.port||'5432')" "${DATABASE_URL}")"
  DB_NAME="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent((u.pathname||'/').slice(1).split('?')[0]||''))" "${DATABASE_URL}")"
  [[ -n "${DB_USER}" && -n "${DB_PASSWORD}" && -n "${DB_NAME}" ]]
}

read_password_from_secrets() {
  local secrets="${1:?}"
  grep -E '^database_password=' "${secrets}" | head -1 | cut -d= -f2- | tr -d '"\r' || true
}

apply_postgres_password() {
  local user="${1:?}" password="${2:?}"
  local sql_pw="${password//\'/\'\'}"
  sudo -u postgres psql -c "ALTER USER ${user} WITH PASSWORD '${sql_pw}';"
}

test_postgres_login() {
  local user="${1:?}" password="${2:?}" host="${3:-127.0.0.1}" port="${4:-5432}" db="${5:?}"
  PGPASSWORD="${password}" psql -h "${host}" -p "${port}" -U "${user}" -d "${db}" -c 'SELECT 1' >/dev/null 2>&1
}

write_database_url_to_env() {
  local envfile="${1:?}" dburl="${2:?}"
  if grep -q '^DATABASE_URL=' "${envfile}"; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${dburl}\"|" "${envfile}"
  else
    echo "DATABASE_URL=\"${dburl}\"" >> "${envfile}"
  fi
}

# Try .env credentials; on failure align Postgres + .env from .install-secrets.
ensure_db_credentials_synced() {
  local app_dir="${1:?}"
  local envfile="${app_dir}/.env"
  local secrets="${app_dir}/.install-secrets"

  command -v node >/dev/null 2>&1 || return 1
  command -v psql >/dev/null 2>&1 || return 1
  [[ -f "${envfile}" ]] || return 1

  read_database_url_from_env "${envfile}" || return 1

  if test_postgres_login "${DB_USER}" "${DB_PASSWORD}" "${DB_HOST}" "${DB_PORT}" "${DB_NAME}"; then
    echo "OK: PostgreSQL accepts credentials from ${envfile}"
    return 0
  fi

  echo "WARN: ${envfile} credentials rejected (P1000) — attempting repair from .install-secrets"

  if [[ ! -f "${secrets}" ]]; then
    echo "ERROR: No ${secrets}. Run: sudo ./scripts/repair-db-auth.sh" >&2
    return 1
  fi

  local secret_pw
  secret_pw="$(read_password_from_secrets "${secrets}")"
  if [[ -z "${secret_pw}" ]]; then
    echo "ERROR: database_password missing in ${secrets}" >&2
    return 1
  fi

  if declare -f build_database_url >/dev/null 2>&1; then
    DB_PASSWORD="${secret_pw}"
    DATABASE_URL="$(build_database_url)"
  else
    # repair-db-auth.sh / minimal context: patch password in URL only
    DATABASE_URL="$(node -e "
      const u = new URL(process.argv[1]);
      u.password = process.argv[2];
      console.log(u.toString());
    " "${DATABASE_URL}" "${secret_pw}")"
  fi

  apply_postgres_password "${DB_USER}" "${secret_pw}"
  write_database_url_to_env "${envfile}" "${DATABASE_URL}"

  if test_postgres_login "${DB_USER}" "${secret_pw}" "${DB_HOST}" "${DB_PORT}" "${DB_NAME}"; then
    echo "OK: Repaired DB auth (PostgreSQL + ${envfile} now match .install-secrets)"
    sed -i "s/^database_password=.*/database_password=\"${secret_pw}\"/" "${secrets}" 2>/dev/null || true
    return 0
  fi

  echo "ERROR: Repair failed. Try: sudo ./scripts/repair-db-auth.sh --from-secrets" >&2
  return 1
}
