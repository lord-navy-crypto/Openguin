#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

printf '\nModelDock Desktop Build 0.6\n===========================\n'

# Rust is a build-time dependency only. End-user ModelDock.app/.dmg bundles do
# not ship rustc/cargo because the Rust code is compiled into the native app.
if ! command -v rustc >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then
  echo "Rust toolchain not found. Installing the official rustup toolchain for this build machine..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # rustup installs Cargo under ~/.cargo/bin; make it available immediately.
  if [ -f "$HOME/.cargo/env" ]; then
    # shellcheck disable=SC1090
    source "$HOME/.cargo/env"
  fi
fi

for cmd in node npm rustc cargo curl ditto python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing build dependency: $cmd"
    echo "This dependency is required only on the machine building ModelDock, not on end-user Macs."
    exit 1
  fi
done

# No separate Ollama installation is required on the build machine.
# prepare-ollama-sidecar.sh reuses an existing CLI when available or downloads
# the official macOS Ollama archive and extracts the runtime for Tauri bundling.
python3 scripts/verify-desktop.py
npm install
npm run desktop:build

echo
echo "Build complete. Check src-tauri/target/release/bundle/."
echo "End users of this bundle need neither Rust nor a separate Ollama installation."
