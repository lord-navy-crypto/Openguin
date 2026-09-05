#!/usr/bin/env python3
"""OpenPenguin 0.11 physical-Mac release-gate harness.

This script automates only checks that can be verified without pretending to
replace interactive validation. It never modifies the app bundle or system.
Reports are written under ignored .build-cache/validation by default.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import plistlib
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REPORT = ROOT / ".build-cache" / "validation" / "physical-mac-validation011.json"
PRIVATE_BASE = "http://127.0.0.1:11435"
EXTERNAL_BASE = "http://127.0.0.1:11434"


@dataclass
class Check:
    id: str
    status: str
    detail: str
    evidence: Any = None


def run_text(*args: str) -> tuple[int, str]:
    try:
        p = subprocess.run(args, text=True, capture_output=True, timeout=15, check=False)
        return p.returncode, (p.stdout or p.stderr).strip()
    except Exception as exc:
        return 1, str(exc)


def http_json(base: str, path: str, timeout: float = 1.5) -> tuple[bool, Any]:
    try:
        req = urllib.request.Request(base + path, headers={"User-Agent": "OpenPenguin-0.11-validator"})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read(2_000_000)
        return True, json.loads(raw.decode("utf-8"))
    except Exception as exc:
        return False, str(exc)


def candidate_apps(explicit: str | None) -> list[Path]:
    values: list[Path] = []
    if explicit:
        values.append(Path(explicit).expanduser())
    if os.environ.get("OPENGUIN_APP"):
        values.append(Path(os.environ["OPENGUIN_APP"]).expanduser())
    values += [
        Path("/Applications/Openguin.app"),
        ROOT / "src-tauri/target/universal-apple-darwin/release/bundle/macos/Openguin.app",
        ROOT / "src-tauri/target/release/bundle/macos/Openguin.app",
    ]
    seen: set[str] = set()
    result: list[Path] = []
    for path in values:
        key = str(path.resolve()) if path.exists() else str(path)
        if key not in seen:
            seen.add(key);result.append(path)
    return result


def find_app(explicit: str | None) -> Path | None:
    return next((p for p in candidate_apps(explicit) if p.is_dir()), None)


def self_check() -> int:
    errors: list[str] = []
    if PRIVATE_BASE != "http://127.0.0.1:11435": errors.append("private endpoint changed")
    if EXTERNAL_BASE != "http://127.0.0.1:11434": errors.append("external endpoint changed")
    sample = Check("sample", "pass", "ok", {"a": 1})
    if asdict(sample)["status"] != "pass": errors.append("report serialization failed")
    if not str(DEFAULT_REPORT).endswith(".build-cache/validation/physical-mac-validation011.json"):
        errors.append("default report must remain under ignored .build-cache")
    if errors:
        print("OpenPenguin 0.11 physical-Mac harness self-check FAILED")
        for error in errors: print(" -", error)
        return 1
    print("OpenPenguin 0.11 physical-Mac harness self-check PASSED")
    print(" - read-only app/runtime inspection")
    print(" - private :11435 and external :11434 probes")
    print(" - report path is isolated under .build-cache/validation")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate an OpenPenguin 0.11 build on a physical Mac")
    parser.add_argument("--app", help="Path to Openguin.app; otherwise common install/build paths are searched")
    parser.add_argument("--output", default=str(DEFAULT_REPORT), help="JSON report destination")
    parser.add_argument("--require-private", action="store_true", help="Treat private runtime :11435 being offline as a failure")
    parser.add_argument("--self-check", action="store_true", help="Validate the harness itself without requiring macOS")
    args = parser.parse_args()
    if args.self_check: return self_check()

    checks: list[Check] = []
    def add(cid: str, status: str, detail: str, evidence: Any = None): checks.append(Check(cid, status, detail, evidence))

    if sys.platform != "darwin":
        add("platform", "fail", f"Physical-Mac validation requires macOS; current platform is {sys.platform}")
    else:
        add("platform", "pass", f"macOS {platform.mac_ver()[0] or 'unknown'} · {platform.machine()}")

    app = find_app(args.app)
    if not app:
        add("app_bundle", "fail", "Openguin.app not found", [str(p) for p in candidate_apps(args.app)])
    else:
        add("app_bundle", "pass", f"Found {app}")
        exe = app / "Contents/MacOS/Openguin"
        add("executable", "pass" if exe.is_file() and os.access(exe, os.X_OK) else "fail", str(exe))
        if exe.is_file():
            rc, archs = run_text("lipo", "-archs", str(exe))
            parts = set(archs.split()) if rc == 0 else set()
            add("universal2", "pass" if {"arm64", "x86_64"}.issubset(parts) else "fail", f"Architectures: {archs or 'unavailable'}")
        plist = app / "Contents/Info.plist"
        if plist.is_file():
            try:
                with plist.open("rb") as f: info = plistlib.load(f)
                add("bundle_identity", "pass" if info.get("CFBundleName") == "Openguin" or info.get("CFBundleDisplayName") == "Openguin" else "warn", "Bundle metadata", {"name": info.get("CFBundleName"), "displayName": info.get("CFBundleDisplayName"), "version": info.get("CFBundleShortVersionString")})
            except Exception as exc: add("bundle_identity", "warn", f"Could not parse Info.plist: {exc}")
        resource = app / "Contents/Resources/ollama-runtime"
        ollama = resource / "ollama"; runner = resource / "llama-server"
        add("private_runtime_resource", "pass" if ollama.is_file() and runner.is_file() else "fail", f"ollama={ollama.is_file()} llama-server={runner.is_file()}", str(resource))

    for label, base, required in [("private", PRIVATE_BASE, args.require_private), ("external", EXTERNAL_BASE, False)]:
        ok_version, version = http_json(base, "/api/version")
        ok_tags, tags = http_json(base, "/api/tags") if ok_version else (False, "version probe failed")
        ok_ps, ps = http_json(base, "/api/ps") if ok_version else (False, "version probe failed")
        status = "pass" if ok_version and ok_tags and ok_ps else "fail" if required else "warn"
        model_count = len(tags.get("models", [])) if isinstance(tags, dict) else None
        resident_count = len(ps.get("models", [])) if isinstance(ps, dict) else None
        add(f"{label}_runtime_api", status, f"{base} {'ready' if ok_version else 'offline/unavailable'}", {"version": version if ok_version else None, "installedModels": model_count, "residentModels": resident_count, "errors": None if ok_version else version})

    rc, processes = run_text("pgrep", "-fl", "ollama")
    add("ollama_process_inventory", "pass" if rc == 0 and processes else "warn", "Observed Ollama-related processes" if processes else "No Ollama process matched", processes.splitlines() if processes else [])

    output = Path(args.output).expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "openguin.physical-mac-validation.v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "app": str(app) if app else None,
        "requirePrivate": args.require_private,
        "summary": {"pass": sum(c.status == "pass" for c in checks), "warn": sum(c.status == "warn" for c in checks), "fail": sum(c.status == "fail" for c in checks)},
        "checks": [asdict(c) for c in checks],
        "manualStillRequired": [
            "runtime switching readiness/fallback behavior",
            "generation request ownership while controls change",
            "Task Center cancel/relaunch/stalled recovery",
            "Full Logs filtering/follow-tail behavior",
            "Observatory Runtime Control and cold/warm methodology",
            "Engineering Calibration Recorder dataset quality",
        ],
    }
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"OpenPenguin 0.11 physical-Mac report: {output}")
    for c in checks: print(f"[{c.status.upper():4}] {c.id}: {c.detail}")
    print(f"Summary: {report['summary']['pass']} pass · {report['summary']['warn']} warn · {report['summary']['fail']} fail")
    print("Manual interactive checks are still required; this harness does not mark Issue #3 complete by itself.")
    return 1 if report["summary"]["fail"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
