use serde::Serialize;
use std::{fs, net::TcpStream, path::PathBuf, process::Command};
use tauri::{AppHandle, Manager};

const GB: u64 = 1024 * 1024 * 1024;
const MB: u64 = 1024 * 1024;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AdaptiveSystemSnapshot {
    os: String,
    arch: String,
    chip: String,
    total_memory_bytes: u64,
    estimated_available_memory_bytes: u64,
    memory_free_percent: Option<f64>,
    swap_used_bytes: u64,
    free_storage_bytes: u64,
    logical_cores: usize,
    thermal_state: String,
    sensor_quality: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePlan {
    status: String,
    requested_context: u32,
    recommended_context: u32,
    estimated_model_resident_bytes: u64,
    estimated_kv_cache_bytes: u64,
    projected_total_bytes: u64,
    runtime_memory_budget_bytes: u64,
    system_reserve_bytes: u64,
    keep_alive: String,
    unload_other_models: bool,
    control_policy: String,
    reason: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DoctorCheck {
    id: String,
    label: String,
    status: String,
    detail: String,
    repairable: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DoctorReport {
    ok: bool,
    score: u8,
    checks: Vec<DoctorCheck>,
}

fn output(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

fn sysctl_u64(name: &str) -> u64 {
    output("sysctl", &["-n", name])
        .and_then(|v| v.trim().parse::<u64>().ok())
        .unwrap_or(0)
}

fn chip_name() -> String {
    output("sysctl", &["-n", "machdep.cpu.brand_string"])
        .or_else(|| output("sysctl", &["-n", "hw.model"]))
        .unwrap_or_else(|| "Unknown processor".into())
}

fn free_storage_bytes() -> u64 {
    output("df", &["-k", "/"])
        .and_then(|s| {
            s.lines()
                .last()
                .and_then(|line| line.split_whitespace().nth(3))
                .and_then(|v| v.parse::<u64>().ok())
        })
        .unwrap_or(0)
        * 1024
}

fn vm_pages(key: &str) -> u64 {
    output("vm_stat", &[])
        .and_then(|s| {
            s.lines()
                .find(|line| line.trim_start().starts_with(key))
                .and_then(|line| line.split(':').nth(1))
                .map(|v| v.trim().trim_end_matches('.').replace('.', ""))
                .and_then(|v| v.parse::<u64>().ok())
        })
        .unwrap_or(0)
}

fn estimated_available_memory_bytes() -> u64 {
    let page = sysctl_u64("hw.pagesize").max(4096);
    let pages = vm_pages("Pages free")
        + vm_pages("Pages inactive")
        + vm_pages("Pages speculative")
        + vm_pages("Pages purgeable");
    pages.saturating_mul(page)
}

fn memory_free_percent() -> Option<f64> {
    let text = output("memory_pressure", &["-Q"])?;
    text.split_whitespace().find_map(|token| {
        let cleaned = token.trim_matches(|c: char| !c.is_ascii_digit() && c != '.');
        if token.contains('%') {
            cleaned.parse::<f64>().ok()
        } else {
            None
        }
    })
}

fn parse_scaled_bytes(value: &str) -> Option<u64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let unit = trimmed.chars().last()?;
    let number = if unit.is_ascii_alphabetic() {
        &trimmed[..trimmed.len().saturating_sub(1)]
    } else {
        trimmed
    };
    let n = number.parse::<f64>().ok()?;
    let multiplier = match unit.to_ascii_uppercase() {
        'K' => 1024f64,
        'M' => 1024f64.powi(2),
        'G' => 1024f64.powi(3),
        'T' => 1024f64.powi(4),
        _ => 1.0,
    };
    Some((n * multiplier) as u64)
}

fn swap_used_bytes() -> u64 {
    let Some(text) = output("sysctl", &["-n", "vm.swapusage"]) else {
        return 0;
    };
    let tokens = text.split_whitespace().collect::<Vec<_>>();
    for i in 0..tokens.len().saturating_sub(2) {
        if tokens[i] == "used" && tokens[i + 1] == "=" {
            return parse_scaled_bytes(tokens[i + 2]).unwrap_or(0);
        }
    }
    0
}

fn thermal_state() -> String {
    let Some(text) = output("pmset", &["-g", "therm"]) else {
        return "unknown".into();
    };
    let lower = text.to_ascii_lowercase();
    if lower.contains("no thermal warning") {
        return "nominal".into();
    }
    for line in text.lines() {
        if line.contains("CPU_Speed_Limit") {
            if let Some(value) = line.split('=').nth(1).and_then(|v| v.trim().parse::<u32>().ok()) {
                return if value < 100 { "throttled" } else { "nominal" }.into();
            }
        }
    }
    "nominal".into()
}

fn snapshot() -> AdaptiveSystemSnapshot {
    AdaptiveSystemSnapshot {
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        chip: chip_name(),
        total_memory_bytes: sysctl_u64("hw.memsize"),
        estimated_available_memory_bytes: estimated_available_memory_bytes(),
        memory_free_percent: memory_free_percent(),
        swap_used_bytes: swap_used_bytes(),
        free_storage_bytes: free_storage_bytes(),
        logical_cores: std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1),
        thermal_state: thermal_state(),
        sensor_quality: "native-macos-heuristic-v1".into(),
    }
}

fn kv_estimate(model_size_bytes: u64, context: u32) -> u64 {
    let base_at_8k = ((model_size_bytes as f64) * 0.10).max(384.0 * MB as f64);
    let scale = context.max(1024) as f64 / 8192.0;
    (base_at_8k * scale) as u64
}

fn projected_bytes(model_size_bytes: u64, context: u32) -> (u64, u64, u64) {
    let resident = ((model_size_bytes as f64) * 1.18) as u64 + 256 * MB;
    let kv = kv_estimate(model_size_bytes, context);
    let total = resident.saturating_add(kv).saturating_add(384 * MB);
    (resident, kv, total)
}

#[tauri::command]
pub fn adaptive_system_snapshot() -> AdaptiveSystemSnapshot {
    snapshot()
}

#[tauri::command]
pub fn adaptive_runtime_plan(
    model_size_bytes: u64,
    requested_context: Option<u32>,
    workload: Option<String>,
    profile: Option<String>,
) -> RuntimePlan {
    let snap = snapshot();
    let total = snap.total_memory_bytes.max(8 * GB);
    let reserve = (total / 4).max(3 * GB);
    let raw_budget = total.saturating_sub(reserve);
    let profile_name = profile.unwrap_or_else(|| "balanced".into()).to_ascii_lowercase();
    let policy_ratio = match profile_name.as_str() {
        "safe" => 0.82,
        "maximum" | "max" => 0.96,
        _ => 0.90,
    };
    let budget = ((raw_budget as f64) * policy_ratio) as u64;

    let workload_name = workload.unwrap_or_else(|| "general".into()).to_ascii_lowercase();
    let workload_target = if workload_name.contains("long") || workload_name.contains("research") {
        32768
    } else if workload_name.contains("code") {
        16384
    } else {
        8192
    };
    let requested = requested_context.unwrap_or(workload_target).clamp(2048, 65536);

    let candidates = [2048u32, 4096, 8192, 16384, 32768, 65536];
    let mut recommended = 2048u32;
    for ctx in candidates {
        let (_, _, projected) = projected_bytes(model_size_bytes.max(256 * MB), ctx);
        if projected <= budget {
            recommended = ctx;
        }
    }

    let requested_projected = projected_bytes(model_size_bytes.max(256 * MB), requested).2;
    let chosen = if requested_projected <= budget {
        requested
    } else {
        recommended
    };
    let (resident, kv, projected) = projected_bytes(model_size_bytes.max(256 * MB), chosen);

    let pressure_low = snap.memory_free_percent.is_some_and(|p| p < 15.0);
    let swap_high = snap.swap_used_bytes > 512 * MB;
    let unload_other_models = pressure_low || swap_high || resident > budget.saturating_mul(60) / 100;
    let keep_alive = if unload_other_models {
        "0"
    } else if profile_name == "safe" {
        "2m"
    } else {
        "5m"
    };
    let status = if projected <= budget.saturating_mul(75) / 100 {
        "safe"
    } else if projected <= budget {
        "balanced"
    } else {
        "constrained"
    };

    RuntimePlan {
        status: status.into(),
        requested_context: requested,
        recommended_context: chosen,
        estimated_model_resident_bytes: resident,
        estimated_kv_cache_bytes: kv,
        projected_total_bytes: projected,
        runtime_memory_budget_bytes: budget,
        system_reserve_bytes: reserve,
        keep_alive: keep_alive.into(),
        unload_other_models,
        control_policy: format!("{} / {}", profile_name, workload_name),
        reason: format!(
            "Heuristic hardware-fit controller: reserve {:.1} GB for macOS, fit model + KV cache inside a {:.0}% runtime budget, and reduce context when the requested window would exceed that budget.",
            reserve as f64 / GB as f64,
            policy_ratio * 100.0
        ),
    }
}

fn check(id: &str, label: &str, status: &str, detail: String, repairable: bool) -> DoctorCheck {
    DoctorCheck {
        id: id.into(),
        label: label.into(),
        status: status.into(),
        detail,
        repairable,
    }
}

fn private_runtime_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(data) = app.path().app_data_dir() {
        paths.push(data.join("ollama-runtime/ollama"));
    }
    if let Ok(resources) = app.path().resource_dir() {
        paths.push(resources.join("ollama-runtime/ollama"));
    }
    paths
}

#[tauri::command]
pub fn penguin_doctor(app: AppHandle) -> DoctorReport {
    let snap = snapshot();
    let mut checks = Vec::new();

    checks.push(check(
        "platform",
        "macOS platform",
        if snap.os == "macos" { "pass" } else { "fail" },
        format!("{} / {}", snap.os, snap.arch),
        false,
    ));
    checks.push(check(
        "apple-silicon",
        "Apple Silicon path",
        if snap.arch == "aarch64" { "pass" } else { "warn" },
        if snap.arch == "aarch64" {
            "Native arm64 runtime path available.".into()
        } else {
            "Non-arm64 build detected; acceleration assumptions should be reviewed.".into()
        },
        false,
    ));
    checks.push(check(
        "memory",
        "Unified memory headroom",
        if snap.total_memory_bytes >= 16 * GB {
            "pass"
        } else if snap.total_memory_bytes >= 8 * GB {
            "warn"
        } else {
            "fail"
        },
        format!("{:.1} GB total memory", snap.total_memory_bytes as f64 / GB as f64),
        false,
    ));
    checks.push(check(
        "storage",
        "Model storage headroom",
        if snap.free_storage_bytes >= 15 * GB {
            "pass"
        } else if snap.free_storage_bytes >= 6 * GB {
            "warn"
        } else {
            "fail"
        },
        format!("{:.1} GB free on system volume", snap.free_storage_bytes as f64 / GB as f64),
        true,
    ));

    let runtime = private_runtime_candidates(&app)
        .into_iter()
        .find(|p| p.is_file());
    checks.push(check(
        "private-runtime",
        "Private Ollama runtime",
        if runtime.is_some() { "pass" } else { "warn" },
        runtime
            .map(|p| format!("Found {}", p.display()))
            .unwrap_or_else(|| "Private runtime not found; Overview repair can install it.".into()),
        true,
    ));

    let bundled_running = TcpStream::connect("127.0.0.1:11435").is_ok();
    checks.push(check(
        "runtime-port",
        "Private runtime service",
        if bundled_running { "pass" } else { "warn" },
        if bundled_running {
            "127.0.0.1:11435 is accepting connections.".into()
        } else {
            "Private runtime is not currently listening on 127.0.0.1:11435.".into()
        },
        true,
    ));

    let data_write = app
        .path()
        .app_data_dir()
        .ok()
        .and_then(|p| fs::create_dir_all(&p).ok().map(|_| p))
        .is_some();
    checks.push(check(
        "app-data",
        "Application data directory",
        if data_write { "pass" } else { "fail" },
        if data_write {
            "Openguin can create and manage its application-data directory.".into()
        } else {
            "Openguin could not prepare its application-data directory.".into()
        },
        true,
    ));

    let pass = checks.iter().filter(|c| c.status == "pass").count();
    let fail = checks.iter().filter(|c| c.status == "fail").count();
    let score = ((pass as f64 / checks.len().max(1) as f64) * 100.0).round() as u8;
    DoctorReport {
        ok: fail == 0,
        score,
        checks,
    }
}
