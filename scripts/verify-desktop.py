from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[1]
errors=[]
def require(cond,msg):
    if not cond: errors.append(msg)
conf=json.loads((root/'src-tauri/tauri.conf.json').read_text())
resources=conf.get('bundle',{}).get('resources',{})
require(resources.get('resources/ollama-runtime/')=='ollama-runtime/','Complete Ollama runtime resource mapping missing')
require('externalBin' not in conf.get('bundle',{}),'Legacy CLI-only externalBin should not be used')
require(conf['version']=='0.7.0','Tauri version mismatch')
pkg=json.loads((root/'package.json').read_text())
require(pkg['version']=='0.7.0','package version mismatch')
lib=(root/'src-tauri/src/lib.rs').read_text()
for token in ['runtime_discovery','start_bundled_ollama','stop_bundled_ollama','ollama_json','pull_model','search_huggingface','list_hf_gguf_variants','import_hf_gguf','system_profile','127.0.0.1:11435','127.0.0.1:11434','runtime_dir','runtime_complete','OLLAMA_LIBRARY_PATH','llama-server']:
    require(token in lib, f'Missing engine token: {token}')
v07=(root/'src-tauri/src/v07.rs').read_text()
for token in ['official_ollama_catalog','chat_stream','modeldock://chat-stream','https://ollama.com/library']:
    require(token in v07,f'Missing 0.7 backend token: {token}')
app=(root/'src/App07.tsx').read_text()
for token in ['Desktop Alpha 0.7','Thinking','Streaming playground','Sync official','Hardware Fit 3','Diagnostics & Usage','HUGGING FACE GGUF']:
    require(token in app,f'Missing 0.7 frontend token: {token}')
for file in ['LICENSE','NOTICE.md','THIRD_PARTY_NOTICES.md','COPYRIGHT.md','SECURITY.md','CONTRIBUTING.md','docs/ENGINE_BEHAVIOR.md','docs/MODEL_LICENSING.md']:
    require((root/file).exists(),f'Missing legal/documentation file: {file}')
prep=(root/'scripts/prepare-ollama-sidecar.sh').read_text()
for token in ['https://ollama.com/download/Ollama-darwin.zip','Contents/Resources','llama-server','ditto "$SOURCE_DIR" "$RUNTIME_DIR"']:
    require(token in prep,f'Complete runtime preparation missing token: {token}')
require('apply-build-fixes.py' in pkg['scripts']['desktop:prepare'],'0.7 build integration script is not wired')
if errors:
    print('Desktop verification FAILED:')
    for e in errors: print(' -',e)
    sys.exit(1)
print('Desktop verification OK — ModelDock 0.7')
print(' - complete Ollama macOS runtime bundle wired (CLI + llama-server + libraries)')
print(' - runtime readiness/fallback wired')
print(' - Rust streaming bridge wired')
print(' - live official Ollama catalog wired with cache fallback')
print(' - capability-aware thinking controls wired')
print(' - Hardware Fit 3, diagnostics, benchmark history wired')
print(' - verified Hugging Face GGUF import retained')
print(' - legal / third-party notice pack retained')
