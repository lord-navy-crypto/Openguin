use futures_util::StreamExt;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OfficialModel {
    name: String,
    description: String,
    capabilities: Vec<String>,
    sizes: Vec<String>,
    source_url: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatStreamEvent {
    request_id: String,
    thinking: String,
    content: String,
    done: bool,
    done_reason: Option<String>,
    total_duration: Option<u64>,
    load_duration: Option<u64>,
    prompt_eval_count: Option<u64>,
    prompt_eval_duration: Option<u64>,
    eval_count: Option<u64>,
    eval_duration: Option<u64>,
    error: Option<String>,
}

fn strip_html(s: &str) -> String {
    let tags = Regex::new(r"(?s)<[^>]+>").unwrap();
    let ws = Regex::new(r"\s+").unwrap();
    let text = tags.replace_all(s, " ");
    let text = text
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    ws.replace_all(text.trim(), " ").to_string()
}

fn parse_catalog(html: &str) -> Vec<OfficialModel> {
    let card = Regex::new(r#"(?s)<a[^>]+href=[\"']/library/([^\"'/?#]+)[\"'][^>]*>(.*?)</a>"#).unwrap();
    let size_re = Regex::new(r"(?i)\b(?:\d+(?:\.\d+)?(?:m|b)|\d+x\d+b)\b").unwrap();
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for cap in card.captures_iter(html) {
        let name = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim();
        if name.is_empty() || name.contains('/') || !seen.insert(name.to_string()) { continue; }
        let text = strip_html(cap.get(2).map(|m| m.as_str()).unwrap_or(""));
        if text.len() < name.len() { continue; }
        let low = text.to_ascii_lowercase();
        let capabilities = ["vision", "tools", "thinking", "embedding", "cloud"]
            .into_iter().filter(|c| low.contains(c)).map(str::to_string).collect::<Vec<_>>();
        let mut sizes = Vec::new();
        for m in size_re.find_iter(&low) {
            let v = m.as_str().to_string();
            if !sizes.contains(&v) { sizes.push(v); }
        }
        let mut description = text.clone();
        if let Some(pos) = description.find(name) { description.replace_range(pos..pos + name.len(), ""); }
        for c in ["vision", "tools", "thinking", "embedding", "cloud"] { description = description.replace(c, ""); }
        description = description.trim().to_string();
        if description.len() > 220 { description.truncate(220); description.push('…'); }
        out.push(OfficialModel {
            name: name.to_string(), description, capabilities, sizes,
            source_url: format!("https://ollama.com/library/{name}"),
        });
        if out.len() >= 80 { break; }
    }
    out
}

#[tauri::command]
pub async fn official_ollama_catalog(sort: Option<String>, query: Option<String>) -> Result<Vec<OfficialModel>, String> {
    let sort = match sort.as_deref() { Some("newest") => "newest", Some("popular") => "popular", _ => "featured" };
    let client = reqwest::Client::builder().timeout(Duration::from_secs(15)).user_agent("Openguin/0.8").build().map_err(|e| e.to_string())?;
    let mut req = client.get("https://ollama.com/library").query(&[("sort", sort)]);
    if let Some(q) = query.as_ref().filter(|q| !q.trim().is_empty()) { req = req.query(&[("q", q.trim())]); }
    let response = req.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Ollama Library returned {}", response.status())); }
    let html = response.text().await.map_err(|e| e.to_string())?;
    let items = parse_catalog(&html);
    if items.is_empty() { return Err("Ollama Library page was reachable but no model cards could be parsed; cached catalog should be used.".into()); }
    Ok(items)
}

#[tauri::command]
pub async fn chat_stream(app: AppHandle, mode: String, request_id: String, mut body: Value) -> Result<(), String> {
    if request_id.len() > 120 { return Err("Invalid request id".into()); }
    if serde_json::to_vec(&body).map_err(|e| e.to_string())?.len() > 2 * 1024 * 1024 { return Err("Chat request is too large".into()); }
    if let Some(obj) = body.as_object_mut() { obj.insert("stream".into(), Value::Bool(true)); }
    let h = super::host(&mode)?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(3600)).build().map_err(|e| e.to_string())?;
    let response = client.post(format!("http://{h}/api/chat")).json(&body).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Ollama chat failed: {}", response.status())); }
    let mut stream = response.bytes_stream();
    let mut pending = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        pending.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = pending.find('\n') {
            let line = pending[..pos].trim().to_string();
            pending = pending[pos + 1..].to_string();
            if line.is_empty() { continue; }
            match serde_json::from_str::<Value>(&line) {
                Ok(v) => {
                    let message = v.get("message");
                    let event = ChatStreamEvent {
                        request_id: request_id.clone(),
                        thinking: message.and_then(|m| m.get("thinking")).and_then(Value::as_str).unwrap_or("").to_string(),
                        content: message.and_then(|m| m.get("content")).and_then(Value::as_str).unwrap_or("").to_string(),
                        done: v.get("done").and_then(Value::as_bool).unwrap_or(false),
                        done_reason: v.get("done_reason").and_then(Value::as_str).map(str::to_string),
                        total_duration: v.get("total_duration").and_then(Value::as_u64),
                        load_duration: v.get("load_duration").and_then(Value::as_u64),
                        prompt_eval_count: v.get("prompt_eval_count").and_then(Value::as_u64),
                        prompt_eval_duration: v.get("prompt_eval_duration").and_then(Value::as_u64),
                        eval_count: v.get("eval_count").and_then(Value::as_u64),
                        eval_duration: v.get("eval_duration").and_then(Value::as_u64),
                        error: v.get("error").and_then(Value::as_str).map(str::to_string),
                    };
                    let _ = app.emit("modeldock://chat-stream", event);
                }
                Err(e) => {
                    let _ = app.emit("modeldock://chat-stream", ChatStreamEvent {
                        request_id: request_id.clone(), thinking: String::new(), content: String::new(), done: false,
                        done_reason: None, total_duration: None, load_duration: None, prompt_eval_count: None,
                        prompt_eval_duration: None, eval_count: None, eval_duration: None,
                        error: Some(format!("Invalid Ollama stream chunk: {e}"))
                    });
                }
            }
        }
    }
    Ok(())
}
