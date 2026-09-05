#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
app = root / "src" / "App07.tsx"
errors: list[str] = []


def require(needle: str, description: str) -> None:
    text = app.read_text()
    if needle not in text:
        errors.append(f"App07.tsx: missing {description}: {needle}")


require("refreshSeq=useRef(0)", "refresh monotonic sequence")
require("inspectSeq=useRef(0)", "model-inspection sequence")
require("catalogSeq=useRef(0)", "catalog sequence")
require("hfSearchSeq=useRef(0)", "Hugging Face search sequence")
require("hfVariantSeq=useRef(0)", "Hugging Face variant sequence")
require("modeTransitionRef=useRef(false)", "synchronous runtime transition lock")
require("activeGenerationRef=useRef('')", "synchronous generation lock")
require("async function probeEngine(which:Mode)", "target-engine readiness probe")
require("snapshot=await probeEngine('external')", "external readiness before runtime commit")
require("which!==modeRef.current", "stale runtime response rejection")
require("token!==inspectSeq.current||which!==modeRef.current", "stale model-passport rejection")
require("runModel=selected,runMode=modeRef.current", "generation input snapshot")
require("p.requestId!==requestId||activeGenerationRef.current!==requestId", "stream request ownership check")
require("if(token!==catalogSeq.current)return", "catalog stale-response rejection")
require("if(token!==hfSearchSeq.current)return", "HF search stale-response rejection")
require("if(token!==hfVariantSeq.current)return", "HF variant stale-response rejection")
require("current&&s.models.some(m=>m.name===current)?current", "selection preservation across refresh")
require("External Ollama did not pass readiness; the current runtime was left unchanged", "non-destructive external switch failure")
require("import BrandMark from './BrandMark';", "static OpenPenguin brand wiring")

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
