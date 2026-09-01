from pathlib import Path

root = Path(__file__).resolve().parents[1]
lib = root / "src-tauri/src/lib.rs"
text = lib.read_text()

text = text.replace(
    'use std::{collections::HashSet, fs, path::{Path, PathBuf}, process::Command, sync::Mutex, time::Duration};',
    'use std::{collections::HashSet, fs, path::{Path, PathBuf}, process::{Child,Command,Stdio}, sync::Mutex, time::Duration};'
)
text = text.replace('use tauri_plugin_shell::{process::CommandChild, ShellExt};\n', '')
text = text.replace('struct OllamaState{child:Mutex<Option<CommandChild>>,', 'struct OllamaState{child:Mutex<Option<Child>>,')

imports_anchor = 'fn imports_dir(app:&AppHandle)->Result<PathBuf,String>{let p=data_dir(app)?.join("imports");fs::create_dir_all(&p).map_err(|e|e.to_string())?;Ok(p)}\n'
runtime_helpers = '''fn runtime_dir(app:&AppHandle)->Result<PathBuf,String>{
    let packaged=app.path().resource_dir().map_err(|e|e.to_string())?.join("ollama-runtime");
    if packaged.join("ollama").is_file(){return Ok(packaged)}
    Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ollama-runtime"))
}
fn runtime_bin(app:&AppHandle)->Result<PathBuf,String>{let p=runtime_dir(app)?.join("ollama");if p.is_file(){Ok(p)}else{Err(format!("Bundled Ollama runtime is missing: {}",p.display()))}}
fn runtime_complete(app:&AppHandle)->bool{runtime_dir(app).map(|p|p.join("ollama").is_file()&&p.join("llama-server").is_file()).unwrap_or(false)}
fn runtime_log(app:&AppHandle)->Result<PathBuf,String>{let p=data_dir(app)?.join("logs");fs::create_dir_all(&p).map_err(|e|e.to_string())?;Ok(p.join("bundled-ollama.log"))}
'''
if 'fn runtime_dir(app:&AppHandle)' not in text:
    text = text.replace(imports_anchor, imports_anchor + runtime_helpers)

old_info = 'fn bundled_engine_info(app:AppHandle,state:State<\'_,OllamaState>)->Result<EngineInfo,String>{let d=models_dir(&app)?;let running=state.child.lock().map_err(|_|"state lock".to_string())?.is_some();Ok(EngineInfo{mode:"bundled",host:BUNDLED_HOST,api_base:format!("http://{BUNDLED_HOST}"),models_dir:d.to_string_lossy().into(),running})}'
new_info = 'fn bundled_engine_info(app:AppHandle,_state:State<\'_,OllamaState>)->Result<EngineInfo,String>{let d=models_dir(&app)?;let running=std::net::TcpStream::connect(BUNDLED_HOST).is_ok();Ok(EngineInfo{mode:"bundled",host:BUNDLED_HOST,api_base:format!("http://{BUNDLED_HOST}"),models_dir:d.to_string_lossy().into(),running})}'
text = text.replace(old_info, new_info)

old_discovery = 'async fn runtime_discovery(app:AppHandle,state:State<\'_,OllamaState>)->Result<RuntimeDiscovery,String>{let bundled_available=app.shell().sidecar("ollama-modeldock").is_ok();let bundled_running=state.child.lock().map_err(|_|"state lock".to_string())?.is_some();let external_path=external_path();let external_installed=external_path.is_some();let(external_running,external_version)=probe(EXTERNAL_HOST).await;let(recommended_mode,reason)=if bundled_available{("bundled","Bundled Ollama is available. ModelDock will use its isolated runtime by default.")}else if external_running{("external","Bundled sidecar is unavailable in this build, so ModelDock can automatically use the running external Ollama service.")}else if external_installed{("external","An external Ollama installation was found but its local API is not currently running.")}else{("bundled","No external Ollama was detected. Production ModelDock builds are expected to include the bundled runtime.")};Ok(RuntimeDiscovery{bundled_available,bundled_running,external_installed,external_running,external_path,external_version,recommended_mode:recommended_mode.into(),reason:reason.into()})}'
new_discovery = 'async fn runtime_discovery(app:AppHandle,_state:State<\'_,OllamaState>)->Result<RuntimeDiscovery,String>{let bundled_available=runtime_complete(&app);let(bundled_running,_)=probe(BUNDLED_HOST).await;let external_path=external_path();let external_installed=external_path.is_some();let(external_running,external_version)=probe(EXTERNAL_HOST).await;let(recommended_mode,reason)=if bundled_running{("bundled","Complete bundled Ollama runtime is running on the isolated ModelDock port.")}else if bundled_available{("bundled","Complete bundled Ollama runtime is included and ready to start.")}else if external_running{("external","Bundled runtime is incomplete, so ModelDock can use the running external Ollama service.")}else if external_installed{("external","An external Ollama installation was found but its local API is not currently running.")}else{("bundled","No complete Ollama runtime was found in this build.")};Ok(RuntimeDiscovery{bundled_available,bundled_running,external_installed,external_running,external_path,external_version,recommended_mode:recommended_mode.into(),reason:reason.into()})}'
text = text.replace(old_discovery, new_discovery)

old_start = 'fn start_bundled_ollama(app:AppHandle,state:State<\'_,OllamaState>)->Result<EngineInfo,String>{let d=models_dir(&app)?;let mut g=state.child.lock().map_err(|_|"state lock".to_string())?;if g.is_none(){let cmd=app.shell().sidecar("ollama-modeldock").map_err(|e|format!("Bundled Ollama sidecar unavailable: {e}"))?.arg("serve").env("OLLAMA_HOST",BUNDLED_HOST).env("OLLAMA_MODELS",d.to_string_lossy().to_string()).env("OLLAMA_ORIGINS","tauri://localhost;http://tauri.localhost").env("OLLAMA_KEEP_ALIVE","5m");let(_rx,child)=cmd.spawn().map_err(|e|format!("Failed to start bundled Ollama: {e}"))?;*g=Some(child)}Ok(EngineInfo{mode:"bundled",host:BUNDLED_HOST,api_base:format!("http://{BUNDLED_HOST}"),models_dir:d.to_string_lossy().into(),running:true})}'
new_start = '''fn start_bundled_ollama(app:AppHandle,state:State<'_,OllamaState>)->Result<EngineInfo,String>{
    let d=models_dir(&app)?;
    let r=runtime_dir(&app)?;
    let bin=runtime_bin(&app)?;
    if !r.join("llama-server").is_file(){return Err("Bundled Ollama runtime is incomplete: llama-server is missing.".into())}
    {
        let mut g=state.child.lock().map_err(|_|"state lock".to_string())?;
        let exited=match g.as_mut(){Some(c)=>c.try_wait().map_err(|e|e.to_string())?.is_some(),None=>false};
        if exited{*g=None;}
        if g.is_none(){
            let log_path=runtime_log(&app)?;
            let log=fs::OpenOptions::new().create(true).append(true).open(&log_path).map_err(|e|e.to_string())?;
            let log2=log.try_clone().map_err(|e|e.to_string())?;
            let child=Command::new(&bin).arg("serve").current_dir(&r)
                .env("OLLAMA_HOST",BUNDLED_HOST)
                .env("OLLAMA_MODELS",d.to_string_lossy().to_string())
                .env("OLLAMA_LIBRARY_PATH",r.to_string_lossy().to_string())
                .env("OLLAMA_ORIGINS","tauri://localhost;http://tauri.localhost")
                .env("OLLAMA_KEEP_ALIVE","5m")
                .stdout(Stdio::from(log2)).stderr(Stdio::from(log))
                .spawn().map_err(|e|format!("Failed to start complete bundled Ollama runtime: {e}"))?;
            *g=Some(child);
        }
    }
    for _ in 0..120{if std::net::TcpStream::connect(BUNDLED_HOST).is_ok(){return Ok(EngineInfo{mode:"bundled",host:BUNDLED_HOST,api_base:format!("http://{BUNDLED_HOST}"),models_dir:d.to_string_lossy().into(),running:true})}std::thread::sleep(Duration::from_millis(125));}
    let mut g=state.child.lock().map_err(|_|"state lock".to_string())?;
    if let Some(mut c)=g.take(){let _=c.kill();let _=c.wait();}
    Err(format!("Bundled Ollama did not become ready on 127.0.0.1:11435. See {}",runtime_log(&app)?.display()))
}'''
text = text.replace(old_start, new_start)

# Handle previous readiness-patched source if this script is run on an already patched tree.
if 'app.shell().sidecar("ollama-modeldock")' in text:
    raise SystemExit('Could not replace legacy sidecar startup; refusing to build a partially patched runtime.')

old_stop = 'fn stop_bundled_ollama(state:State<\'_,OllamaState>)->Result<(),String>{let mut g=state.child.lock().map_err(|_|"state lock".to_string())?;if let Some(c)=g.take(){c.kill().map_err(|e|e.to_string())?}Ok(())}'
new_stop = 'fn stop_bundled_ollama(state:State<\'_,OllamaState>)->Result<(),String>{let mut g=state.child.lock().map_err(|_|"state lock".to_string())?;if let Some(mut c)=g.take(){let _=c.kill();let _=c.wait();}Ok(())}'
text = text.replace(old_stop, new_stop)

if 'mod v07;' not in text:
    marker = 'use tokio_util::io::ReaderStream;\n'
    text = text.replace(marker, marker + '\nmod v07;\nuse v07::{chat_stream, official_ollama_catalog};\n')
handler_old = 'import_hf_gguf,cancel_hf_import])'
handler_new = 'import_hf_gguf,cancel_hf_import,official_ollama_catalog,chat_stream])'
text = text.replace(handler_old, handler_new)
text = text.replace('ModelDock/0.6', 'ModelDock/0.7').replace('Generated by ModelDock 0.6', 'Generated by ModelDock 0.7')
lib.write_text(text)
print('Applied ModelDock 0.7 complete-runtime integrations.')
