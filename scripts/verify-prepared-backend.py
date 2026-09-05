#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
lib = root / 'src-tauri/src/lib.rs'
errors: list[str] = []

if not lib.is_file():
    errors.append('missing src-tauri/src/lib.rs')
else:
    text = lib.read_text()
    start_marker = '.invoke_handler(tauri::generate_handler!['
    end_marker = ']).setup('
    start = text.find(start_marker)
    end = text.find(end_marker, start)
    if start == -1 or end == -1:
        errors.append('prepared lib.rs does not contain the expected Tauri generate_handler')
    else:
        body = text[start + len(start_marker):end]
        commands = {x.strip() for x in body.split(',') if x.strip()}
        required = {
            # Core runtime/model path
            'system_profile', 'runtime_discovery', 'start_bundled_ollama',
            'ollama_json', 'pull_model', 'cancel_pull',
            # v0.7/v0.10 production extensions
            'official_ollama_catalog', 'chat_stream',
            'universal_model_search', 'universal_model_variants', 'repair_bundled_runtime',
            # Persistent diagnostics / Full Logs
            'bundled_ollama_log', 'modeldock_backend_log',
            'append_modeldock_log', 'clear_diagnostic_log',
        }
        missing = sorted(required - commands)
        if missing:
            errors.append('prepared Tauri handler is missing commands: ' + ', '.join(missing))

if errors:
    print('OpenPenguin prepared-backend contract FAILED')
    for error in errors:
        print(f' - {error}')
    sys.exit(1)

print('OpenPenguin prepared-backend contract PASSED')
print(' - Runtime and model commands registered')
print(' - Global Library / runtime repair commands registered')
print(' - Full Logs diagnostics commands registered')
