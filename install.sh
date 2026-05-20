#!/usr/bin/env bash
# Yet Another YouTube Downloader (YAYTD) — installer entrypoint (see scripts/install.sh).
exec "$(cd "$(dirname "$0")" && pwd)/scripts/install.sh" "$@"
