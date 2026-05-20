#!/usr/bin/env bash
exec "$(cd "$(dirname "$0")" && pwd)/scripts/upgrade-npm.sh" "$@"
