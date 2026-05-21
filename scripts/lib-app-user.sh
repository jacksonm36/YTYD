# Shared helpers for running npm as the app system user (sourced by install/deploy scripts).
# Requires: APP_DIR, SYSTEM_USER

ensure_app_dir_owned() {
  local owner="${RUN_AS_USER:-${SYSTEM_USER}}"
  mkdir -p "${APP_DIR}/.cache/npm"
  if [[ -e "${APP_DIR}/.npm" ]]; then
    chown -R "${owner}:${owner}" "${APP_DIR}/.npm" 2>/dev/null || true
  fi
  chown -R "${owner}:${owner}" "${APP_DIR}/.cache" 2>/dev/null || true
  if [[ "${DEV_INSTALL:-0}" == "1" || "${APP_DIR}" != /opt/* ]]; then
    chown -R "${owner}:${owner}" "${APP_DIR}" 2>/dev/null || true
  else
    chown -R "${SYSTEM_USER}:${SYSTEM_USER}" "${APP_DIR}" 2>/dev/null || true
  fi
}

# Use scripts under APP_DIR (readable by yaytd), not the root's home clone path.
resolve_script_lib_dir() {
  local app_dir="${1:?}"
  if [[ -f "${app_dir}/scripts/lib-env.sh" ]]; then
    echo "${app_dir}/scripts"
    return 0
  fi
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

run_as_app_user() {
  ensure_app_dir_owned
  local app_dir="${APP_DIR}"
  local user="${RUN_AS_USER:-${SYSTEM_USER}}"
  local lib_dir
  lib_dir="$(resolve_script_lib_dir "${app_dir}")"
  sudo -u "${user}" bash -c '
    set -euo pipefail
    lib_dir="$1"
    app_dir="$2"
    shift 2
    export HOME="${app_dir}"
    export NPM_CONFIG_CACHE="${app_dir}/.cache/npm"
    if [[ ! -r "${lib_dir}/lib-env.sh" ]]; then
      echo "ERROR: cannot read ${lib_dir}/lib-env.sh (run install/finish-install to sync /opt/yaytd/scripts)" >&2
      exit 1
    fi
    # shellcheck source=lib-env.sh
    . "${lib_dir}/lib-env.sh"
    if [[ -f "${app_dir}/.env" ]]; then
      load_env_exports "${app_dir}/.env"
    fi
    if [[ -f "${app_dir}/.env.development.local" ]]; then
      load_env_exports "${app_dir}/.env.development.local"
    fi
    cd "${app_dir}"
    exec "$@"
  ' _ "${lib_dir}" "${app_dir}" "$@"
}

# Fail early when package-lock.json predates package.json (common after partial git pull).
verify_package_lock() {
  local dir="${1:-${APP_DIR}}"
  if [[ ! -f "${dir}/package.json" || ! -f "${dir}/package-lock.json" ]]; then
    echo "ERROR: package.json or package-lock.json missing in ${dir}" >&2
    exit 1
  fi
  local pkg_spec lock_ver lock_major pkg_major
  pkg_spec="$(grep '"next":' "${dir}/package.json" | head -1 | sed -E 's/.*"next": "([^"]+)".*/\1/')"
  lock_ver="$(grep -A2 '"node_modules/next":' "${dir}/package-lock.json" | grep '"version":' | head -1 | sed -E 's/.*"version": "([^"]+)".*/\1/')"
  pkg_major="${pkg_spec#\^}"
  pkg_major="${pkg_major%%.*}"
  lock_major="${lock_ver%%.*}"
  if [[ -z "${lock_ver}" || "${lock_major}" != "${pkg_major}" ]]; then
    echo "ERROR: package-lock.json out of sync (package.json next ${pkg_spec}, lock has next@${lock_ver:-missing})." >&2
    echo "Run: git pull origin main   (requires commit 2919148 or newer)" >&2
    exit 1
  fi
}
