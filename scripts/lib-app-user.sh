# Shared helpers for running npm as the app system user (sourced by install/deploy scripts).
# Requires: APP_DIR, SYSTEM_USER

ensure_app_dir_owned() {
  mkdir -p "${APP_DIR}/.cache/npm"
  if [[ -e "${APP_DIR}/.npm" ]]; then
    chown -R "${SYSTEM_USER}:${SYSTEM_USER}" "${APP_DIR}/.npm" 2>/dev/null || true
  fi
  chown -R "${SYSTEM_USER}:${SYSTEM_USER}" "${APP_DIR}/.cache" 2>/dev/null || true
  chown -R "${SYSTEM_USER}:${SYSTEM_USER}" "${APP_DIR}"
}

run_as_app_user() {
  ensure_app_dir_owned
  sudo -u "${SYSTEM_USER}" env \
    HOME="${APP_DIR}" \
    NPM_CONFIG_CACHE="${APP_DIR}/.cache/npm" \
    "$@"
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
