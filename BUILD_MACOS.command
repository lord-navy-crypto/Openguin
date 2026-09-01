#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
printf '\nOpenguin Desktop Build 0.10.0\n=============================\n'
if ! command -v rustc >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then
  echo "Rust toolchain not found. Installing the official rustup toolchain for this build machine..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  [ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
fi
for cmd in node npm rustc cargo curl ditto python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then echo "Missing build dependency: $cmd"; exit 1; fi
done
python3 scripts/apply-build-fixes.py
python3 scripts/apply-full-logs.py
python3 scripts/apply-observatory.py
python3 scripts/apply-performance09.py
python3 scripts/apply-task-center.py
python3 scripts/apply-expansion010.py
python3 scripts/apply-openguin-brand.py
python3 scripts/ensure-app-icon.py
python3 scripts/verify-desktop.py
npm install
npm run desktop:build
printf '\nBuild complete. Check src-tauri/target/release/bundle/.\n'
printf 'The generated app is Openguin.app with Global Library, runtime repair, Observatory, and Task Center enabled.\n'
