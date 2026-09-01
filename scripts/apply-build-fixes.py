from pathlib import Path

root = Path(__file__).resolve().parents[1]
lib = root / "src-tauri/src/lib.rs"
app = root / "src/App.tsx"

text = lib.read_text()
old_stop = 'fn stop_bundled_ollama(state:State<\'_,OllamaState>)->Result<(),String>{let mut g=state.child.lock().map_err(|_|"state lock".to_string())?;if let Some(c)=g.as_mut(){c.kill().map_err(|e|e.to_string())?}*g=None;Ok(())}'
new_stop = 'fn stop_bundled_ollama(state:State<\'_,OllamaState>)->Result<(),String>{let mut g=state.child.lock().map_err(|_|"state lock".to_string())?;if let Some(c)=g.take(){c.kill().map_err(|e|e.to_string())?}Ok(())}'
text = text.replace(old_stop, new_stop)

old_start = 'fn start_bundled_ollama(app:AppHandle,state:State<\'_,OllamaState>)->Result<EngineInfo,String>{let d=models_dir(&app)?;let mut g=state.child.lock().map_err(|_|"state lock".to_string())?;if g.is_none(){let cmd=app.shell().sidecar("ollama-modeldock").map_err(|e|format!("Bundled Ollama sidecar unavailable: {e}"))?.arg("serve").env("OLLAMA_HOST",BUNDLED_HOST).env("OLLAMA_MODELS",d.to_string_lossy().to_string()).env("OLLAMA_ORIGINS","tauri://localhost;http://tauri.localhost").env("OLLAMA_KEEP_ALIVE","5m");let(_rx,child)=cmd.spawn().map_err(|e|format!("Failed to start bundled Ollama: {e}"))?;*g=Some(child)}Ok(EngineInfo{mode:"bundled",host:BUNDLED_HOST,api_base:format!("http://{BUNDLED_HOST}"),models_dir:d.to_string_lossy().into(),running:true})}'
new_start = 'fn start_bundled_ollama(app:AppHandle,state:State<\'_,OllamaState>)->Result<EngineInfo,String>{let d=models_dir(&app)?;{let mut g=state.child.lock().map_err(|_|"state lock".to_string())?;if g.is_none(){let cmd=app.shell().sidecar("ollama-modeldock").map_err(|e|format!("Bundled Ollama sidecar unavailable: {e}"))?.arg("serve").env("OLLAMA_HOST",BUNDLED_HOST).env("OLLAMA_MODELS",d.to_string_lossy().to_string()).env("OLLAMA_ORIGINS","tauri://localhost;http://tauri.localhost").env("OLLAMA_KEEP_ALIVE","5m");let(_rx,child)=cmd.spawn().map_err(|e|format!("Failed to start bundled Ollama: {e}"))?;*g=Some(child)}}for _ in 0..40{if std::net::TcpStream::connect(BUNDLED_HOST).is_ok(){return Ok(EngineInfo{mode:"bundled",host:BUNDLED_HOST,api_base:format!("http://{BUNDLED_HOST}"),models_dir:d.to_string_lossy().into(),running:true})}std::thread::sleep(Duration::from_millis(125));}let mut g=state.child.lock().map_err(|_|"state lock".to_string())?;if let Some(c)=g.take(){let _=c.kill();}Err("Bundled Ollama sidecar launched but did not open 127.0.0.1:11435. ModelDock will use a running external Ollama when available.".into())}'
text = text.replace(old_start, new_start)
lib.write_text(text)

ui = app.read_text()
old_snippet = "const snippet=`const response = await fetch('http://127.0.0.1:${mode==='bundled'?'11435':'11434'}/api/chat', {\\n  method: 'POST',\\n  headers: {'Content-Type':'application/json'},\\n  body: JSON.stringify({model: '${selected||'your-model'}', messages: [{role:'user', content:'Hello'}], stream: false})\\n});\\nconsole.log(await response.json());`;"
new_snippet = "const snippet=mode==='external'?`const response = await fetch('http://127.0.0.1:11434/api/chat', {\\n  method: 'POST',\\n  headers: {'Content-Type':'application/json'},\\n  body: JSON.stringify({model: '${selected||'your-model'}', messages: [{role:'user', content:'Hello'}], stream: false})\\n});\\nconsole.log(await response.json());`:`// ModelDock bundled runtime is private to the desktop app.\\n// Switch to External Ollama in ModelDock if you need direct localhost API access from another application.`;"
ui = ui.replace(old_snippet, new_snippet)
app.write_text(ui)

print("Applied ModelDock 0.6.1 build fixes.")
