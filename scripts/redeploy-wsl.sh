#!/usr/bin/env bash
# Redeploy YAYTD on WSL — copies to ~/yaytd (Linux FS) to avoid /mnt/d npm EACCES.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${YAYTD_WSL_DIR:-$HOME/yaytd}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }

bold "YAYTD — WSL redeploy"
echo "Source: ${SRC}"
echo "Target: ${DEST} (Linux filesystem — avoids /mnt/d npm errors)"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "${NVM_DIR}/nvm.sh"
  nvm use default 2>/dev/null || nvm use node 2>/dev/null || true
fi

mkdir -p "${DEST}"
shopt -s dotglob nullglob
for item in "${SRC}"/*; do
  base="$(basename "$item")"
  case "$base" in
    node_modules|.next|.git) continue ;;
  esac
  cp -a "$item" "${DEST}/"
done
[[ -f "${SRC}/.env" ]] && cp "${SRC}/.env" "${DEST}/.env"
[[ -f "${SRC}/.env.example" && ! -f "${DEST}/.env" ]] && cp "${SRC}/.env.example" "${DEST}/.env"
# Windows-edited .env often has CRLF — breaks YTDLP_PATH / REDIS_URL in Node
if [[ -f "${DEST}/.env" ]]; then
  sed -i 's/\r$//' "${DEST}/.env"
fi

grep -q '^APP_URL=' "${DEST}/.env" 2>/dev/null || echo 'APP_URL="http://localhost:3000"' >> "${DEST}/.env"
grep -q '^NEXT_PUBLIC_APP_URL=' "${DEST}/.env" 2>/dev/null || echo 'NEXT_PUBLIC_APP_URL="http://localhost:3000"' >> "${DEST}/.env"
sed -i 's|/tmp/fater-downloads|/tmp/yaytd-downloads|g' "${DEST}/.env" 2>/dev/null || true
mkdir -p /tmp/yaytd-downloads

cd "${DEST}"
bold "==> npm install"
npm install

bold "==> Prisma migrate"
npx prisma generate
npx prisma migrate deploy

bold "==> Seed admin"
npm run db:seed-admin

if redis-cli ping 2>/dev/null | grep -q PONG; then
  ok "Redis running"
else
  warn "Start Redis: sudo service redis-server start"
fi

bold "==> Restart dev (port 3000)"
fuser -k 3000/tcp 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 1

set -a && source .env && set +a
export NODE_ENV=development
nohup npm run dev -- --hostname 0.0.0.0 --port 3000 > /tmp/yaytd-dev.log 2>&1 &
sleep 6
if curl -sf -o /dev/null http://127.0.0.1:3000/hu; then
  ok "Dev server: http://localhost:3000/hu"
else
  warn "Server not ready — check: tail -f /tmp/yaytd-dev.log"
fi

pkill -f "tsx scripts/worker" 2>/dev/null || true
nohup npm run worker > /tmp/yaytd-worker.log 2>&1 &
ok "Worker log: /tmp/yaytd-worker.log"

echo ""
echo "  Admin: admin / admin"
echo "  Project: ${DEST}"
echo "  Logs:    tail -f /tmp/yaytd-dev.log"
