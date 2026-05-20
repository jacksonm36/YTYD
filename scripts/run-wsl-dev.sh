#!/usr/bin/env bash
# Start Redis worker + Next.js dev server on Debian WSL.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use default 2>/dev/null || nvm use node 2>/dev/null || nvm use 20
fi

mkdir -p /tmp/yaytd-downloads

if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example and set DATABASE_URL."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing npm dependencies…"
  npm ci 2>/dev/null || npm install
fi

# Load REDIS_URL from .env if present
if [[ -f .env ]] && grep -q '^REDIS_URL=' .env; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

echo "Running database migrations…"
npx prisma migrate deploy

WORKER_PID=""
cleanup() {
  if [[ -n "$WORKER_PID" ]]; then
    kill "$WORKER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if command -v redis-cli >/dev/null 2>&1 && redis-cli ping 2>/dev/null | grep -q PONG; then
  export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
  echo "Redis OK — starting download worker (REDIS_URL=$REDIS_URL)"
  npm run worker &
  WORKER_PID=$!
  sleep 1
else
  echo "WARNING: Redis not running. Jobs run in-process only (limited parallelism)."
  echo "  Install: sudo apt install redis-server && sudo service redis-server start"
fi

echo ""
echo "Starting dev server at http://localhost:3000"
echo "Hungarian UI: http://localhost:3000/hu"
echo "Run worker separately: npm run worker"
echo "Or both: npm run dev:all"
echo ""
npm run dev -- --hostname 0.0.0.0 --port 3000
