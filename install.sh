#!/usr/bin/env bash
# YTYD / YAYTD — entrypoint for the full Linux installer (see scripts/install.sh).
exec "$(cd "$(dirname "$0")" && pwd)/scripts/install.sh" "$@"
