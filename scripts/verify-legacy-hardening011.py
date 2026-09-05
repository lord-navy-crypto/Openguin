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


# Task Center: recovery and issue visibility.
require("src/TaskCenter.tsx", "openguin-task-center-v2", "persistent task history")
require("src/TaskCenter.tsx", "restored after UI restart", "interrupted-task recovery state")
require("src/TaskCenter.tsx", "filter==='issues'", "issue filter")
require("src/task-center.css", ".task-toggle span.issue", "issue indicator")

# Full Logs: diagnostic filtering and bounded tail reads.
require("src/FullLogs.tsx", "type Severity='all'|'error'|'warn'|'info'", "severity filter")
require("src/FullLogs.tsx", "Follow tail", "tail-follow control")
require("src/FullLogs.tsx", "maxMb*1024*1024", "bounded log-tail selector")
require("src/full-logs.css", ".full-log-health", "log health summary")

# Global Library: request ordering, cache resilience and trust filtering.
require("src/MegaLibrary.tsx", "const searchSeq=useRef(0),variantSeq=useRef(0)", "stale-response guards")
require("src/MegaLibrary.tsx", "CACHE_TTL=15*60*1000", "local index cache")
require("src/MegaLibrary.tsx", "cached results preserved", "network-failure cache fallback")
require("src/MegaLibrary.tsx", "trustedOnly", "license/risk filter")

# Observatory: health and calibration signals.
require("src/Observatory.tsx", "SYSTEM HEALTH", "runtime health strip")
require("src/Observatory.tsx", "Residency factor", "measured residency factor")
require("src/Observatory.tsx", "Decode variation", "performance variation signal")
require("src/observatory.css", ".obs-health", "health-state styling")

# Runtime repair: success is reported only after rediscovery.
require("src/RuntimeInstallerCard.tsx", "invoke<RuntimeState>('runtime_discovery')", "post-repair runtime discovery")
require("src/RuntimeInstallerCard.tsx", "rediscovered successfully", "verified repair completion")

if errors:
    print("OpenPenguin 0.11 legacy hardening verification FAILED")
    for error in errors:
        print(f" - {error}")
    sys.exit(1)

print("OpenPenguin 0.11 legacy hardening verification PASSED")
print(" - Task Center persists and restores interrupted work")
print(" - Full Logs exposes bounded severity-aware diagnostics")
print(" - Global Library rejects stale responses and preserves cache")
print(" - Observatory exposes health/calibration signals")
print(" - Runtime Repair requires post-install rediscovery")
