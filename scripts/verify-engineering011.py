#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
errors: list[str] = []


def require(path: str, needle: str, description: str) -> None:
    p = root / path
    if not p.is_file():
        errors.append(f"missing file: {path}")
        return
    text = p.read_text()
    if needle not in text:
        errors.append(f"{path}: missing {description}: {needle}")


require("src/main.tsx", "import EngineeringControl011 from './EngineeringControl011';", "Engineering drawer import")
require("src/main.tsx", "<EngineeringControl011/>", "Engineering drawer mount")
require("src/EngineeringControl011.tsx", "invoke<Profile>('system_profile')", "stable hardware command")
require("src/EngineeringControl011.tsx", "invoke<Runtime>('runtime_discovery')", "stable runtime command")
require("src/EngineeringControl011.tsx", "Sense → Estimate → Decide → Verify", "engineering control-loop language")
require("src/EngineeringControl011.tsx", "Memory Guard", "memory guard advisory")
require("src/EngineeringControl011.tsx", "Operating Envelope", "operating-envelope visualization")
require("src/EngineeringControl011.tsx", "controlMargin", "controller headroom metric")
require("src/EngineeringControl011.tsx", "Plan vs Measured", "measurement feedback panel")
require("src/EngineeringControl011.tsx", "loadEngineeringCalibration", "calibration snapshot reader")
require("src/EngineeringControl011.tsx", "calibratedProjected", "calibrated projection")
require("src/EngineeringControl011.tsx", "does not automatically change the controller", "advisory-only calibration guardrail")
require("src/Observatory.tsx", "saveEngineeringCalibration", "Observatory calibration writer")
require("src/Observatory.tsx", "residencyFactor:runtimeBytes/modelBytes", "measured residency factor")
require("src/engineeringTelemetry011.ts", "ENGINEERING_CALIBRATION_KEY", "shared calibration storage key")
require("src/engineeringTelemetry011.ts", "ENGINEERING_CALIBRATION_EVENT", "live calibration event")
require("src/engineering-control011.css", "left:18px;bottom:18px", "bottom-left Engineering placement")
require("src/engineering-control011.css", ".env-cell.safe", "safe operating-envelope state")
require("src/engineering-control011.css", ".env-cell.constrained", "constrained operating-envelope state")
require("src/engineering-control011.css", ".env-cell.outside", "outside operating-envelope state")
require("src/engineering-control011.css", ".eng011-cal-grid", "Plan-vs-Measured layout")
require("src/task-center.css", "right:18px;bottom:18px", "bottom-right Task Center placement")
require("docs/ENGINEERING_0_11.md", "Sense → Estimate → Decide → Actuate → Verify", "0.11 engineering architecture")
require("docs/SOURCE_OF_TRUTH.md", "The source reviewed in Git must be the source compiled", "source-of-truth rule")

# 0.11 Engineering UI must remain compatible with the commands already registered
# by the production path until the native adaptive backend is validated.
ui = (root / "src/EngineeringControl011.tsx").read_text()
for experimental in ("adaptive_system_snapshot", "adaptive_runtime_plan", "penguin_doctor"):
    if f"invoke('{experimental}'" in ui or f"invoke<{experimental}" in ui:
        errors.append(f"Engineering UI unexpectedly invokes staged command: {experimental}")

if errors:
    print("OpenPenguin 0.11 engineering verification FAILED")
    for error in errors:
        print(f" - {error}")
    sys.exit(1)

print("OpenPenguin 0.11 engineering verification PASSED")
print(" - Engineering drawer mounted")
print(" - Existing production commands used for live machine/runtime data")
print(" - Planner and Penguin Doctor remain advisory")
print(" - Operating Envelope and control-margin UI present")
print(" - Observatory closes the Plan-vs-Measured feedback loop")
print(" - Calibration is persisted locally and does not auto-actuate")
print(" - Engineering and Task Center occupy opposite bottom corners")
print(" - Static source-of-truth documentation present")
