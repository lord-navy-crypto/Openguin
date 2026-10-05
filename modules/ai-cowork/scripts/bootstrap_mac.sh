#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/AI-cowork}"

if [[ ! -d "$ROOT/.git" ]]; then
  git clone https://github.com/lord-navy-crypto/AI-cowork.git "$ROOT"
fi

cd "$ROOT"

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

if [[ ! -f config.yaml ]]; then
  cp config.example.yaml config.yaml
fi

echo
echo "Bootstrap complete."
echo "Next:"
echo "  1. Open ChatGPT.app and Claude.app."
echo "  2. Open a dedicated DeepSeek browser window."
echo "  3. Grant Terminal Accessibility permission:"
echo "     System Settings -> Privacy & Security -> Accessibility"
echo "  4. Run:"
echo "     source .venv/bin/activate"
echo "     python main.py doctor"
