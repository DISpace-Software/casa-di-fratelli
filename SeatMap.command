#!/bin/zsh
# Double-click on macOS, or run from any working directory.
cd -- "$(dirname -- "$0")" || exit 1
exec python3 tools/dev-hub/server.py --open
