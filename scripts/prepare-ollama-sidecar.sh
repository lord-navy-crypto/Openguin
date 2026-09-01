#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT/src-tauri/resources/ollama-runtime"
CACHE_DIR="${MODELDock_BUILD_CACHE:-$ROOT/.build-cache/ollama}"
mkdir -p "$CACHE_DIR" "$(dirname "$RUNTIME_DIR")"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Bundled Ollama preparation currently supports macOS builds only." >&2
  exit 1
fi

SOURCE_DIR=""

# A complete Ollama runtime is required on modern macOS. The CLI alone is not
# sufficient because Ollama also launches llama-server and may load dylibs from
# the same Resources directory.
if [ -n "${OLLAMA_RUNTIME_DIR:-}" ] && [ -x "${OLLAMA_RUNTIME_DIR}/ollama" ]; then
  SOURCE_DIR="$OLLAMA_RUNTIME_DIR"
elif [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
  SOURCE_DIR="/Applications/Ollama.app/Contents/Resources"
elif [ -x "$HOME/Applications/Ollama.app/Contents/Resources/ollama" ]; then
  SOURCE_DIR="$HOME/Applications/Ollama.app/Contents/Resources"
else
  ZIP="$CACHE_DIR/Ollama-darwin.zip"
  EXTRACT="$CACHE_DIR/extracted"
  URL="${OLLAMA_MACOS_ZIP_URL:-https://ollama.com/download/Ollama-darwin.zip}"
  echo "No complete local Ollama.app runtime found. Downloading the official macOS archive..."
  curl --fail --show-error --location --progress-bar -o "$ZIP" "$URL"
  rm -rf "$EXTRACT" && mkdir -p "$EXTRACT"
  ditto -x -k "$ZIP" "$EXTRACT"
  if [ -x "$EXTRACT/Ollama.app/Contents/Resources/ollama" ]; then
    SOURCE_DIR="$EXTRACT/Ollama.app/Contents/Resources"
  else
    echo "Downloaded archive did not contain Ollama.app/Contents/Resources/ollama." >&2
    exit 2
  fi
fi

rm -rf "$RUNTIME_DIR"
mkdir -p "$RUNTIME_DIR"
ditto "$SOURCE_DIR" "$RUNTIME_DIR"
chmod +x "$RUNTIME_DIR/ollama"
[ ! -f "$RUNTIME_DIR/llama-server" ] || chmod +x "$RUNTIME_DIR/llama-server"

if [ ! -x "$RUNTIME_DIR/llama-server" ]; then
  echo "Prepared runtime is incomplete: llama-server is missing." >&2
  echo "ModelDock intentionally refuses CLI-only Ollama bundles because recent Ollama versions require companion runners." >&2
  exit 3
fi

echo "Prepared complete bundled Ollama runtime:"
echo "  source: $SOURCE_DIR"
echo "  target: $RUNTIME_DIR"
echo "  ollama: $($RUNTIME_DIR/ollama --version 2>&1 | head -n 1 || true)"
echo "  runner: $RUNTIME_DIR/llama-server"
echo "  files: $(find "$RUNTIME_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ')"

echo
echo "Release note: include THIRD_PARTY_NOTICES.md with distributed builds."
