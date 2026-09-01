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
    root / "src" / "MegaLibrary.tsx",
    root / "src" / "DeveloperStudio010.tsx",
    root / "src" / "RuntimeInstallerCard.tsx",
    root / "src" / "AdvancedSettings010.tsx",
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
    for old in ["Desktop Alpha 0.7","Desktop Alpha 0.8","Desktop Alpha 0.9","Desktop Alpha 0.9.1","Desktop Alpha 0.10"]:
        text = text.replace(old, "Desktop Alpha 0.10.1")
    path.write_text(text)

app = root / "src" / "App07.tsx"
if app.exists():
    text = app.read_text()
    if "import BrandMark from './BrandMark';" not in text:
        text = text.replace("import './app07.css';", "import './app07.css';\nimport BrandMark from './BrandMark';")
    text = text.replace('<div className="v07-brand"><span>M</span><div>Openguin', '<div className="v07-brand"><span className="openguin-brand-mark"><BrandMark size={34}/></span><div>Openguin')
    text = text.replace('<div className="v07-brand"><span>P</span><div>Openguin', '<div className="v07-brand"><span className="openguin-brand-mark"><BrandMark size={34}/></span><div>Openguin')
    app.write_text(text)

css = root / "src" / "app07.css"
if css.exists():
    text = css.read_text()
    if ".openguin-brand-mark{" not in text:
        text += "\n.openguin-brand-mark{display:grid!important;place-items:center!important;width:38px!important;height:38px!important;border-radius:11px!important;background:#fff!important;color:#0c0c0e!important;padding:3px!important;overflow:hidden}.openguin-brand-mark svg{display:block;width:32px;height:32px}\n"
    css.write_text(text)

print("Applied Openguin 0.10.1 Alpha branding and wired the black/white penguin mark into the main UI.")
