from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[1]
errors=[]
def require(cond,msg):
    if not cond: errors.append(msg)
conf=json.loads((root/'src-tauri/tauri.conf.json').read_text())
resources=conf.get('bundle',{}).get('resources',{})
icons=conf.get('bundle',{}).get('icon',[])
require(conf.get('productName')=='Openguin','Tauri productName must be Openguin')
require(conf['app']['windows'][0].get('title')=='Openguin','Main window title must be Openguin')
require(resources.get('resources/ollama-runtime/')=='ollama-runtime/','Complete Ollama runtime resource mapping missing')
require('externalBin' not in conf.get('bundle',{}),'Legacy CLI-only externalBin should not be used')
require(conf['version']=='0.9.1','Tauri version mismatch')
for icon_path in ['icons/32x32.png','icons/128x128.png','icons/128x128@2x.png','icons/icon.icns','icons/icon.png']:
    require(icon_path in icons,f'Missing Tauri bundle icon: {icon_path}')
pkg=json.loads((root/'package.json').read_text())
require(pkg['version']=='0.9.1','package version mismatch')
require(pkg['name']=='openguin-preview','npm package must use Openguin branding')
for step in ['apply-build-fixes.py','apply-full-logs.py','apply-observatory.py','apply-performance09.py','apply-task-center.py','apply-openguin-brand.py','ensure-app-icon.py','prepare-ollama-sidecar.sh']:
    require(step in pkg['scripts']['desktop:prepare'],f'Missing desktop prepare step: {step}')
cargo=(root/'src-tauri/Cargo.toml').read_text()
require('name = "openguin"' in cargo and 'name = "openguin_lib"' in cargo,'Rust crate must use Openguin branding')
require('version = "0.9.1"' in cargo,'Rust version mismatch')
lib=(root/'src-tauri/src/lib.rs').read_text()
for token in ['runtime_discovery','start_bundled_ollama','stop_bundled_ollama','ollama_json','pull_model','cancel_pull','cancel_hf_import','search_huggingface','list_hf_gguf_variants','import_hf_gguf','system_profile','127.0.0.1:11435','127.0.0.1:11434','runtime_dir','runtime_complete','OLLAMA_LIBRARY_PATH','llama-server','/api/generate','/api/ps']:
    require(token in lib, f'Missing engine token: {token}')
v07=(root/'src-tauri/src/v07.rs').read_text()
for token in ['official_ollama_catalog','chat_stream','modeldock://chat-stream','https://ollama.com/library','total_duration','load_duration','prompt_eval_count','prompt_eval_duration','eval_count','eval_duration','done_reason']:
    require(token in v07,f'Missing generation telemetry token: {token}')
app=(root/'src/App07.tsx').read_text()
for token in ['Openguin','Thinking','Streaming playground','Sync official','Hardware Fit 3','Diagnostics & Usage','HUGGING FACE GGUF','Observatory','Runtime Observatory','BrandMark']:
    require(token in app,f'Missing Openguin frontend integration: {token}')
obs=(root/'src/Observatory.tsx').read_text()
for token in ['/api/ps','Runtime memory map','Decode performance trend','Last generation pipeline','Context residency','size_vram','context_length','RuntimeControl09','CompareBench09']:
    require(token in obs,f'Missing Observatory visualization/control token: {token}')
rt=(root/'src/RuntimeControl09.tsx').read_text()
for token in ['RUNTIME CONTROL','CONTEXT OPTIMIZER','keep_alive','Preload','Unload','recommended','ceiling','task(']:
    require(token in rt,f'Missing runtime control token: {token}')
cmp=(root/'src/CompareBench09.tsx').read_text()
for token in ['MODEL COMPARATOR','COLD / WARM BENCHMARK','MEMORY HISTORY','openguin-coldwarm','load_duration','eval_duration','task(']:
    require(token in cmp,f'Missing comparison/benchmark token: {token}')
task_center=(root/'src/TaskCenter.tsx').read_text()
for token in ['Activity','Stalled','cancel_pull','cancel_hf_import','modeldock://pull-progress','modeldock://import-progress','STALL_MS','Measured progress']:
    require(token.lower() in task_center.lower(),f'Missing Task Center token: {token}')
task_bus=(root/'src/taskCenter.ts').read_text()
require('openguin:task' in task_bus and 'CustomEvent' in task_bus and 'startTask' in task_bus,'Task Center event bus missing')
main=(root/'src/main.tsx').read_text()
require("TaskCenter" in main and '<TaskCenter/>' in main,'Global Task Center is not mounted')
for file in ['src/taskCenter.ts','src/task-center.css','src/BrandMark.tsx','public/openguin.svg','src/observatory.css','src/performance09.css','LICENSE','NOTICE.md','THIRD_PARTY_NOTICES.md','COPYRIGHT.md','SECURITY.md','CONTRIBUTING.md','docs/ENGINE_BEHAVIOR.md','docs/MODEL_LICENSING.md']:
    require((root/file).exists(),f'Missing required file: {file}')
index=(root/'index.html').read_text()
require('/openguin.svg' in index and '<title>Openguin</title>' in index,'Openguin document title/favicon not wired')
prep=(root/'scripts/prepare-ollama-sidecar.sh').read_text()
for token in ['https://ollama.com/download/Ollama-darwin.zip','Contents/Resources','llama-server','ditto "$SOURCE_DIR" "$RUNTIME_DIR"']:
    require(token in prep,f'Complete runtime preparation missing token: {token}')
icon=(root/'scripts/ensure-app-icon.py').read_text()
for token in ['Openguin','penguin','icon.icns','iconutil','32x32.png','128x128@2x.png']:
    require(token in icon,f'Complete Openguin icon generator missing token: {token}')
if sys.platform == 'darwin':
    require((root/'src-tauri/icons/icon.icns').exists(),'Generated macOS icon.icns is missing')
if errors:
    print('Desktop verification FAILED:')
    for e in errors: print(' -',e)
    sys.exit(1)
print('Desktop verification OK — Openguin 0.9.1')
print(' - complete Openguin branding: product/window title, favicon, in-app penguin mark and macOS .icns bundle icon wired')
print(' - complete bundled Ollama runtime and external fallback wired')
print(' - Runtime Observatory + generation pipeline telemetry wired')
print(' - runtime preload/unload/keep-alive controls wired')
print(' - conservative Context Optimizer and model comparison wired')
print(' - cold/warm benchmark and 60-sample memory history wired')
print(' - global floating Task Center with progress, elapsed time, stall detection and cancellation wired')
print(' - thinking, Hardware Fit, full logs, official catalog and GGUF import retained')
print(' - legal / third-party notice pack retained')
