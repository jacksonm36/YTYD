#!/usr/bin/env bash
# Upgrade system npm to latest (root) and repair /opt/yaytd cache permissions.
set -euo pipefail

APP_DIR="${YAYTD_APP_DIR:-/opt/yaytd}"
SYSTEM_USER="${YAYTD_USER:-yaytd}"
RUN_TEST=1

usage() {
  cat <<'EOF'
Upgrade npm globally and repair YAYTD npm permissions.

  sudo ./scripts/upgrade-npm.sh              # upgrade + repair + npm ci test
  sudo ./scripts/upgrade-npm.sh --no-test    # upgrade + repair only

Do not run "npm install -g npm" as a normal user (EACCES on /usr/lib/node_modules).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-test) RUN_TEST=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/upgrade-npm.sh"
  exit 1
fi

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
dim() { printf '\033[2m%s\033[0m\n' "$*"; }
ok() { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib-npm.sh
. "${SCRIPT_DIR}/lib-npm.sh"

bold "YAYTD — npm upgrade and repair"
echo "  node: $(node -v 2>/dev/null || echo missing)"
echo "  app:  ${APP_DIR}"
echo ""

upgrade_system_npm
repair_npm_permissions "${APP_DIR}" "${SYSTEM_USER}"

if [[ "${RUN_TEST}" -eq 1 && -f "${APP_DIR}/package.json" ]]; then
  test_npm_project "${APP_DIR}" "${SYSTEM_USER}"
else
  dim "Skipped npm ci test (--no-test or no ${APP_DIR}/package.json)"
fi

echo ""
ok "Done — npm $(npm -v), node $(node -v)"
