#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

printf '\nOpenguin 0.9 Development Launcher\n==================================\n'

missing=0
for cmd in node npm rustc cargo curl ditto python3; do
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

python3 scripts/apply-build-fixes.py
python3 scripts/apply-full-logs.py
python3 scripts/apply-observatory.py
python3 scripts/apply-performance09.py
python3 scripts/apply-openguin-brand.py
python3 scripts/ensure-app-icon.py
python3 scripts/verify-desktop.py

if [ ! -d node_modules ]; then
  echo "Installing Node dependencies..."
  npm install
fi

echo "Starting Openguin 0.9..."
echo "The first run may download the official Ollama macOS archive for the bundled runtime."
npm run desktop:dev
