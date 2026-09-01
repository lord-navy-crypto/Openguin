#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT/src-tauri/binaries"
CACHE_DIR="${MODELDock_BUILD_CACHE:-$ROOT/.build-cache/ollama}"
mkdir -p "$BIN_DIR" "$CACHE_DIR"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) TRIPLE="aarch64-apple-darwin" ;;
  x86_64) TRIPLE="x86_64-apple-darwin" ;;
  *) echo "Unsupported macOS architecture: $ARCH" >&2; exit 1 ;;
esac

DEST="$BIN_DIR/ollama-modeldock-$TRIPLE"
SRC=""

# 1. Explicit build override.
if [ -n "${OLLAMA_BIN:-}" ] && [ -x "${OLLAMA_BIN}" ]; then
  SRC="$OLLAMA_BIN"
# 2. Reuse an installed build-machine Ollama if available.
elif command -v ollama >/dev/null 2>&1; then
  SRC="$(command -v ollama)"
elif [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
  SRC="/Applications/Ollama.app/Contents/Resources/ollama"
else
  # 3. Developer convenience: fetch the official macOS app archive at BUILD time.
  # The finished ModelDock app contains the extracted CLI sidecar; end users do not
  # need to install Ollama separately.
  ZIP="$CACHE_DIR/Ollama-darwin.zip"
  EXTRACT="$CACHE_DIR/extracted"
  URL="${OLLAMA_MACOS_ZIP_URL:-https://ollama.com/download/Ollama-darwin.zip}"
  echo "No local Ollama CLI found. Downloading official macOS Ollama archive for build-time sidecar preparation..."
  curl --fail --show-error --location --progress-bar -o "$ZIP" "$URL"
  rm -rf "$EXTRACT" && mkdir -p "$EXTRACT"
  ditto -x -k "$ZIP" "$EXTRACT"
  if [ -x "$EXTRACT/Ollama.app/Contents/Resources/ollama" ]; then
    SRC="$EXTRACT/Ollama.app/Contents/Resources/ollama"
  else
    echo "Downloaded archive did not contain the expected Ollama CLI." >&2
    exit 2
  fi
fi

cp "$SRC" "$DEST"
chmod +x "$DEST"

echo "Prepared bundled Ollama sidecar:"
echo "  source: $SRC"
echo "  target: $DEST"
"$DEST" --version || true

echo
echo "Release note: include THIRD_PARTY_NOTICES.md with distributed builds."
