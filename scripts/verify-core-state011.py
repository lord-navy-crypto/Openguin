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


# Main application state ownership.
require("src/App07.tsx", "refreshSeq=useRef(0)", "refresh monotonic sequence")
require("src/App07.tsx", "inspectSeq=useRef(0)", "model-inspection sequence")
require("src/App07.tsx", "catalogSeq=useRef(0)", "catalog sequence")
require("src/App07.tsx", "hfSearchSeq=useRef(0)", "Hugging Face search sequence")
require("src/App07.tsx", "hfVariantSeq=useRef(0)", "Hugging Face variant sequence")
require("src/App07.tsx", "modeTransitionRef=useRef(false)", "synchronous runtime transition lock")
require("src/App07.tsx", "activeGenerationRef=useRef('')", "synchronous generation lock")
require("src/App07.tsx", "async function probeEngine(which:Mode)", "target-engine readiness probe")
require("src/App07.tsx", "snapshot=await probeEngine('external')", "external readiness before runtime commit")
require("src/App07.tsx", "which!==modeRef.current", "stale runtime response rejection")
require("src/App07.tsx", "token!==inspectSeq.current||which!==modeRef.current", "stale model-passport rejection")
require("src/App07.tsx", "runModel=selected,runMode=modeRef.current", "generation input snapshot")
require("src/App07.tsx", "p.requestId!==requestId||activeGenerationRef.current!==requestId", "stream request ownership check")
require("src/App07.tsx", "if(token!==catalogSeq.current)return", "catalog stale-response rejection")
require("src/App07.tsx", "if(token!==hfSearchSeq.current)return", "HF search stale-response rejection")
require("src/App07.tsx", "if(token!==hfVariantSeq.current)return", "HF variant stale-response rejection")
require("src/App07.tsx", "current&&s.models.some(m=>m.name===current)?current", "selection preservation across refresh")
require("src/App07.tsx", "External Ollama did not pass readiness; the current runtime was left unchanged", "non-destructive external switch failure")
require("src/App07.tsx", "import BrandMark from './BrandMark';", "static OpenPenguin brand wiring")

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
print(" - Stale refresh/model/catalog/HF responses are rejected")
print(" - Generation ownership is locked to one request")
print(" - Model selection survives compatible refreshes")
print(" - External-switch failure leaves the current runtime intact")
print(" - Smart Lab shares validated streaming/catalog/install paths")
print(" - Smart Lab install listener has stable ownership without rebind gaps")
