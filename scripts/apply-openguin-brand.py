#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]

files = [
    root / "src" / "App07.tsx",
    root / "src" / "App.tsx",
    root / "src" / "Diagnostics.tsx",
    root / "src" / "SmartLab.tsx",
    root / "src" / "FullLogs.tsx",
    root / "src" / "Observatory.tsx",
    root / "src" / "RuntimeControl09.tsx",
    root / "src" / "CompareBench09.tsx",
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
    text = text.replace("ModelDock", "Openguin")
    text = text.replace("MODELDock", "OPENGUIN")
    text = text.replace("Desktop Alpha 0.7", "Desktop Alpha 0.9.1")
    text = text.replace("Desktop Alpha 0.8", "Desktop Alpha 0.9.1")
    text = text.replace("Desktop Alpha 0.9", "Desktop Alpha 0.9.1")
    path.write_text(text)

# Wire the real penguin mark into the main sidebar instead of a letter badge.
app = root / "src" / "App07.tsx"
if app.exists():
    text = app.read_text()
    if "import BrandMark from './BrandMark';" not in text:
        text = text.replace("import './app07.css';", "import './app07.css';\nimport BrandMark from './BrandMark';")
    text = text.replace('<div className="v07-brand"><span>M</span><div>Openguin', '<div className="v07-brand"><span className="openguin-brand-mark"><BrandMark size={34}/></span><div>Openguin')
    text = text.replace('<div className="v07-brand"><span>P</span><div>Openguin', '<div className="v07-brand"><span className="openguin-brand-mark"><BrandMark size={34}/></span><div>Openguin')
    app.write_text(text)

print("Applied Openguin 0.9.1 branding and wired the penguin brand mark into the main UI.")
