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

  local before after major
  before="$(npm -v 2>/dev/null || echo unknown)"
  major="${before%%.*}"
  echo "npm before upgrade: ${before}"

  if [[ "${major}" =~ ^[0-9]+$ && "${major}" -ge 11 ]]; then
    echo "npm ${before} already meets project minimum (>=11)"
    return 0
  fi

  if npm install -g npm@latest 2>/dev/null; then
    hash -r 2>/dev/null || true
    after="$(npm -v 2>/dev/null || echo unknown)"
    echo "npm upgraded: ${before} -> ${after}"
    return 0
  fi

  echo "WARN: npm install -g npm@latest failed — trying install.sh"
  if curl -fsSL https://www.npmjs.com/install.sh | bash; then
    hash -r 2>/dev/null || true
    after="$(npm -v 2>/dev/null || echo unknown)"
    echo "npm upgraded (install.sh): ${before} -> ${after}"
    if npm -v >/dev/null 2>&1; then
      return 0
    fi
    echo "WARN: npm install.sh finished but npm is not runnable" >&2
  fi

  echo "WARN: repairing Node.js npm package (apt reinstall)"
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get install -y --reinstall nodejs 2>/dev/null || true
  fi

  hash -r 2>/dev/null || true
  if npm install -g npm@latest 2>/dev/null; then
    after="$(npm -v 2>/dev/null || echo unknown)"
    echo "npm upgraded after nodejs reinstall: ${before} -> ${after}"
    return 0
  fi

  after="$(npm -v 2>/dev/null || echo unknown)"
  if ! npm -v >/dev/null 2>&1; then
    echo "ERROR: npm is broken after upgrade. Repair with:" >&2
    echo "  curl -fsSL https://www.npmjs.com/install.sh | sudo bash" >&2
    return 1
  fi
  echo "WARN: using existing npm ${after} (global upgrade skipped — app installs still work)"
  return 0
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
  if [[ -d "${app_dir}/scripts" ]]; then
    chmod -R a+rX "${app_dir}/scripts" 2>/dev/null || true
    chmod +x "${app_dir}"/scripts/*.sh 2>/dev/null || true
  fi
  if [[ -e "${app_dir}/.npm" ]]; then
    chown -R "${user}:${user}" "${app_dir}/.npm"
  fi
  chown -R "${user}:${user}" "${app_dir}/.cache" 2>/dev/null || true
  if [[ -d "${app_dir}" && "${app_dir}" == /opt/* ]]; then
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
  APP_DIR="${app_dir}"
  SYSTEM_USER="${user}"
  RUN_AS_USER="${user}"
  # shellcheck source=lib-app-user.sh
  . "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-app-user.sh"
  verify_package_lock "${app_dir}"
  run_as_app_user npm ci
  run_as_app_user npx prisma generate
  echo "OK: npm ci + prisma generate succeeded"
}
