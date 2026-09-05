from pathlib import Path

root=Path(__file__).resolve().parents[1]
lib=root/'src-tauri/src/lib.rs'
app=root/'src/App07.tsx'
full_logs=root/'src/FullLogs.tsx'

text=lib.read_text()
if 'mod diagnostics;' not in text:
    marker='mod v07;\nuse v07::{chat_stream, official_ollama_catalog};\n'
    if marker not in text:
        raise SystemExit('Could not locate v07 integration point; refusing partial diagnostics integration.')
    text=text.replace(marker, marker+'mod diagnostics;\nuse diagnostics::{append_modeldock_log,bundled_ollama_log,clear_diagnostic_log,modeldock_backend_log};\n')

start_marker='.invoke_handler(tauri::generate_handler!['
end_marker=']).setup('
start=text.find(start_marker)
end=text.find(end_marker,start)
if start == -1 or end == -1:
    raise SystemExit('Could not locate Tauri generate_handler; refusing partial diagnostics integration.')
body_start=start+len(start_marker)
body=text[body_start:end]
commands=[x.strip() for x in body.split(',') if x.strip()]
for command in ('bundled_ollama_log','modeldock_backend_log','append_modeldock_log','clear_diagnostic_log'):
    if command not in commands:
        commands.append(command)
text=text[:body_start]+','.join(commands)+text[end:]
lib.write_text(text)

ui=app.read_text()
static='OPENGUIN_011_STATIC_COMPOSITION' in ui
if static:
    for required in ["import FullLogs from './FullLogs';","<FullLogs/>"]:
        if required not in ui:
            raise SystemExit(f'apply-full-logs: static composition missing required UI integration: {required}')
    fl=full_logs.read_text()
    for required in ['localStorage:modeldock-logs','UI events','Rust backend','Ollama process']:
        if required not in fl:
            raise SystemExit(f'apply-full-logs: static three-layer log integration missing: {required}')
    print('Diagnostics UI patch skipped: static App07 + three-layer Full Logs already own UI event history.')
    raise SystemExit(0)

if "import FullLogs from './FullLogs';" not in ui:
    ui=ui.replace("import './app07.css';", "import './app07.css';\nimport FullLogs from './FullLogs';")
old_log="const log=(level:Log['level'],message:string)=>setLogs(prev=>{const next=[{at:new Date().toISOString(),level,message},...prev].slice(0,300);save('modeldock-logs',next);return next});"
new_log="const log=(level:Log['level'],message:string)=>{void invoke('append_modeldock_log',{level,message}).catch(()=>{});setLogs(prev=>{const next=[{at:new Date().toISOString(),level,message},...prev].slice(0,300);save('modeldock-logs',next);return next})};"
if old_log in ui:
    ui=ui.replace(old_log,new_log,1)
elif new_log not in ui:
    raise SystemExit('apply-full-logs: log integration anchor missing; refusing to lose persistent app events')
needle='<section className="v07-card"><h3>Benchmark history</h3>'
if '<FullLogs />' not in ui and '<FullLogs/>' not in ui:
    ui=ui.replace(needle,'<FullLogs />'+needle)
app.write_text(ui)
print('Applied legacy full diagnostics UI and handler registration.')
