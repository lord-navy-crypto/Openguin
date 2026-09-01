#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

printf '\nModelDock Desktop Build 0.6\n===========================\n'

for cmd in node npm rustc cargo curl ditto; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing build dependency: $cmd"
    echo "This is required only on the machine building ModelDock, not on end-user Macs."
    exit 1
  fi
done

# No separate Ollama installation is required on the build machine anymore.
# prepare-ollama-sidecar.sh reuses an existing CLI when available or downloads
# the official macOS archive at build time and extracts the CLI sidecar.
python3 scripts/verify-desktop.py
npm install
npm run desktop:build

echo
echo "Build complete. Check src-tauri/target/release/bundle/."
echo "End users of this bundle do not need a separate Ollama installation."
