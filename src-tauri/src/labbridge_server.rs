use axum::{
    extract::{DefaultBodyLimit, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::infrastructure::{
    context_policy, policy_descriptors, unix_ms, ContextPolicy, InfrastructureState,
    RecentRequestMetadata, DEFAULT_TIMEOUT_MS, ENGINEERING_CONTEXT, GENERIC_API_VERSION,
    LABBRIDGE_API_VERSION, MAX_ANSWER_CHARS, MAX_CONTEXT_BYTES, MAX_INFLIGHT_ADVISORIES,
    MAX_QUESTION_CHARS, MAX_REQUEST_BYTES, MAX_TIMEOUT_MS, MIN_TIMEOUT_MS, SENTINEL_CONTEXT,
};

pub const LABBRIDGE_HOST: &str = "127.0.0.1:11436";
const OLLAMA_HOST: &str = "127.0.0.1:11435";
static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Serialize)]
struct Capabilities {
    api_version: &'static str,
    service: &'static str,
    service_version: &'static str,
    runtime_base: &'static str,
    models: Vec<String>,
    loaded_models: Vec<String>,
    capabilities: Vec<&'static str>,
    accepted_context_schemas: Vec<&'static str>,
    advisory_only: bool,
    limits: Value,
}

#[derive(Deserialize, Serialize, Clone, Default)]
struct ClientIdentity {
    #[serde(default)]
    app_id: String,
    #[serde(default)]
    app_version: String,
    #[serde(default)]
    instance_id: String,
}

#[derive(Serialize)]
struct ResolvedClientIdentity {
    app_id: String,
    app_version: String,
    instance_id: String,
    inferred: bool,
}

#[derive(Deserialize)]
struct AdvisoryRequest {
    #[serde(default)]
    api_version: String,
    #[serde(default)]
    client: ClientIdentity,
    context: Value,
    question: String,
    #[serde(default)]
    model: String,
    #[serde(default = "default_temperature")]
    temperature: f64,
    #[serde(default)]
    requested_response_schema: String,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

#[derive(Serialize)]
struct AdvisoryResponse {
    api_version: &'static str,
    schema: &'static str,
    request_id: String,
    client: ResolvedClientIdentity,
    policy_id: &'static str,
    authority: &'static str,
    answer: String,
    model: String,
    model_route: &'static str,
    runtime: &'static str,
    source_context_schema: String,
    context_packet_id: Option<String>,
    elapsed_ms: u64,
    effective_timeout_ms: u64,
    executed: bool,
    advisory_only: bool,
    mutation_authority: bool,
    boundary: &'static str,
}

#[derive(Serialize, Default)]
struct RuntimeInventory {
    reachable: bool,
    version: Option<String>,
    models: Vec<String>,
    loaded_models: Vec<String>,
}

fn default_temperature() -> f64 { 0.2 }

fn request_id() -> String {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let seq = REQUEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("opg-{millis}-{seq}")
}

fn error_response(status: StatusCode, message: impl Into<String>) -> (StatusCode, Json<Value>) {
    (status, Json(json!({
        "error": message.into(),
        "executed": false,
        "advisory_only": true,
        "mutation_authority": false
    })))
}

fn bad_request(message: impl Into<String>) -> (StatusCode, Json<Value>) {
    error_response(StatusCode::BAD_REQUEST, message)
}

fn busy_response() -> (StatusCode, Json<Value>) {
    error_response(StatusCode::SERVICE_UNAVAILABLE, "OpenPenguin advisory capacity is busy; retry later or use the source product's local fallback")
}

fn limits() -> Value {
    json!({
        "max_context_bytes": MAX_CONTEXT_BYTES,
        "max_question_chars": MAX_QUESTION_CHARS,
        "max_answer_chars": MAX_ANSWER_CHARS,
        "max_inflight_advisories": MAX_INFLIGHT_ADVISORIES,
        "min_timeout_ms": MIN_TIMEOUT_MS,
        "max_timeout_ms": MAX_TIMEOUT_MS,
        "default_timeout_ms": DEFAULT_TIMEOUT_MS,
        "loopback_only": true
    })
}

async fn get_json(path: &str, timeout_ms: u64) -> Option<Value> {
    let client = reqwest::Client::builder().timeout(Duration::from_millis(timeout_ms)).build().ok()?;
    let response = client.get(format!("http://{OLLAMA_HOST}{path}")).send().await.ok()?;
    if !response.status().is_success() { return None; }
    response.json::<Value>().await.ok()
}

fn model_names(value: Option<&Value>) -> Vec<String> {
    let mut models = value
        .and_then(|v| v.get("models"))
        .and_then(Value::as_array)
        .into_iter().flatten()
        .filter_map(|item| item.get("name").or_else(|| item.get("model")).and_then(Value::as_str))
        .map(str::to_owned)
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    models
}

async fn runtime_inventory() -> RuntimeInventory {
    let version_value = get_json("/api/version", 1200).await;
    if version_value.is_none() { return RuntimeInventory::default(); }
    let tags = get_json("/api/tags", 1600).await;
    let loaded = get_json("/api/ps", 1600).await;
    RuntimeInventory {
        reachable: true,
        version: version_value.as_ref().and_then(|v| v.get("version")).and_then(Value::as_str).map(str::to_owned),
        models: model_names(tags.as_ref()),
        loaded_models: model_names(loaded.as_ref()),
    }
}

async fn generic_capabilities() -> Json<Capabilities> {
    let inventory = runtime_inventory().await;
    Json(Capabilities {
        api_version: GENERIC_API_VERSION,
        service: "OpenPenguin Local AI Infrastructure",
        service_version: env!("CARGO_PKG_VERSION"),
        runtime_base: "http://127.0.0.1:11435",
        models: inventory.models,
        loaded_models: inventory.loaded_models,
        capabilities: vec![
            "text-advisory",
            "bounded-structured-context",
            "read-only-advisory",
            "client-identity",
            "context-policy-registry",
            "request-tracing",
            "advisory-capacity-governance",
            "runtime-health",
            "auto-model-routing",
            "privacy-preserving-request-history",
            ENGINEERING_CONTEXT,
            "labbridge.ai-suggestion/v1",
            SENTINEL_CONTEXT,
        ],
        accepted_context_schemas: vec![ENGINEERING_CONTEXT, SENTINEL_CONTEXT],
        advisory_only: true,
        limits: limits(),
    })
}

async fn labbridge_capabilities() -> Json<Capabilities> {
    let inventory = runtime_inventory().await;
    Json(Capabilities {
        api_version: LABBRIDGE_API_VERSION,
        service: "OpenPenguin LabBridge",
        service_version: env!("CARGO_PKG_VERSION"),
        runtime_base: "http://127.0.0.1:11435",
        models: inventory.models,
        loaded_models: inventory.loaded_models,
        capabilities: vec![
            "text-advisory",
            ENGINEERING_CONTEXT,
            "labbridge.ai-suggestion/v1",
            "read-only-scientific-advisory",
            "request-tracing",
            "advisory-capacity-governance",
            "runtime-health",
            "auto-model-routing",
        ],
        accepted_context_schemas: vec![ENGINEERING_CONTEXT],
        advisory_only: true,
        limits: limits(),
    })
}

fn validate_client(client: &ClientIdentity, policy: ContextPolicy) -> Result<ResolvedClientIdentity, (StatusCode, Json<Value>)> {
    for value in [&client.app_id, &client.app_version, &client.instance_id] {
        if value.len() > 180 || value.chars().any(|c| c.is_control()) {
            return Err(bad_request("client identity fields must be at most 180 characters and contain no control characters"));
        }
    }
    let inferred = client.app_id.trim().is_empty();
    Ok(ResolvedClientIdentity {
        app_id: if inferred { policy.suggested_app_id.to_string() } else { client.app_id.trim().to_string() },
        app_version: client.app_version.trim().to_string(),
        instance_id: client.instance_id.trim().to_string(),
        inferred,
    })
}

fn validate_request(req: &AdvisoryRequest, accepted_api_versions: &[&str]) -> Result<(String, ContextPolicy, ResolvedClientIdentity, u64), (StatusCode, Json<Value>)> {
    if !req.api_version.is_empty() && !accepted_api_versions.contains(&req.api_version.as_str()) {
        return Err(bad_request("unsupported OpenPenguin API version"));
    }
    let schema = req.context.get("schema").and_then(Value::as_str).unwrap_or("").to_string();
    let policy = context_policy(&schema).ok_or_else(|| bad_request("unsupported context.schema"))?;
    let client = validate_client(&req.client, policy)?;
    let context_bytes = serde_json::to_vec(&req.context).map_err(|_| bad_request("context is not serializable"))?;
    if context_bytes.len() > MAX_CONTEXT_BYTES {
        return Err(error_response(StatusCode::PAYLOAD_TOO_LARGE, "context exceeds OpenPenguin 1 MiB limit"));
    }
    let question = req.question.trim();
    if question.is_empty() || question.chars().count() > MAX_QUESTION_CHARS {
        return Err(bad_request("question must be 1..20000 characters"));
    }
    let model = req.model.trim();
    if model.len() > 180 || model.chars().any(|c| c.is_control()) {
        return Err(bad_request("invalid model name"));
    }
    if !req.temperature.is_finite() || !(0.0..=2.0).contains(&req.temperature) {
        return Err(bad_request("temperature must be finite and within 0..2"));
    }
    let timeout_ms = req.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS).clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    Ok((schema, policy, client, timeout_ms))
}

async fn resolve_model(requested: &str) -> Result<(String, &'static str), (StatusCode, Json<Value>)> {
    let requested = requested.trim();
    if !requested.is_empty() && !requested.eq_ignore_ascii_case("auto") {
        return Ok((requested.to_string(), "explicit"));
    }
    let inventory = runtime_inventory().await;
    if !inventory.reachable {
        return Err(error_response(StatusCode::SERVICE_UNAVAILABLE, "OpenPenguin private runtime is unavailable"));
    }
    if let Some(model) = inventory.loaded_models.first() { return Ok((model.clone(), "loaded-first")); }
    if let Some(model) = inventory.models.first() { return Ok((model.clone(), "installed-first")); }
    Err(error_response(StatusCode::SERVICE_UNAVAILABLE, "no OpenPenguin model is installed; install a model or provide an explicit available model"))
}

async fn run_advisory(req: AdvisoryRequest, accepted_api_versions: &[&str], response_api_version: &'static str) -> Result<Json<AdvisoryResponse>, (StatusCode, Json<Value>)> {
    let started = Instant::now();
    let (schema, policy, client_identity, timeout_ms) = validate_request(&req, accepted_api_versions)?;
    let (model, model_route) = resolve_model(&req.model).await?;
    let context_text = serde_json::to_string(&req.context).map_err(|_| bad_request("context serialization failed"))?;
    let user = format!("{}:\n{}\n\nUser question:\n{}", policy.context_label, context_text, req.question.trim());
    let body = json!({
        "model": model,
        "stream": false,
        "messages": [
            {"role":"system","content":policy.system_prompt},
            {"role":"user","content":user}
        ],
        "options": {"temperature": req.temperature}
    });

    let http = reqwest::Client::builder().timeout(Duration::from_millis(timeout_ms)).build()
        .map_err(|e| error_response(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let response = http.post(format!("http://{OLLAMA_HOST}/api/chat")).json(&body).send().await
        .map_err(|e| error_response(StatusCode::SERVICE_UNAVAILABLE, format!("private Ollama runtime unavailable or timed out: {e}")))?;
    let status = response.status();
    let value = response.json::<Value>().await
        .map_err(|e| error_response(StatusCode::BAD_GATEWAY, format!("invalid runtime JSON: {e}")))?;
    if !status.is_success() {
        return Err((StatusCode::BAD_GATEWAY, Json(json!({
            "error":"private Ollama advisory request failed",
            "runtime_status":status.as_u16(),
            "executed":false,
            "advisory_only":true,
            "mutation_authority":false
        }))));
    }
    let answer = value.get("message").and_then(|v| v.get("content")).and_then(Value::as_str)
        .or_else(|| value.get("response").and_then(Value::as_str)).unwrap_or("").trim().to_string();
    if answer.is_empty() {
        return Err(error_response(StatusCode::BAD_GATEWAY, "private Ollama returned an empty advisory"));
    }
    let answer = answer.chars().take(MAX_ANSWER_CHARS).collect::<String>();
    let context_packet_id = req.context.get("packet_id").and_then(Value::as_str).map(str::to_owned);
    Ok(Json(AdvisoryResponse {
        api_version: response_api_version,
        schema: "openguin.local-advisory-response/v1",
        request_id: request_id(),
        client: client_identity,
        policy_id: policy.id,
        authority: policy.authority,
        answer,
        model,
        model_route,
        runtime: "private-ollama-11435",
        source_context_schema: schema,
        context_packet_id,
        elapsed_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
        effective_timeout_ms: timeout_ms,
        executed: false,
        advisory_only: true,
        mutation_authority: false,
        boundary: "Advisory only. The source product remains authoritative and must explicitly approve any action.",
    }))
}

async fn governed_advisory(state: Arc<InfrastructureState>, req: AdvisoryRequest, accepted_api_versions: &[&str], response_api_version: &'static str) -> Result<Json<AdvisoryResponse>, (StatusCode, Json<Value>)> {
    let permit = state.try_begin().ok_or_else(busy_response)?;
    let started = Instant::now();
    let started_at_unix_ms = unix_ms();
    let requested_app = req.client.app_id.clone();
    let requested_schema = req.context.get("schema").and_then(Value::as_str).unwrap_or("").to_string();
    let requested_model = req.model.clone();
    let result = run_advisory(req, accepted_api_versions, response_api_version).await;
    state.finish(result.is_ok());
    match &result {
        Ok(Json(response)) => state.record_request(RecentRequestMetadata {
            request_id: response.request_id.clone(),
            started_at_unix_ms,
            app_id: response.client.app_id.clone(),
            context_schema: response.source_context_schema.clone(),
            policy_id: response.policy_id.to_string(),
            model: response.model.clone(),
            model_route: response.model_route.to_string(),
            elapsed_ms: response.elapsed_ms,
            success: true,
            outcome: "ok".into(),
        }),
        Err((status, _)) => state.record_request(RecentRequestMetadata {
            request_id: request_id(),
            started_at_unix_ms,
            app_id: if requested_app.trim().is_empty() { context_policy(&requested_schema).map(|p| p.suggested_app_id).unwrap_or("unknown").to_string() } else { requested_app },
            context_schema: requested_schema.clone(),
            policy_id: context_policy(&requested_schema).map(|p| p.id).unwrap_or("unknown-policy").to_string(),
            model: if requested_model.trim().is_empty() { "auto".into() } else { requested_model },
            model_route: "unresolved".into(),
            elapsed_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
            success: false,
            outcome: format!("http-{}", status.as_u16()),
        }),
    }
    drop(permit);
    result
}

async fn generic_advisory(State(state): State<Arc<InfrastructureState>>, Json(req): Json<AdvisoryRequest>) -> Result<Json<AdvisoryResponse>, (StatusCode, Json<Value>)> {
    governed_advisory(state, req, &[GENERIC_API_VERSION], GENERIC_API_VERSION).await
}

async fn labbridge_advisory(State(state): State<Arc<InfrastructureState>>, Json(mut req): Json<AdvisoryRequest>) -> Result<Json<AdvisoryResponse>, (StatusCode, Json<Value>)> {
    if req.context.get("schema").and_then(Value::as_str) != Some(ENGINEERING_CONTEXT) {
        return Err(bad_request("context.schema must be labbridge.ai-context/v1"));
    }
    if !req.requested_response_schema.is_empty() && req.requested_response_schema != "labbridge.ai-suggestion/v1" {
        return Err(bad_request("unsupported requested_response_schema"));
    }
    if req.api_version.is_empty() { req.api_version = LABBRIDGE_API_VERSION.to_string(); }
    governed_advisory(state, req, &[LABBRIDGE_API_VERSION], LABBRIDGE_API_VERSION).await
}

async fn generic_health() -> Json<Value> {
    let inventory = runtime_inventory().await;
    Json(json!({
        "service": "OpenPenguin Local AI Infrastructure",
        "api_version": GENERIC_API_VERSION,
        "status": if inventory.reachable { "ok" } else { "degraded" },
        "runtime": {"reachable": inventory.reachable, "version": inventory.version},
        "advisory_only": true,
        "loopback_only": true
    }))
}

async fn generic_status(State(state): State<Arc<InfrastructureState>>) -> Json<Value> {
    let inventory = runtime_inventory().await;
    Json(json!({
        "service": "OpenPenguin Local AI Infrastructure",
        "api_version": GENERIC_API_VERSION,
        "infrastructure": state.snapshot(),
        "runtime": inventory,
        "policies": policy_descriptors(),
        "advisory_only": true,
        "mutation_authority": false
    }))
}

async fn generic_policies() -> Json<Value> {
    Json(json!({
        "api_version": GENERIC_API_VERSION,
        "policies": policy_descriptors(),
        "rule": "Context policies define interpretation boundaries; they never transfer source-product authority to OpenPenguin."
    }))
}

async fn generic_recent_requests(State(state): State<Arc<InfrastructureState>>) -> Json<Value> {
    Json(json!({
        "api_version": GENERIC_API_VERSION,
        "retention": "memory-only-last-64",
        "metadata_only": true,
        "stores_question": false,
        "stores_context": false,
        "stores_answer": false,
        "requests": state.recent_requests()
    }))
}

async fn labbridge_health() -> Json<Value> {
    let inventory = runtime_inventory().await;
    Json(json!({
        "service": "OpenPenguin LabBridge",
        "api_version": LABBRIDGE_API_VERSION,
        "status": if inventory.reachable { "ok" } else { "degraded" },
        "runtime_reachable": inventory.reachable,
        "advisory_only": true,
        "loopback_only": true
    }))
}

pub async fn serve() {
    let state = Arc::new(InfrastructureState::new());
    let app = Router::new()
        .route("/v1/health", get(generic_health))
        .route("/v1/status", get(generic_status))
        .route("/v1/policies", get(generic_policies))
        .route("/v1/requests/recent", get(generic_recent_requests))
        .route("/v1/capabilities", get(generic_capabilities))
        .route("/v1/advisory", post(generic_advisory))
        .route("/labbridge/v1/health", get(labbridge_health))
        .route("/labbridge/v1/capabilities", get(labbridge_capabilities))
        .route("/labbridge/v1/advisory", post(labbridge_advisory))
        .layer(DefaultBodyLimit::max(MAX_REQUEST_BYTES))
        .with_state(state);
    let addr: SocketAddr = LABBRIDGE_HOST.parse().expect("valid OpenPenguin loopback address");
    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
            if let Err(error) = axum::serve(listener, app).await {
                eprintln!("OpenPenguin local AI infrastructure stopped: {error}");
            }
        }
        Err(error) => eprintln!("OpenPenguin local AI infrastructure could not bind {LABBRIDGE_HOST}: {error}"),
    }
}
