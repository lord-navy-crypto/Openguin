#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]

# User-facing branding only. Internal event names and legacy data keys remain
# stable so existing installations keep their settings, benchmarks and logs.
files = [
    root / "src" / "App07.tsx",
    root / "src" / "App.tsx",
    root / "src" / "Diagnostics.tsx",
    root / "src" / "SmartLab.tsx",
    root / "src" / "FullLogs.tsx",
    root / "README.md",
    root / "QUICKSTART.md",
    root / "CHANGELOG.md",
    root / "NOTICE.md",
    root / "COPYRIGHT.md",
    root / "CONTRIBUTING.md",
    root / "SECURITY.md",
    root / "docs" / "ENGINE_BEHAVIOR.md",
    root / "docs" / "MODEL_LICENSING.md",
]

for path in files:
    if not path.exists():
        continue
    text = path.read_text()
    # Product name. Keep Ollama references intact because Ollama is the third-party
    # runtime/API compatibility layer, not part of the Openguin brand.
    text = text.replace("ModelDock", "Openguin")
    text = text.replace("MODELDock", "OPENGUIN")
    # Main sidebar old single-letter badge.
    text = text.replace('<div className="v07-brand"><span>M</span><div>Openguin', '<div className="v07-brand"><span>P</span><div>Openguin')
    path.write_text(text)

print("Applied Openguin user-facing branding while preserving legacy internal keys/events.")
