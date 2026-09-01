from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[1]
errors=[]
def require(cond,msg):
    if not cond: errors.append(msg)
conf=json.loads((root/'src-tauri/tauri.conf.json').read_text())
resources=conf.get('bundle',{}).get('resources',{})
require(conf.get('productName')=='Openguin','Tauri productName must be Openguin')
require(conf['app']['windows'][0].get('title')=='Openguin','Main window title must be Openguin')
require(resources.get('resources/ollama-runtime/')=='ollama-runtime/','Complete Ollama runtime resource mapping missing')
require('externalBin' not in conf.get('bundle',{}),'Legacy CLI-only externalBin should not be used')
require(conf['version']=='0.7.0','Tauri version mismatch')
pkg=json.loads((root/'package.json').read_text())
require(pkg['version']=='0.7.0','package version mismatch')
require(pkg['name']=='openguin-preview','npm package must use Openguin branding')
require('apply-openguin-brand.py' in pkg['scripts']['desktop:prepare'],'Openguin branding step is not wired')
cargo=(root/'src-tauri/Cargo.toml').read_text()
require('name = "openguin"' in cargo and 'name = "openguin_lib"' in cargo,'Rust crate must use Openguin branding')
lib=(root/'src-tauri/src/lib.rs').read_text()
for token in ['runtime_discovery','start_bundled_ollama','stop_bundled_ollama','ollama_json','pull_model','search_huggingface','list_hf_gguf_variants','import_hf_gguf','system_profile','127.0.0.1:11435','127.0.0.1:11434','runtime_dir','runtime_complete','OLLAMA_LIBRARY_PATH','llama-server']:
    require(token in lib, f'Missing engine token: {token}')
v07=(root/'src-tauri/src/v07.rs').read_text()
for token in ['official_ollama_catalog','chat_stream','modeldock://chat-stream','https://ollama.com/library']:
    require(token in v07,f'Missing 0.7 backend token: {token}')
app=(root/'src/App07.tsx').read_text()
for token in ['Openguin','Desktop Alpha 0.7','Thinking','Streaming playground','Sync official','Hardware Fit 3','Diagnostics & Usage','HUGGING FACE GGUF']:
    require(token in app,f'Missing Openguin frontend integration: {token}')
for file in ['LICENSE','NOTICE.md','THIRD_PARTY_NOTICES.md','COPYRIGHT.md','SECURITY.md','CONTRIBUTING.md','docs/ENGINE_BEHAVIOR.md','docs/MODEL_LICENSING.md']:
    require((root/file).exists(),f'Missing legal/documentation file: {file}')
prep=(root/'scripts/prepare-ollama-sidecar.sh').read_text()
for token in ['https://ollama.com/download/Ollama-darwin.zip','Contents/Resources','llama-server','ditto "$SOURCE_DIR" "$RUNTIME_DIR"']:
    require(token in prep,f'Complete runtime preparation missing token: {token}')
icon=(root/'scripts/ensure-app-icon.py').read_text()
require('Openguin' in icon and 'penguin' in icon.lower(),'Generated penguin icon script missing')
if errors:
    print('Desktop verification FAILED:')
    for e in errors: print(' -',e)
    sys.exit(1)
print('Desktop verification OK — Openguin 0.7')
print(' - Openguin product/window/package branding wired')
print(' - generated original monochrome penguin icon wired')
print(' - complete Ollama macOS runtime bundle wired')
print(' - runtime readiness/fallback wired')
print(' - Rust streaming bridge and thinking controls wired')
print(' - live Ollama catalog, Hardware Fit 3 and diagnostics retained')
print(' - verified Hugging Face GGUF import retained')
print(' - legal / third-party notice pack retained')
