#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
errors: list[str] = []

app = root / "src" / "App07.tsx"
css = root / "src" / "app07.css"

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

if not css.is_file() or ".openguin-brand-mark{" not in css.read_text():
    errors.append("src/app07.css missing .openguin-brand-mark styling")

# These are current product/docs surfaces. Legacy migration scripts may remain in
# scripts/, but production source and docs must not rely on build-time renaming.
current_surfaces = [
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
    root / "docs" / "ENGINEERING_0_11.md",
]

for path in current_surfaces:
    if not path.exists():
        continue
    text = path.read_text()
    if "ModelDock" in text or "MODELDock" in text:
        errors.append(f"{path.relative_to(root)} still contains legacy ModelDock branding")

if errors:
    print("OpenPenguin 0.11 static branding verification FAILED")
    for error in errors:
        print(f" - {error}")
    sys.exit(1)

print("OpenPenguin 0.11 static branding verification PASSED")
print(" - Product source is branded directly in Git")
print(" - Current docs contain no legacy ModelDock branding")
print(" - No build-time rename/migration is required")
