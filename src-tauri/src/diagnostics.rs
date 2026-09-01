use serde::Serialize;
use std::{fs, io::{Read, Seek, SeekFrom, Write}, path::PathBuf};
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendLogSnapshot {
    path: String,
    content: String,
    size_bytes: u64,
    truncated: bool,
}

fn logs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let p = super::data_dir(app)?.join("logs");
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}

fn ollama_log(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(logs_dir(app)?.join("bundled-ollama.log"))
}

fn app_log(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(logs_dir(app)?.join("modeldock.log"))
}

fn tail(path: &PathBuf, limit: u64) -> Result<BackendLogSnapshot, String> {
    if !path.exists() {
        return Ok(BackendLogSnapshot { path: path.display().to_string(), content: String::new(), size_bytes: 0, truncated: false });
    }
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    let start = size.saturating_sub(limit);
    file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    let mut content = String::from_utf8_lossy(&bytes).to_string();
    if start > 0 {
        if let Some(i) = content.find('\n') { content = content[i + 1..].to_string(); }
    }
    Ok(BackendLogSnapshot { path: path.display().to_string(), content, size_bytes: size, truncated: start > 0 })
}

#[tauri::command]
pub fn bundled_ollama_log(app: AppHandle, max_bytes: Option<u64>) -> Result<BackendLogSnapshot, String> {
    tail(&ollama_log(&app)?, max_bytes.unwrap_or(2 * 1024 * 1024).clamp(64 * 1024, 8 * 1024 * 1024))
}

#[tauri::command]
pub fn modeldock_backend_log(app: AppHandle, max_bytes: Option<u64>) -> Result<BackendLogSnapshot, String> {
    tail(&app_log(&app)?, max_bytes.unwrap_or(1024 * 1024).clamp(64 * 1024, 8 * 1024 * 1024))
}

#[tauri::command]
pub fn append_modeldock_log(app: AppHandle, level: String, message: String) -> Result<(), String> {
    let safe_level = match level.as_str() { "error" => "ERROR", "warn" => "WARN", _ => "INFO" };
    let clean = message.replace(['\r', '\n'], " ");
    let path = app_log(&app)?;
    let mut file = fs::OpenOptions::new().create(true).append(true).open(path).map_err(|e| e.to_string())?;
    writeln!(file, "[{}] {}", safe_level, clean).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_diagnostic_log(app: AppHandle, kind: String) -> Result<(), String> {
    let path = match kind.as_str() { "ollama" => ollama_log(&app)?, "app" => app_log(&app)?, _ => return Err("Unknown diagnostic log kind".into()) };
    fs::File::create(path).map_err(|e| e.to_string())?;
    Ok(())
}
