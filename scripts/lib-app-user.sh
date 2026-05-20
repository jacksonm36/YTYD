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
