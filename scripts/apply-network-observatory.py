#!/usr/bin/env python3
"""Register all native Tauri commands after the repository's patch-based prepare steps.

The project intentionally applies several legacy compatibility scripts before a desktop
build. Their handler-list replacements use exact historical strings, so this final
idempotent pass reconciles the handler list without removing existing commands.
"""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
lib = root / "src-tauri" / "src" / "lib.rs"
text = lib.read_text()

if "mod network_diagnostics;" not in text:
    marker = "use tokio_util::io::ReaderStream;"
    if marker not in text:
        raise SystemExit("Cannot register network diagnostics: expected Rust module anchor is missing.")
    text = text.replace(marker, marker + "\n\nmod network_diagnostics;", 1)

required = [
    "official_ollama_catalog",
    "chat_stream",
    "universal_model_search",
    "universal_model_variants",
    "repair_bundled_runtime",
    "bundled_ollama_log",
    "modeldock_backend_log",
    "append_modeldock_log",
    "clear_diagnostic_log",
    "network_diagnostics::run_network_diagnostics",
    "network_diagnostics::run_network_speed_test",
]

match = re.search(r"(tauri::generate_handler!\[)(.*?)(\])", text, flags=re.S)
if not match:
    raise SystemExit("Cannot register native commands: tauri::generate_handler![...] was not found.")

existing = [item.strip() for item in match.group(2).split(",") if item.strip()]
for command in required:
    if command not in existing:
        existing.append(command)

replacement = match.group(1) + ",".join(existing) + match.group(3)
text = text[:match.start()] + replacement + text[match.end():]
lib.write_text(text)
print("Reconciled Tauri command registration, including network diagnostics (idempotent).")
