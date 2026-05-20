#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET="${ROOT}/scripts/repair-db-auth.sh"
if [[ ! -f "${TARGET}" ]]; then
  echo "ERROR: missing ${TARGET}" >&2
  echo "Run: cd ~/YTYD && git pull origin main" >&2
  exit 1
fi
exec bash "${TARGET}" "$@"
