from pathlib import Path
import json, sys

root=Path(__file__).resolve().parents[1]
errors=[]

def require(cond,msg):
    if not cond: errors.append(msg)

def require_any(text,tokens,msg):
    if not any(token in text for token in tokens): errors.append(msg)

conf=json.loads((root/'src-tauri/tauri.conf.json').read_text())
resources=conf.get('bundle',{}).get('resources',{}) or {}
icons=conf.get('bundle',{}).get('icon',[])
require(conf.get('productName')=='Openguin','Tauri productName must be Openguin')
require(conf['app']['windows'][0].get('title')=='Openguin','Main window title must be Openguin')
require('resources/ollama-runtime/' not in resources,'Private Ollama runtime must not be packaged into the default app bundle')
require('externalBin' not in conf.get('bundle',{}),'Legacy CLI-only externalBin should not be used')
require(conf['version']=='0.10.1','Tauri version mismatch')
for icon_path in ['icons/32x32.png','icons/128x128.png','icons/128x128@2x.png','icons/icon.icns','icons/icon.png']:
    require(icon_path in icons,f'Missing Tauri bundle icon: {icon_path}')

pkg=json.loads((root/'package.json').read_text())
require(pkg['version']=='0.10.1','package version mismatch')
require(pkg['name']=='openguin-preview','npm package must use Openguin branding')
prepare=pkg['scripts'].get('desktop:prepare','')
require('ensure-app-icon.py' in prepare,'desktop:prepare must generate deterministic app icons')
require('prepare-ollama-sidecar.sh' not in prepare,'desktop:prepare must not download/install the private Ollama runtime')
require('prepare:private-runtime:manual' in pkg['scripts'],'Manual private-runtime preparation utility must remain explicit')
for legacy in ['apply-build-fixes.py','apply-full-logs.py','apply-observatory.py','apply-performance09.py','apply-task-center.py','apply-expansion010.py','apply-openguin-brand.py']:
    require(legacy not in prepare,f'Legacy source mutator must not run in desktop:prepare: {legacy}')
verify_all=pkg['scripts'].get('verify:all','')
for verifier in ['verify:desktop','verify:brand','verify:engineering','verify:prepared','verify:legacy','verify:core-state','verify:runtime-consent']:
    require(verifier in verify_all,f'verify:all missing contract: {verifier}')
require('npm run desktop:prepare' in pkg['scripts'].get('desktop:dev',''),'desktop:dev must prepare deterministic assets')
require('npm run verify:all' in pkg['scripts'].get('desktop:dev',''),'desktop:dev must run the full contract suite')
require('npm run desktop:prepare' in pkg['scripts'].get('desktop:build',''),'desktop:build must prepare deterministic assets')
require('npm run verify:all' in pkg['scripts'].get('desktop:build',''),'desktop:build must run the full contract suite')

cargo=(root/'src-tauri/Cargo.toml').read_text()
require('name = "openguin"' in cargo and 'name = "openguin_lib"' in cargo,'Rust crate must use Openguin branding')
require('version = "0.10.1"' in cargo,'Rust version mismatch')

lib=(root/'src-tauri/src/lib.rs').read_text()
for token in ['OPENGUIN_011_STATIC_RUST','runtime_discovery','start_bundled_ollama','stop_bundled_ollama','ollama_json','pull_model','cancel_pull','cancel_hf_import','search_huggingface','list_hf_gguf_variants','import_hf_gguf','system_profile','127.0.0.1:11435','127.0.0.1:11434','runtime_dir','runtime_complete','OLLAMA_LIBRARY_PATH','llama-server','/api/generate','/api/ps','mod v010','universal_model_search','universal_model_variants','repair_bundled_runtime','mod diagnostics','bundled_ollama_log','modeldock_backend_log','clear_diagnostic_log']:
    require(token in lib, f'Missing static engine token: {token}')

v07=(root/'src-tauri/src/v07.rs').read_text()
for token in ['official_ollama_catalog','chat_stream','modeldock://chat-stream','https://ollama.com/library','total_duration','load_duration','prompt_eval_count','prompt_eval_duration','eval_count','eval_duration','done_reason']:
    require(token in v07,f'Missing generation telemetry token: {token}')

v010=(root/'src-tauri/src/v010.rs').read_text()
for token in ['universal_model_search','universal_model_variants','repair_bundled_runtime','huggingface.co/api/models','api.github.com/search/repositories','/tags','Ollama-darwin.zip','openguin://runtime-install-progress']:
    require(token in v010,f'Missing 0.10 backend token: {token}')

app=(root/'src/App07.tsx').read_text()
for token in ['Openguin','Thinking','Streaming playground','Hardware Fit 3','Diagnostics & Usage','Observatory','Runtime Observatory','BrandMark','MegaLibrary','RuntimeInstallerCard','DeveloperStudio010','AdvancedSettings010','FullLogs','OPENGUIN_011_STATIC_COMPOSITION']:
    require(token in app,f'Missing Openguin frontend integration: {token}')
require_any(app,['top_k:topK','top_k:runTopK'],'Missing advanced inference request: top_k')
require_any(app,['min_p:minP','min_p:runMinP'],'Missing advanced inference request: min_p')
require_any(app,['repeat_penalty:repeatPenalty','repeat_penalty:runRepeatPenalty'],'Missing advanced inference request: repeat_penalty')
require_any(app,['keep_alive:keepAlive','keep_alive:runKeepAlive'],'Missing advanced inference request: keep_alive')
require('loadMs:p.loadDuration' in app and 'promptMs:p.promptEvalDuration' in app and 'decodeMs:p.evalDuration' in app,'Generation pipeline telemetry is not captured in App07 benchmark records')

obs=(root/'src/Observatory.tsx').read_text()
for token in ['/api/ps','Runtime memory map','Decode performance trend','Last generation pipeline','Context residency','size_vram','context_length','RuntimeControl09','CompareBench09']:
    require(token in obs,f'Missing Observatory visualization/control token: {token}')

rt=(root/'src/RuntimeControl09.tsx').read_text()
for token in ['RUNTIME CONTROL','CONTEXT OPTIMIZER','keep_alive','Preload','Unload','recommended','ceiling','task(']:
    require(token in rt,f'Missing runtime control token: {token}')

cmp=(root/'src/CompareBench09.tsx').read_text()
for token in ['MODEL COMPARATOR','COLD / WARM BENCHMARK','MEMORY HISTORY','openguin-coldwarm','load_duration','eval_duration','task(']:
    require(token in cmp,f'Missing comparison/benchmark token: {token}')

mega=(root/'src/MegaLibrary.tsx').read_text()
for token in ['GLOBAL MODEL INDEX','Ollama','Hugging Face','GitHub','universal_model_search','universal_model_variants','Download variants','Review first']:
    require(token in mega,f'Missing Global Library token: {token}')
require_any(mega,['Recommended for this Mac','Largest fully feasible'],'Missing Global Library hardware/capacity recommendation token')

installer=(root/'src/RuntimeInstallerCard.tsx').read_text()
for token in ['Download Ollama (optional)','Repair Ollama Runtime','repair_bundled_runtime','runtime-install-progress','confirm(','never downloads or installs this private runtime on first launch']:
    require(token in installer,f'Missing runtime-consent installer token: {token}')

advanced=(root/'src/AdvancedSettings010.tsx').read_text()
for token in ['Top K','Min P','Repeat penalty','Seed','Keep model loaded']:
    require(token in advanced,f'Missing advanced settings token: {token}')

dev=(root/'src/DeveloperStudio010.tsx').read_text()
require('random code sample' in dev and 'Runtime architecture' in dev and 'Debug order' in dev,'Developer redesign missing')

task_center=(root/'src/TaskCenter.tsx').read_text()
for token in ['Activity','Stalled','cancel_pull','cancel_hf_import','modeldock://pull-progress','modeldock://import-progress','STALL_MS','Measured progress','cancelOrDismiss','dismiss(r.id)','Remove']:
    require(token.lower() in task_center.lower(),f'Missing Task Center token: {token}')

task_bus=(root/'src/taskBus.ts').read_text()
require('openguin:task' in task_bus and 'CustomEvent' in task_bus and 'startTask' in task_bus,'Task Center event bus missing')
main=(root/'src/main.tsx').read_text()
require('TaskCenter' in main and '<TaskCenter/>' in main,'Global Task Center is not mounted')

for file in ['src/taskBus.ts','src/task-center.css','src/BrandMark.tsx','public/openguin.svg','src/observatory.css','src/performance09.css','src/mega-library.css','src/developer010.css','src/runtime-installer.css','src/advanced-settings010.css','src/FullLogs.tsx','src/full-logs.css','scripts/verify-brand011.py','scripts/prepare-ollama-sidecar.sh','LICENSE','NOTICE.md','THIRD_PARTY_NOTICES.md','COPYRIGHT.md','SECURITY.md','CONTRIBUTING.md','docs/ENGINE_BEHAVIOR.md','docs/MODEL_LICENSING.md']:
    require((root/file).exists(),f'Missing required file: {file}')
require(not (root/'src/taskCenter.ts').exists(),'Legacy taskCenter.ts must be removed to avoid macOS case-insensitive collision with TaskCenter.tsx')

index=(root/'index.html').read_text()
require('/openguin.svg' in index and '<title>Openguin</title>' in index,'Openguin document title/favicon not wired')
prep=(root/'scripts/prepare-ollama-sidecar.sh').read_text()
for token in ['https://ollama.com/download/Ollama-darwin.zip','Contents/Resources','llama-server','ditto "$SOURCE_DIR" "$RUNTIME_DIR"']:
    require(token in prep,f'Manual runtime preparation utility missing token: {token}')
icon=(root/'scripts/ensure-app-icon.py').read_text()
for token in ['Openguin','penguin','icon.icns','iconutil','32x32.png','128x128@2x.png']:
    require(token in icon,f'Complete Openguin icon generator missing token: {token}')
if sys.platform == 'darwin':
    require((root/'src-tauri/icons/icon.icns').exists(),'Generated macOS icon.icns is missing')

if errors:
    print('Desktop verification FAILED:')
    for e in errors: print(' -',e)
    sys.exit(1)

print('Desktop verification OK — OpenPenguin static source + opt-in runtime architecture')
print(' - desktop:prepare is deterministic-asset-only; private runtime is not downloaded automatically')
print(' - default app bundle contains no private Ollama runtime resource')
print(' - private runtime download/repair requires explicit UI confirmation')
print(' - static Rust command composition and static React composition verified')
print(' - every Task Center row can be cancelled when supported or removed/dismissed')
print(' - Global Model Index + runtime repair + advanced inference settings retained')
print(' - Runtime Observatory pipeline telemetry, Full Logs and Hardware Fit retained')
print(' - verify:all is the single production contract suite')
