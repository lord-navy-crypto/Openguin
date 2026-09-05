#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
errors: list[str] = []

app = root / "src" / "App07.tsx"
brand = root / "src" / "BrandMark.tsx"
css = root / "src" / "brand-mark.css"

if not app.is_file():
    errors.append("missing src/App07.tsx")
else:
    text = app.read_text()
    for token in [
        "OPENGUIN_011_STATIC_COMPOSITION",
        "Openguin",
        "import BrandMark from './BrandMark';",
        "openguin-brand-mark",
    ]:
        if token not in text:
            errors.append(f"src/App07.tsx missing brand/static token: {token}")

if not brand.is_file() or "import './brand-mark.css';" not in brand.read_text():
    errors.append("src/BrandMark.tsx must own/import its static brand styling")
if not css.is_file() or ".openguin-brand-mark{" not in css.read_text():
    errors.append("src/brand-mark.css missing .openguin-brand-mark styling")

# Only the production component tree and current docs are brand-gated here.
# Unmounted pre-0.11 legacy source may remain for migration/history, but it is
# not allowed to re-enter main.tsx/App07 without first passing this contract.
production_surfaces = [
    root / "src" / "main.tsx",
    root / "src" / "App07.tsx",
    root / "src" / "TaskCenter.tsx",
    root / "src" / "EngineeringControl011.tsx",
    root / "src" / "FullLogs.tsx",
    root / "src" / "Observatory.tsx",
    root / "src" / "RuntimeControl09.tsx",
    root / "src" / "CompareBench09.tsx",
    root / "src" / "MegaLibrary.tsx",
    root / "src" / "DeveloperStudio010.tsx",
    root / "src" / "RuntimeInstallerCard.tsx",
    root / "src" / "AdvancedSettings010.tsx",
]

current_docs = [
    root / "README.md",
    root / "QUICKSTART.md",
    root / "CHANGELOG.md",
    root / "NOTICE.md",
    root / "COPYRIGHT.md",
    root / "CONTRIBUTING.md",
    root / "SECURITY.md",
    root / "docs" / "ENGINE_BEHAVIOR.md",
    root / "docs" / "MODEL_LICENSING.md",
    root / "docs" / "ENGINEERING_0_11.md",
    root / "docs" / "SOURCE_OF_TRUTH.md",
]

for path in production_surfaces + current_docs:
    if not path.exists():
        continue
    text = path.read_text()
    if "ModelDock" in text or "MODELDock" in text:
        errors.append(f"{path.relative_to(root)} still contains user-facing legacy ModelDock branding")

main = (root / "src" / "main.tsx").read_text() if (root / "src" / "main.tsx").exists() else ""
if "./App'" in main or '"./App"' in main:
    errors.append("src/main.tsx must not mount the legacy pre-0.11 App component")

if errors:
    print("OpenPenguin 0.11 static branding verification FAILED")
    for error in errors:
        print(f" - {error}")
    sys.exit(1)

print("OpenPenguin 0.11 static branding verification PASSED")
print(" - Mounted production source is branded directly in Git")
print(" - BrandMark owns its checked-in styling")
print(" - Current product docs contain no legacy ModelDock branding")
print(" - Unmounted legacy source cannot re-enter the production tree silently")
print(" - No build-time rename/migration is required")
