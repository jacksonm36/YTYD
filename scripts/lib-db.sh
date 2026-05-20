#!/usr/bin/env bash
# PostgreSQL credential helpers — source from install/repair scripts (do not execute directly).
# Requires: node, psql. Optional: scripts/lib-env.sh for env_file_set.

_LIB_DB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-env.sh
[[ -f "${_LIB_DB_DIR}/lib-env.sh" ]] && . "${_LIB_DB_DIR}/lib-env.sh"

parse_database_url() {
  local dburl="$1"
  [[ -n "${dburl}" && -n "$(command -v node 2>/dev/null)" ]] || return 1
  DB_USER="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent(u.username||''))" "${dburl}")"
  DB_PASSWORD="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent(u.password||''))" "${dburl}")"
  DB_HOST="$(node -e "const u=new URL(process.argv[1]); console.log(u.hostname||'127.0.0.1')" "${dburl}")"
  DB_PORT="$(node -e "const u=new URL(process.argv[1]); console.log(u.port||'5432')" "${dburl}")"
  DB_NAME="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent((u.pathname||'/').slice(1).split('?')[0]||''))" "${dburl}")"
  [[ -n "${DB_USER}" && -n "${DB_PASSWORD}" && -n "${DB_NAME}" ]]
}

build_database_url() {
  node -e "
    const u = new URL('postgresql://127.0.0.1:5432/yaytd');
    u.username = process.argv[1];
    u.password = process.argv[2];
    u.hostname = process.argv[3];
    u.port = String(process.argv[4]);
    u.pathname = '/' + process.argv[5];
    u.searchParams.set('schema', 'public');
    console.log(u.toString());
  " "${DB_USER}" "${DB_PASSWORD}" "${DB_HOST}" "${DB_PORT}" "${DB_NAME}"
}

read_database_url_from_env() {
  local envfile="${1:?}"
  DATABASE_URL=""
  if declare -f env_file_get >/dev/null 2>&1; then
    DATABASE_URL="$(env_file_get DATABASE_URL "${envfile}")"
  else
    DATABASE_URL="$(grep -E '^DATABASE_URL=' "${envfile}" | head -1 | cut -d= -f2- | tr -d '"\r' || true)"
  fi
  [[ -n "${DATABASE_URL}" ]] || return 1
  parse_database_url "${DATABASE_URL}"
}

read_password_from_secrets() {
  local secrets="${1:?}"
  if declare -f env_file_get >/dev/null 2>&1; then
    env_file_get database_password "${secrets}"
    return
  fi
  grep -E '^database_password=' "${secrets}" | head -1 | cut -d= -f2- | tr -d '"\r' || true
}

apply_postgres_password() {
  local user="${1:?}" password="${2:?}"
  local sql_pw="${password//\'/\'\'}"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER \"${user}\" WITH PASSWORD '${sql_pw}';" 2>/dev/null \
    || sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER ${user} WITH PASSWORD '${sql_pw}';"
}

test_postgres_login() {
  local user="${1:?}" password="${2:?}" host="${3:-127.0.0.1}" port="${4:-5432}" db="${5:?}"
  PGPASSWORD="${password}" psql -h "${host}" -p "${port}" -U "${user}" -d "${db}" -w -c 'SELECT 1' >/dev/null 2>&1
}

write_database_url_to_env() {
  local envfile="${1:?}" dburl="${2:?}"
  if declare -f env_file_set >/dev/null 2>&1; then
    env_file_set DATABASE_URL "${dburl}" "${envfile}"
    return
  fi
  node -e "
    const fs = require('fs');
    const path = process.argv[1];
    const url = process.argv[2];
    const line = 'DATABASE_URL=' + JSON.stringify(url);
    let lines = [];
    try { lines = fs.readFileSync(path, 'utf8').split(/\n/); } catch (_) {}
    let found = false;
    const out = lines.map((l) => {
      if (l.startsWith('DATABASE_URL=')) { found = true; return line; }
      return l;
    });
    if (!found) out.push(line);
    fs.writeFileSync(path, out.join('\n').replace(/\n*$/, '\n'));
  " "${envfile}" "${dburl}"
}

sync_secrets_database_password() {
  local secrets="${1:?}" password="${2:?}"
  if declare -f env_file_set >/dev/null 2>&1; then
    env_file_set database_password "${password}" "${secrets}"
    return
  fi
  node -e "
    const fs = require('fs');
    const path = process.argv[1];
    const pw = process.argv[2];
    const line = 'database_password=' + JSON.stringify(pw);
    let lines = [];
    try { lines = fs.readFileSync(path, 'utf8').split(/\n/); } catch (_) {}
    let found = false;
    const out = lines.map((l) => {
      if (l.startsWith('database_password=')) { found = true; return line; }
      return l;
    });
    if (!found) out.push(line);
    fs.writeFileSync(path, out.join('\n').replace(/\n*$/, '\n'));
  " "${secrets}" "${password}"
}

# Align PostgreSQL with .env; if login fails, use .install-secrets and update .env.
ensure_db_credentials_synced() {
  local app_dir="${1:?}"
  local envfile="${app_dir}/.env"
  local secrets="${app_dir}/.install-secrets"

  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node is required for database URL handling" >&2
    return 1
  fi
  if ! command -v psql >/dev/null 2>&1; then
    echo "ERROR: psql client is required" >&2
    return 1
  fi
  if [[ ! -f "${envfile}" ]]; then
    echo "ERROR: missing ${envfile}" >&2
    return 1
  fi

  read_database_url_from_env "${envfile}" || {
    echo "ERROR: invalid DATABASE_URL in ${envfile}" >&2
    return 1
  }

  if test_postgres_login "${DB_USER}" "${DB_PASSWORD}" "${DB_HOST}" "${DB_PORT}" "${DB_NAME}"; then
    echo "OK: PostgreSQL accepts credentials from ${envfile}"
    return 0
  fi

  echo "WARN: ${envfile} credentials rejected — syncing from ${secrets}"

  if [[ ! -f "${secrets}" ]]; then
    echo "ERROR: missing ${secrets}. Run: sudo repair-db.sh --from-secrets" >&2
    return 1
  fi

  local secret_pw
  secret_pw="$(read_password_from_secrets "${secrets}")"
  if [[ -z "${secret_pw}" ]]; then
    echo "ERROR: database_password missing in ${secrets}" >&2
    return 1
  fi

  DB_PASSWORD="${secret_pw}"
  DATABASE_URL="$(build_database_url)"
  apply_postgres_password "${DB_USER}" "${secret_pw}"
  write_database_url_to_env "${envfile}" "${DATABASE_URL}"
  sync_secrets_database_password "${secrets}" "${secret_pw}"

  if test_postgres_login "${DB_USER}" "${secret_pw}" "${DB_HOST}" "${DB_PORT}" "${DB_NAME}"; then
    echo "OK: repaired DB auth (PostgreSQL + ${envfile} match ${secrets})"
    return 0
  fi

  echo "ERROR: repair failed — check DB_HOST/DB_NAME in ${envfile}" >&2
  return 1
}
