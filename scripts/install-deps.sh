#!/usr/bin/env bash
# Deprecated — use scripts/install.sh for full setup.
echo "Use: sudo ./scripts/install.sh"
exec "$(dirname "$0")/install.sh" "$@"
