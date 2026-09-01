#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT/src-tauri/binaries"
mkdir -p "$BIN_DIR"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) TRIPLE="aarch64-apple-darwin" ;;
  x86_64) TRIPLE="x86_64-apple-darwin" ;;
  *) echo "Unsupported macOS architecture: $ARCH" >&2; exit 1 ;;
esac

if command -v ollama >/dev/null 2>&1; then
  SRC="$(command -v ollama)"
elif [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
  SRC="/Applications/Ollama.app/Contents/Resources/ollama"
elif [ -x "/Applications/Ollama.app/Contents/MacOS/ollama" ]; then
  SRC="/Applications/Ollama.app/Contents/MacOS/ollama"
else
  cat >&2 <<'MSG'
Ollama CLI was not found on this build machine.
Install the official Ollama app/CLI on the BUILD machine, then run this script again.
End users of the finished ModelDock app will not need a separate Ollama installation.
MSG
  exit 2
fi

DEST="$BIN_DIR/ollama-modeldock-$TRIPLE"
cp "$SRC" "$DEST"
chmod +x "$DEST"

echo "Prepared bundled Ollama sidecar:"
echo "  source: $SRC"
echo "  target: $DEST"
"$DEST" --version || true
