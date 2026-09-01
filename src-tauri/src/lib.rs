use futures_util::StreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs, path::PathBuf, process::Command, sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;

const BUNDLED_HOST: &str = "127.0.0.1:11435";
const EXTERNAL_HOST: &str = "127.0.0.1:11434";
const MAX_JSON_BYTES: usize = 2 * 1024 * 1024;

#[derive(Default)]
struct OllamaState {
    child: Mutex<Option<CommandChild>>,
    cancelled_pulls: Mutex<HashSet<String>>,
    cancelled_imports: Mutex<HashSet<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineInfo { mode: &'static str, host: &'static str, api_base: String, models_dir: String, running: bool }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemProfile { os: String, arch: String, chip: String, memory_bytes: u64, logical_cores: usize, free_storage_bytes: u64 }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PullProgress { model: String, status: String, digest: Option<String>, total: Option<u64>, completed: Option<u64>, percent: Option<f64>, done: bool, cancelled: bool, error: Option<String> }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ImportProgress { mode: String, import_id: String, repo_id: String, filename: String, model: String, stage: String, status: String, total: Option<u64>, completed: Option<u64>, percent: Option<f64>, sha256: Option<String>, done: bool, cancelled: bool, error: Option<String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HfVariant { filename: String, size: u64, quantization: String, sha256: Option<String>, source_url: String }

fn modeldock_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| format!("Unable to resolve ModelDock data directory: {e}"))?;
    fs::create_dir_all(&base).map_err(|e| format!("Unable to create ModelDock data directory: {e}"))?;
    Ok(base)
}
fn modeldock_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let models = modeldock_data_dir(app)?.join("ollama").join("models");
    fs::create_dir_all(&models).map_err(|e| format!("Unable to create ModelDock model directory: {e}"))?;
    Ok(models)
}
fn modeldock_imports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let imports = modeldock_data_dir(app)?.join("imports");
    fs::create_dir_all(&imports).map_err(|e| format!("Unable to create ModelDock imports directory: {e}"))?;
    Ok(imports)
}
fn host_for_mode(mode: &str) -> Result<&'static str, String> { match mode { "bundled" => Ok(BUNDLED_HOST), "external" => Ok(EXTERNAL_HOST), _ => Err("Unknown engine mode".into()) } }
fn allowed_api_path(path: &str) -> bool { matches!(path, "/api/version" | "/api/tags" | "/api/ps" | "/api/show" | "/api/chat" | "/api/generate" | "/api/delete") }
fn command_output(program: &str, args: &[&str]) -> Option<String> { Command::new(program).args(args).output().ok().and_then(|o| if o.status.success() { Some(String::from_utf8_lossy(&o.stdout).trim().to_string()) } else { None }) }
fn free_storage_bytes() -> u64 { command_output("df", &["-k", "/"]).and_then(|out| out.lines().last().map(str::to_owned)).and_then(|line| line.split_whitespace().nth(3).and_then(|v| v.parse::<u64>().ok())).unwrap_or(0).saturating_mul(1024) }
fn safe_segment(value: &str) -> String { value.chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '_' }).collect() }
fn encoded_path(path: &str) -> String { path.split('/').map(urlencoding::encode).collect::<Vec<_>>().join("/") }
fn quantization_from_filename(filename: &str) -> String {
    let upper = filename.to_ascii_uppercase();
    for q in ["IQ1_S","IQ2_XXS","IQ2_XS","IQ2_S","IQ2_M","IQ3_XXS","IQ3_XS","IQ3_S","IQ3_M","IQ4_XS","Q2_K","Q3_K_S","Q3_K_M","Q3_K_L","Q4_0","Q4_1","Q4_K_S","Q4_K_M","Q5_0","Q5_1","Q5_K_S","Q5_K_M","Q6_K","Q8_0","F16","BF16"] { if upper.contains(q) { return q.into(); } }
    "unknown".into()
}
fn emit_import(app: &AppHandle, event: ImportProgress) { let _ = app.emit("modeldock://import-progress", event); }

#[tauri::command]
fn system_profile() -> SystemProfile {
    let memory_bytes = command_output("sysctl", &["-n", "hw.memsize"]).and_then(|v| v.parse().ok()).unwrap_or(0);
    let chip = command_output("sysctl", &["-n", "machdep.cpu.brand_string"]).or_else(|| command_output("sysctl", &["-n", "hw.model"])).unwrap_or_else(|| "Unknown processor".into());
    SystemProfile { os: std::env::consts::OS.into(), arch: std::env::consts::ARCH.into(), chip, memory_bytes, logical_cores: std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1), free_storage_bytes: free_storage_bytes() }
}
#[tauri::command]
fn bundled_engine_info(app: AppHandle, state: State<'_, OllamaState>) -> Result<EngineInfo, String> {
    let models = modeldock_models_dir(&app)?;
    let running = state.child.lock().map_err(|_| "Bundled engine state lock failed".to_string())?.is_some();
    Ok(EngineInfo { mode: "bundled", host: BUNDLED_HOST, api_base: format!("http://{BUNDLED_HOST}"), models_dir: models.to_string_lossy().to_string(), running })
}
#[tauri::command]
fn external_engine_info() -> EngineInfo { EngineInfo { mode: "external", host: EXTERNAL_HOST, api_base: format!("http://{EXTERNAL_HOST}"), models_dir: "Managed by external Ollama".into(), running: false } }
#[tauri::command]
fn start_bundled_ollama(app: AppHandle, state: State<'_, OllamaState>) -> Result<EngineInfo, String> {
    let models = modeldock_models_dir(&app)?;
    let mut guard = state.child.lock().map_err(|_| "Bundled engine state lock failed".to_string())?;
    if guard.is_none() {
        let sidecar = app.shell().sidecar("ollama-modeldock").map_err(|e| format!("Bundled Ollama sidecar is unavailable: {e}"))?
            .arg("serve").env("OLLAMA_HOST", BUNDLED_HOST).env("OLLAMA_MODELS", models.to_string_lossy().to_string()).env("OLLAMA_ORIGINS", "tauri://localhost;http://tauri.localhost").env("OLLAMA_KEEP_ALIVE", "5m");
        let (_rx, child) = sidecar.spawn().map_err(|e| format!("Failed to start bundled Ollama: {e}"))?;
        *guard = Some(child);
    }
    Ok(EngineInfo { mode: "bundled", host: BUNDLED_HOST, api_base: format!("http://{BUNDLED_HOST}"), models_dir: models.to_string_lossy().to_string(), running: true })
}
#[tauri::command]
fn stop_bundled_ollama(state: State<'_, OllamaState>) -> Result<(), String> {
    let mut guard = state.child.lock().map_err(|_| "Bundled engine state lock failed".to_string())?;
    if let Some(child) = guard.as_mut() { child.kill().map_err(|e| format!("Failed to stop bundled Ollama: {e}"))?; }
    *guard = None; Ok(())
}
#[tauri::command]
async fn ollama_json(mode: String, method: String, path: String, body: Option<Value>) -> Result<Value, String> {
    if !allowed_api_path(&path) { return Err("This Ollama API path is not allowed by ModelDock".into()); }
    if let Some(ref body) = body { if serde_json::to_vec(body).map_err(|e| e.to_string())?.len() > MAX_JSON_BYTES { return Err("Request is too large".into()); } }
    let url = format!("http://{}{}", host_for_mode(&mode)?, path);
    let client = reqwest::Client::builder().timeout(Duration::from_secs(600)).build().map_err(|e| e.to_string())?;
    let request = match method.as_str() { "GET" => client.get(&url), "POST" => client.post(&url).json(&body.unwrap_or(Value::Object(Default::default()))), "DELETE" => client.delete(&url).json(&body.unwrap_or(Value::Object(Default::default()))), _ => return Err("Unsupported method".into()) };
    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status(); let text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(format!("Ollama returned {status}: {text}")); }
    if text.trim().is_empty() { return Ok(Value::Null); }
    serde_json::from_str(&text).map_err(|e| format!("Invalid Ollama JSON: {e}"))
}

#[tauri::command]
async fn pull_model(app: AppHandle, state: State<'_, OllamaState>, mode: String, model: String) -> Result<(), String> {
    if model.trim().is_empty() || model.len() > 180 { return Err("Invalid model name".into()); }
    let model = model.trim().to_string();
    state.cancelled_pulls.lock().map_err(|_| "Cancellation state lock failed".to_string())?.remove(&model);
    let host = host_for_mode(&mode)?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(60 * 60 * 6)).build().map_err(|e| e.to_string())?;
    let response = client.post(format!("http://{host}/api/pull")).json(&json!({"model": model, "stream": true})).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Ollama pull failed: {}", response.status())); }
    let mut stream = response.bytes_stream(); let mut pending = String::new();
    while let Some(chunk) = stream.next().await {
        if state.cancelled_pulls.lock().map_err(|_| "Cancellation state lock failed".to_string())?.contains(&model) {
            let _ = app.emit("modeldock://pull-progress", PullProgress { model: model.clone(), status: "Cancelled".into(), digest: None, total: None, completed: None, percent: None, done: true, cancelled: true, error: None }); return Ok(());
        }
        pending.push_str(&String::from_utf8_lossy(&chunk.map_err(|e| e.to_string())?));
        while let Some(pos) = pending.find('\n') {
            let line = pending[..pos].trim().to_string(); pending = pending[pos + 1..].to_string(); if line.is_empty() { continue; }
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                let total = value.get("total").and_then(Value::as_u64); let completed = value.get("completed").and_then(Value::as_u64);
                let percent = match (completed, total) { (Some(c), Some(t)) if t > 0 => Some((c as f64 / t as f64) * 100.0), _ => None };
                let status = value.get("status").and_then(Value::as_str).unwrap_or("Downloading").to_string(); let done = status.eq_ignore_ascii_case("success");
                let event = PullProgress { model: model.clone(), status, digest: value.get("digest").and_then(Value::as_str).map(str::to_owned), total, completed, percent, done, cancelled: false, error: value.get("error").and_then(Value::as_str).map(str::to_owned) };
                let _ = app.emit("modeldock://pull-progress", event.clone()); if event.error.is_some() { return Err(event.error.unwrap_or_else(|| "Unknown pull error".into())); }
            }
        }
    }
    Ok(())
}
#[tauri::command]
fn cancel_pull(state: State<'_, OllamaState>, model: String) -> Result<(), String> { state.cancelled_pulls.lock().map_err(|_| "Cancellation state lock failed".to_string())?.insert(model); Ok(()) }

#[tauri::command]
async fn search_huggingface(query: String, limit: Option<u8>) -> Result<Value, String> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(20)).user_agent("ModelDock/0.5").build().map_err(|e| e.to_string())?;
    let params = [("search", query), ("filter", "gguf".to_string()), ("sort", "downloads".to_string()), ("direction", "-1".to_string()), ("limit", limit.unwrap_or(24).min(50).to_string()), ("full", "true".to_string())];
    let response = client.get("https://huggingface.co/api/models").query(&params).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Hugging Face returned {}", response.status())); }
    response.json::<Value>().await.map_err(|e| e.to_string())
}
#[tauri::command]
async fn list_hf_gguf_variants(repo_id: String) -> Result<Vec<HfVariant>, String> {
    if !repo_id.contains('/') || repo_id.len() > 180 { return Err("Invalid Hugging Face repository ID".into()); }
    let client = reqwest::Client::builder().timeout(Duration::from_secs(30)).user_agent("ModelDock/0.5").build().map_err(|e| e.to_string())?;
    let url = format!("https://huggingface.co/api/models/{repo_id}/tree/main");
    let response = client.get(url).query(&[("recursive", "true"), ("expand", "true")]).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Unable to list repository files: {}", response.status())); }
    let items = response.json::<Vec<Value>>().await.map_err(|e| e.to_string())?; let mut variants = Vec::new();
    for item in items {
        let path = item.get("path").or_else(|| item.get("rfilename")).and_then(Value::as_str).unwrap_or(""); if !path.to_ascii_lowercase().ends_with(".gguf") { continue; }
        let size = item.get("size").and_then(Value::as_u64).or_else(|| item.get("lfs").and_then(|v| v.get("size")).and_then(Value::as_u64)).unwrap_or(0);
        let sha = item.get("lfs").and_then(|v| v.get("sha256")).and_then(Value::as_str).map(str::to_owned);
        variants.push(HfVariant { filename: path.to_string(), size, quantization: quantization_from_filename(path), sha256: sha, source_url: format!("https://huggingface.co/{repo_id}/resolve/main/{}?download=true", encoded_path(path)) });
    }
    variants.sort_by(|a,b| a.size.cmp(&b.size)); Ok(variants)
}
#[tauri::command]
fn cancel_hf_import(state: State<'_, OllamaState>, import_id: String) -> Result<(), String> { state.cancelled_imports.lock().map_err(|_| "Import cancellation state lock failed".to_string())?.insert(import_id); Ok(()) }

#[tauri::command]
async fn import_hf_gguf(app: AppHandle, state: State<'_, OllamaState>, mode: String, repo_id: String, filename: String, model: String, license: Option<String>, expected_sha256: Option<String>) -> Result<(), String> {
    if !repo_id.contains('/') || !filename.to_ascii_lowercase().ends_with(".gguf") || model.trim().is_empty() { return Err("Invalid GGUF import request".into()); }
    let import_id = format!("{}:{}", repo_id, filename);
    state.cancelled_imports.lock().map_err(|_| "Import cancellation state lock failed".to_string())?.remove(&import_id);
    let host = host_for_mode(&mode)?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(60 * 60 * 12)).user_agent("ModelDock/0.5").build().map_err(|e| e.to_string())?;
    let source_url = format!("https://huggingface.co/{repo_id}/resolve/main/{}?download=true", encoded_path(&filename));
    let response = client.get(&source_url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("GGUF download failed: {}", response.status())); }
    let total = response.content_length();
    if total.is_some_and(|n| free_storage_bytes() > 0 && n.saturating_add(2 * 1024 * 1024 * 1024) > free_storage_bytes()) { return Err("Not enough free disk space for this GGUF plus safety headroom".into()); }
    let repo_dir = modeldock_imports_dir(&app)?.join(safe_segment(&repo_id)); fs::create_dir_all(&repo_dir).map_err(|e| e.to_string())?;
    let local_path = repo_dir.join(safe_segment(&filename));
    let mut file = tokio::fs::File::create(&local_path).await.map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream(); let mut hasher = Sha256::new(); let mut completed = 0u64;
    emit_import(&app, ImportProgress { mode: mode.clone(), import_id: import_id.clone(), repo_id: repo_id.clone(), filename: filename.clone(), model: model.clone(), stage: "download".into(), status: "Downloading GGUF".into(), total, completed: Some(0), percent: Some(0.0), sha256: None, done: false, cancelled: false, error: None });
    while let Some(chunk) = stream.next().await {
        if state.cancelled_imports.lock().map_err(|_| "Import cancellation state lock failed".to_string())?.contains(&import_id) {
            let _ = tokio::fs::remove_file(&local_path).await;
            emit_import(&app, ImportProgress { mode: mode.clone(), import_id, repo_id, filename, model, stage: "cancelled".into(), status: "Cancelled".into(), total, completed: Some(completed), percent: None, sha256: None, done: true, cancelled: true, error: None }); return Ok(());
        }
        let chunk = chunk.map_err(|e| e.to_string())?; file.write_all(&chunk).await.map_err(|e| e.to_string())?; hasher.update(&chunk); completed += chunk.len() as u64;
        let percent = total.filter(|t| *t > 0).map(|t| completed as f64 / t as f64 * 100.0);
        emit_import(&app, ImportProgress { mode: mode.clone(), import_id: import_id.clone(), repo_id: repo_id.clone(), filename: filename.clone(), model: model.clone(), stage: "download".into(), status: "Downloading GGUF".into(), total, completed: Some(completed), percent, sha256: None, done: false, cancelled: false, error: None });
    }
    file.flush().await.map_err(|e| e.to_string())?; drop(file);
    let sha = format!("{:x}", hasher.finalize());
    if let Some(expected) = expected_sha256.as_ref().filter(|s| !s.is_empty()) { if !expected.eq_ignore_ascii_case(&sha) { let _ = tokio::fs::remove_file(&local_path).await; return Err(format!("SHA-256 mismatch. Expected {expected}, got {sha}")); } }
    emit_import(&app, ImportProgress { mode: mode.clone(), import_id: import_id.clone(), repo_id: repo_id.clone(), filename: filename.clone(), model: model.clone(), stage: "verify".into(), status: "SHA-256 verified".into(), total, completed: Some(completed), percent: Some(100.0), sha256: Some(sha.clone()), done: false, cancelled: false, error: None });

    let digest = format!("sha256:{sha}");
    let upload_file = tokio::fs::File::open(&local_path).await.map_err(|e| e.to_string())?;
    let upload = client.put(format!("http://{host}/api/blobs/{digest}")).body(reqwest::Body::wrap_stream(ReaderStream::new(upload_file))).send().await.map_err(|e| e.to_string())?;
    if !upload.status().is_success() { return Err(format!("Ollama blob upload failed: {}", upload.status())); }
    emit_import(&app, ImportProgress { mode: mode.clone(), import_id: import_id.clone(), repo_id: repo_id.clone(), filename: filename.clone(), model: model.clone(), stage: "register".into(), status: "Registering model with Ollama".into(), total, completed: Some(completed), percent: Some(100.0), sha256: Some(sha.clone()), done: false, cancelled: false, error: None });

    let mut files = serde_json::Map::new(); files.insert(filename.clone(), Value::String(digest.clone()));
    let create_body = json!({"model": model, "files": files, "license": license.clone().unwrap_or_default(), "stream": false});
    let create = client.post(format!("http://{host}/api/create")).json(&create_body).send().await.map_err(|e| e.to_string())?;
    let create_status = create.status(); let create_text = create.text().await.map_err(|e| e.to_string())?;
    if !create_status.is_success() { return Err(format!("Ollama model creation failed: {create_status}: {create_text}")); }

    let modelfile = format!("# Generated by ModelDock 0.5\n# Provenance record; staging GGUF may be removed after import.\n# Source: https://huggingface.co/{repo_id}\n# File: {filename}\n# SHA256: {sha}\n# License metadata: {}\nFROM ./{}\n", license.clone().unwrap_or_else(|| "not declared".into()), safe_segment(&filename));
    fs::write(repo_dir.join(format!("{}.Modelfile", safe_segment(&model))), modelfile).map_err(|e| e.to_string())?;
    let provenance = json!({"repoId":repo_id,"filename":filename,"model":model,"sha256":sha,"license":license,"sourceUrl":source_url});
    fs::write(repo_dir.join(format!("{}.provenance.json", safe_segment(&model))), serde_json::to_vec_pretty(&provenance).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let _ = tokio::fs::remove_file(&local_path).await;
    emit_import(&app, ImportProgress { mode: mode.clone(), import_id, repo_id, filename, model, stage: "done".into(), status: "Imported successfully".into(), total, completed: Some(completed), percent: Some(100.0), sha256: Some(sha), done: true, cancelled: false, error: None });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default().manage(OllamaState::default()).plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![system_profile,bundled_engine_info,external_engine_info,start_bundled_ollama,stop_bundled_ollama,ollama_json,pull_model,cancel_pull,search_huggingface,list_hf_gguf_variants,import_hf_gguf,cancel_hf_import])
        .setup(|app| { let _ = modeldock_models_dir(&app.handle()); let _ = modeldock_imports_dir(&app.handle()); Ok(()) })
        .run(tauri::generate_context!()).expect("error while running ModelDock");
}
