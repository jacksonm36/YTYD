# npm upgrade + permission repair (sourced by install.sh and scripts/upgrade-npm.sh).

upgrade_system_npm() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "upgrade_system_npm: run as root" >&2
    return 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm not found — install Node.js first" >&2
    return 1
  fi

  local before after
  before="$(npm -v 2>/dev/null || echo unknown)"
  echo "npm before upgrade: ${before}"

  # Must run as root — global install touches /usr/lib/node_modules/npm
  npm install -g npm@latest

  hash -r 2>/dev/null || true
  after="$(npm -v 2>/dev/null || echo unknown)"
  echo "npm upgraded: ${before} -> ${after}"
}

repair_npm_permissions() {
  local app_dir="${1:-${YAYTD_APP_DIR:-/opt/yaytd}}"
  local user="${2:-${YAYTD_USER:-yaytd}}"

  if [[ "$(id -u)" -ne 0 ]]; then
    echo "repair_npm_permissions: run as root" >&2
    return 1
  fi

  if ! id "${user}" &>/dev/null; then
    echo "WARN: User ${user} does not exist — skipping permission repair"
    return 0
  fi

  mkdir -p "${app_dir}/.cache/npm"
  if [[ -e "${app_dir}/.npm" ]]; then
    chown -R "${user}:${user}" "${app_dir}/.npm"
  fi
  chown -R "${user}:${user}" "${app_dir}/.cache" 2>/dev/null || true
  if [[ -d "${app_dir}" ]]; then
    chown -R "${user}:${user}" "${app_dir}"
  fi
  echo "OK: npm cache ownership — ${user} owns ${app_dir} (.npm, .cache/npm)"
}

test_npm_project() {
  local app_dir="${1:-${YAYTD_APP_DIR:-/opt/yaytd}}"
  local user="${2:-${YAYTD_USER:-yaytd}}"

  if [[ ! -f "${app_dir}/package.json" ]]; then
    echo "WARN: No package.json in ${app_dir} — skip npm test"
    return 0
  fi

  echo "==> npm ci (smoke test)"
  # shellcheck source=lib-app-user.sh
  APP_DIR="${app_dir}"
  SYSTEM_USER="${user}"
  . "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-app-user.sh"
  verify_package_lock "${app_dir}"
  run_as_app_user npm ci
  run_as_app_user npx prisma generate
  echo "OK: npm ci + prisma generate succeeded"
}
