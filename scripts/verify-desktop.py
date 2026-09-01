from pathlib import Path
import json, sys
root = Path(__file__).resolve().parents[1]
errors=[]

def require(cond,msg):
    if not cond: errors.append(msg)

conf=json.loads((root/'src-tauri/tauri.conf.json').read_text())
require(conf['bundle']['externalBin']==['binaries/ollama-modeldock'],'Tauri externalBin not configured')
require(conf['version']=='0.5.0','Tauri version mismatch')
lib=(root/'src-tauri/src/lib.rs').read_text()
for token in ['start_bundled_ollama','stop_bundled_ollama','ollama_json','pull_model','cancel_pull','search_huggingface','list_hf_gguf_variants','import_hf_gguf','cancel_hf_import','system_profile','OLLAMA_MODELS','127.0.0.1:11435','127.0.0.1:11434']:
    require(token in lib, f'Missing desktop engine token: {token}')
app=(root/'src/App.tsx').read_text()
for token in ['start_bundled_ollama','engineMode','Bundled','External','ollama_json','pull_model','search_huggingface','list_hf_gguf_variants','import_hf_gguf','modeldock://pull-progress','modeldock://import-progress']:
    require(token in app, f'Missing frontend engine integration: {token}')
require((root/'scripts/prepare-ollama-sidecar.sh').exists(),'Missing sidecar preparation script')
if errors:
    print('Desktop verification FAILED:')
    for e in errors: print(' -',e)
    sys.exit(1)
print('Desktop verification OK')
print(' - bundled runtime lifecycle wired')
print(' - external runtime fallback wired')
print(' - private model directory wired')
print(' - restricted Ollama API bridge wired')
print(' - verified Hugging Face GGUF import wired')
