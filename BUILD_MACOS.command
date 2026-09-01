#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

printf '\nModelDock Desktop Build\n=======================\n'

for cmd in node npm rustc cargo; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing build dependency: $cmd"
    echo "This is required only on the machine building ModelDock, not on end-user Macs."
    exit 1
  fi
done

if ! command -v ollama >/dev/null 2>&1 && [ ! -x "/Applications/Ollama.app/Contents/Resources/ollama" ] && [ ! -x "/Applications/Ollama.app/Contents/MacOS/ollama" ]; then
  echo "Ollama CLI is not present on this BUILD machine."
  echo "Install the official Ollama build you intend to redistribute, then run again."
  exit 2
fi

python3 scripts/verify-desktop.py
npm install
npm run desktop:build

echo
echo "Build complete. Check src-tauri/target/release/bundle/."
