#!/usr/bin/env python3
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[1]
lib = root / 'src-tauri/src/lib.rs'
errors: list[str] = []

if not lib.is_file():
    errors.append('missing src-tauri/src/lib.rs')
else:
    text = lib.read_text()
    match = re.search(r'\.invoke_handler\(tauri::generate_handler!\[(.*?)\]\)\s*\.setup\(', text, flags=re.S)
    if not match:
        errors.append('lib.rs does not contain a parseable Tauri generate_handler followed by setup')
    else:
        body = match.group(1)
        commands = {x.strip() for x in body.split(',') if x.strip()}
        required = {
            # Core runtime/model path
            'system_profile', 'bundled_engine_info', 'external_engine_info',
            'runtime_discovery', 'start_bundled_ollama', 'stop_bundled_ollama',
            'ollama_json', 'pull_model', 'cancel_pull',
            'search_huggingface', 'list_hf_gguf_variants', 'import_hf_gguf', 'cancel_hf_import',
            # v0.7/v0.10 production extensions
            'official_ollama_catalog', 'chat_stream',
            'universal_model_search', 'universal_model_variants', 'repair_bundled_runtime',
            # Persistent diagnostics / Full Logs
            'bundled_ollama_log', 'modeldock_backend_log',
            'append_modeldock_log', 'clear_diagnostic_log',
        }
        missing = sorted(required - commands)
        if missing:
            errors.append('Tauri handler is missing commands: ' + ', '.join(missing))
        if 'OPENGUIN_011_STATIC_RUST_COMPOSITION' in text and len(commands) != len(set(commands)):
            errors.append('static Tauri handler contains duplicate command registrations')

if errors:
    print('OpenPenguin prepared-backend contract FAILED')
    for error in errors:
        print(f' - {error}')
    sys.exit(1)

print('OpenPenguin prepared-backend contract PASSED')
print(' - Core runtime and model commands registered')
print(' - Global Library / runtime repair commands registered')
print(' - Full Logs diagnostics commands registered')
print(' - Formatted static handler is parseable')
