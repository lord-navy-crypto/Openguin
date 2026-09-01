#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

printf '\nModelDock 0.6 Development Launcher\n==================================\n'

missing=0
for cmd in node npm rustc cargo curl ditto; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing: $cmd"
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo
  echo "Install the missing development tools, then run this launcher again."
  echo "Ollama itself does NOT need to be installed separately."
  exit 1
fi

python3 scripts/verify-desktop.py

if [ ! -d node_modules ]; then
  echo "Installing Node dependencies..."
  npm install
fi

echo "Starting ModelDock..."
echo "The first run may download the official Ollama macOS archive to prepare the bundled sidecar."
npm run desktop:dev
