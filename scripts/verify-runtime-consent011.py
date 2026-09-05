#!/usr/bin/env python3
from pathlib import Path
import json, sys

ROOT=Path(__file__).resolve().parents[1]
errors=[]

def require(cond,msg):
    if not cond: errors.append(msg)

pkg=json.loads((ROOT/'package.json').read_text())
conf=json.loads((ROOT/'src-tauri/tauri.conf.json').read_text())
installer=(ROOT/'src/RuntimeInstallerCard.tsx').read_text()
engine=(ROOT/'docs/ENGINE_BEHAVIOR.md').read_text() if (ROOT/'docs/ENGINE_BEHAVIOR.md').exists() else ''
source=(ROOT/'docs/SOURCE_OF_TRUTH.md').read_text() if (ROOT/'docs/SOURCE_OF_TRUTH.md').exists() else ''

prepare=pkg.get('scripts',{}).get('desktop:prepare','')
resources=conf.get('bundle',{}).get('resources',{}) or {}

require('prepare-ollama-sidecar.sh' not in prepare,'desktop:prepare must not download or assemble private Ollama')
require('ensure-app-icon.py' in prepare,'desktop:prepare must retain deterministic icon preparation')
require('resources/ollama-runtime/' not in resources,'default Tauri bundle must not embed private Ollama runtime')
require('prepare:private-runtime:manual' in pkg.get('scripts',{}),'manual developer runtime preparation must be explicit')
require("confirm(`OpenPenguin will ${action}" in installer,'Runtime Installer must ask for explicit confirmation')
require('Download Ollama (optional)' in installer,'Runtime Installer must label the download as optional')
require('never downloads or installs this private runtime on first launch' in installer,'Runtime Installer must disclose first-launch behavior')
require("invoke<string>('repair_bundled_runtime')" in installer,'Explicitly approved flow must still reach runtime repair backend')
require('not bundled into the OpenPenguin DMG' in installer,'Installer must disclose that the DMG excludes private runtime')
require('opt-in' in engine.lower() and 'does not contain' in engine.lower(),'Runtime behavior docs must describe opt-in, non-bundled runtime')
require('private ollama runtime' in source.lower() and 'not' in source.lower(),'Source-of-truth docs must document non-automatic private runtime preparation')

if errors:
    print('OpenPenguin runtime-consent verification FAILED')
    for e in errors: print(' -',e)
    sys.exit(1)

print('OpenPenguin runtime-consent verification PASSED')
print(' - default DMG does not contain private Ollama runtime')
print(' - desktop:prepare does not download private Ollama')
print(' - runtime download/repair is explicit and confirmed')
print(' - manual developer sidecar preparation remains opt-in')
