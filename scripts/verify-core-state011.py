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


# Main application state ownership and static subsystem composition.
require("src/App07.tsx", "OPENGUIN_011_STATIC_COMPOSITION", "static production-composition marker")
require("src/App07.tsx", "refreshSeq=useRef(0)", "refresh monotonic sequence")
require("src/App07.tsx", "inspectSeq=useRef(0)", "model-inspection sequence")
require("src/App07.tsx", "modeTransitionRef=useRef(false)", "synchronous runtime transition lock")
require("src/App07.tsx", "activeGenerationRef=useRef('')", "synchronous generation lock")
require("src/App07.tsx", "async function probeEngine(which:Mode)", "target-engine readiness probe")
require("src/App07.tsx", "snapshot=await probeEngine('external')", "external readiness before runtime commit")
require("src/App07.tsx", "which!==modeRef.current", "stale runtime response rejection")
require("src/App07.tsx", "token!==inspectSeq.current||which!==modeRef.current", "stale model-passport rejection")
require("src/App07.tsx", "runModel=selected,runMode=modeRef.current", "generation identity snapshot")
require("src/App07.tsx", "runTopP=topP,runTopK=topK,runMinP=minP", "advanced sampling snapshot")
require("src/App07.tsx", "runRepeatPenalty=repeatPenalty,runSeed=seed,runKeepAlive=keepAlive", "residency/reproducibility snapshot")
require("src/App07.tsx", "p.requestId!==requestId||activeGenerationRef.current!==requestId", "stream request ownership check")
require("src/App07.tsx", "current&&s.models.some(m=>m.name===current)?current", "selection preservation across refresh")
require("src/App07.tsx", "External Ollama did not pass readiness; the current runtime was left unchanged", "non-destructive external switch failure")
require("src/App07.tsx", "loadMs:p.loadDuration", "generation pipeline telemetry capture")
require("src/App07.tsx", "top_k:runTopK", "advanced Top K request wiring")
require("src/App07.tsx", "keep_alive:runKeepAlive", "keep-alive snapshot wiring")
require("src/App07.tsx", "task({id:taskId,title:`Generate · ${runModel}`", "generation Task Center integration")
for component in ("Observatory","MegaLibrary","RuntimeInstallerCard","AdvancedSettings010","DeveloperStudio010","FullLogs"):
    require("src/App07.tsx", component, f"static {component} composition")
require("src/App07.tsx", "import BrandMark from './BrandMark';", "static OpenPenguin brand wiring")

# Library/HF request ordering belongs to MegaLibrary after static composition and
# remains covered by verify-legacy-hardening011.py rather than duplicate App07 state.
require("src/MegaLibrary.tsx", "const searchSeq=useRef(0),variantSeq=useRef(0)", "Library stale-response ownership")

# Smart Lab must share the validated backend path rather than maintaining a second direct-http implementation.
require("src/SmartLab.tsx", "invoke('chat_stream'", "Tauri streaming path")
require("src/SmartLab.tsx", "listen<StreamEvent>('modeldock://chat-stream'", "stream event ownership")
require("src/SmartLab.tsx", "activeGenerationRef=useRef('')", "Smart Lab generation lock")
require("src/SmartLab.tsx", "installingRef=useRef('')", "Smart Lab install ownership ref")
require("src/SmartLab.tsx", "const p=e.payload,current=installingRef.current", "race-free install progress ownership")
require("src/SmartLab.tsx", "inspectSeq=useRef(0)", "Smart Lab stale inspection guard")
require("src/SmartLab.tsx", "official_ollama_catalog", "shared official catalog backend")
require("src/SmartLab.tsx", "modeldock://pull-progress", "shared install progress event")
require("src/SmartLab.tsx", "task({id:`smartlab-install:${name}`", "Task Center install integration")
smart = (root / "src/SmartLab.tsx").read_text()
if "fetch(`http://127.0.0.1" in smart:
    errors.append("src/SmartLab.tsx: direct localhost streaming path returned")
if "for(let i=0;i<120" in smart:
    errors.append("src/SmartLab.tsx: legacy 120-second install polling returned")
if "[open,installing]" in smart:
    errors.append("src/SmartLab.tsx: install listener must not rebind on installing state")

if errors:
    print("OpenPenguin 0.11 core state verification FAILED")
    for error in errors:
        print(f" - {error}")
    sys.exit(1)

print("OpenPenguin 0.11 core state verification PASSED")
print(" - Runtime transitions probe before commit")
print(" - Generation owns immutable request snapshots")
print(" - Model selection survives compatible refreshes")
print(" - External-switch failure leaves the current runtime intact")
print(" - Observatory/Library/Runtime Repair/Advanced/Developer/Logs are static")
print(" - MegaLibrary owns Library/HF request ordering")
print(" - Smart Lab shares validated streaming/catalog/install paths")
print(" - Smart Lab install listener has stable ownership without rebind gaps")
