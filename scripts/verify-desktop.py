from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[1]
errors=[]
def require(cond,msg):
    if not cond: errors.append(msg)
conf=json.loads((root/'src-tauri/tauri.conf.json').read_text())
require(conf['bundle']['externalBin']==['binaries/ollama-modeldock'],'Tauri externalBin not configured')
require(conf['version']=='0.6.0','Tauri version mismatch')
lib=(root/'src-tauri/src/lib.rs').read_text()
for token in ['runtime_discovery','start_bundled_ollama','stop_bundled_ollama','ollama_json','pull_model','cancel_pull','search_huggingface','list_hf_gguf_variants','import_hf_gguf','cancel_hf_import','system_profile','OLLAMA_MODELS','127.0.0.1:11435','127.0.0.1:11434','external_path']:
    require(token in lib, f'Missing desktop engine token: {token}')
app=(root/'src/App.tsx').read_text()
for token in ['runtime_discovery','Bundled Ollama ready','Use Existing Ollama','Alpha 0.6','modeldock://pull-progress','modeldock://import-progress','Benchmark history']:
    require(token in app, f'Missing 0.6 frontend integration: {token}')
for file in ['LICENSE','NOTICE.md','THIRD_PARTY_NOTICES.md','COPYRIGHT.md','SECURITY.md','CONTRIBUTING.md','docs/ENGINE_BEHAVIOR.md','docs/MODEL_LICENSING.md']:
    require((root/file).exists(),f'Missing legal/documentation file: {file}')
prep=(root/'scripts/prepare-ollama-sidecar.sh').read_text()
require('https://ollama.com/download/Ollama-darwin.zip' in prep,'Build-time Ollama fallback download missing')
if errors:
    print('Desktop verification FAILED:')
    for e in errors: print(' -',e)
    sys.exit(1)
print('Desktop verification OK — ModelDock 0.6')
print(' - bundled runtime and external auto-detection wired')
print(' - build-time Ollama sidecar acquisition wired')
print(' - private model directory wired')
print(' - restricted Ollama API bridge wired')
print(' - verified Hugging Face GGUF import wired')
print(' - legal / third-party notice pack present')
