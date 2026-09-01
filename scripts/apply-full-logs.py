from pathlib import Path

root=Path(__file__).resolve().parents[1]
lib=root/'src-tauri/src/lib.rs'
app=root/'src/App07.tsx'

text=lib.read_text()
if 'mod diagnostics;' not in text:
    marker='mod v07;\nuse v07::{chat_stream, official_ollama_catalog};\n'
    text=text.replace(marker, marker+'mod diagnostics;\nuse diagnostics::{append_modeldock_log,bundled_ollama_log,clear_diagnostic_log,modeldock_backend_log};\n')
old='import_hf_gguf,cancel_hf_import,official_ollama_catalog,chat_stream])'
new='import_hf_gguf,cancel_hf_import,official_ollama_catalog,chat_stream,bundled_ollama_log,modeldock_backend_log,append_modeldock_log,clear_diagnostic_log])'
text=text.replace(old,new)
lib.write_text(text)

ui=app.read_text()
if "import FullLogs from './FullLogs';" not in ui:
    ui=ui.replace("import './app07.css';", "import './app07.css';\nimport FullLogs from './FullLogs';")
old_log="const log=(level:Log['level'],message:string)=>setLogs(prev=>{const next=[{at:new Date().toISOString(),level,message},...prev].slice(0,300);save('modeldock-logs',next);return next});"
new_log="const log=(level:Log['level'],message:string)=>{void invoke('append_modeldock_log',{level,message}).catch(()=>{});setLogs(prev=>{const next=[{at:new Date().toISOString(),level,message},...prev].slice(0,300);save('modeldock-logs',next);return next})};"
ui=ui.replace(old_log,new_log)
needle='<section className="v07-card"><h3>Benchmark history</h3>'
if '<FullLogs />' not in ui:
    ui=ui.replace(needle,'<FullLogs />'+needle)
app.write_text(ui)
print('Applied full persistent diagnostics integration.')
