use reqwest::Client;
use serde::Serialize;
use std::{
    env,
    process::Command,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::{net::lookup_host, time::timeout};

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn command_output(command: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(command).args(args).output().ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsCheck {
    host: String,
    resolved: bool,
    elapsed_ms: u128,
    address_count: usize,
    error: Option<String>,
}

async fn check_dns(host: &str) -> DnsCheck {
    let started = Instant::now();
    match timeout(Duration::from_secs(4), lookup_host((host, 443))).await {
        Ok(Ok(addresses)) => {
            let address_count = addresses.count();
            DnsCheck {
                host: host.into(),
                resolved: address_count > 0,
                elapsed_ms: started.elapsed().as_millis(),
                address_count,
                error: if address_count == 0 { Some("No addresses returned".into()) } else { None },
            }
        }
        Ok(Err(error)) => DnsCheck {
            host: host.into(),
            resolved: false,
            elapsed_ms: started.elapsed().as_millis(),
            address_count: 0,
            error: Some(error.to_string()),
        },
        Err(_) => DnsCheck {
            host: host.into(),
            resolved: false,
            elapsed_ms: started.elapsed().as_millis(),
            address_count: 0,
            error: Some("DNS lookup timed out after 4 seconds".into()),
        },
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointCheck {
    name: String,
    host: String,
    reachable: bool,
    status: Option<u16>,
    elapsed_ms: Option<u128>,
    error: Option<String>,
}

async fn check_endpoint(client: &Client, name: &str, host: &str, url: &str) -> EndpointCheck {
    let started = Instant::now();
    match timeout(
        Duration::from_secs(9),
        client.get(url).header("Cache-Control", "no-cache").send(),
    )
    .await
    {
        Ok(Ok(response)) => EndpointCheck {
            name: name.into(),
            host: host.into(),
            reachable: true,
            status: Some(response.status().as_u16()),
            elapsed_ms: Some(started.elapsed().as_millis()),
            error: None,
        },
        Ok(Err(error)) => EndpointCheck {
            name: name.into(),
            host: host.into(),
            reachable: false,
            status: None,
            elapsed_ms: Some(started.elapsed().as_millis()),
            error: Some(if error.is_timeout() { "Request timed out".into() } else { error.to_string() }),
        },
        Err(_) => EndpointCheck {
            name: name.into(),
            host: host.into(),
            reachable: false,
            status: None,
            elapsed_ms: Some(started.elapsed().as_millis()),
            error: Some("Request timed out after 9 seconds".into()),
        },
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxySummary {
    environment_configured: bool,
    system_configured: bool,
}

fn proxy_summary() -> ProxySummary {
    let environment_configured = [
        "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
        "http_proxy", "https_proxy", "all_proxy",
    ]
    .iter()
    .any(|key| env::var_os(key).is_some_and(|value| !value.is_empty()));

    let system_configured = command_output("scutil", &["--proxy"])
        .map(|text| {
            text.lines().any(|line| {
                let Some((key, value)) = line.split_once(':') else { return false };
                matches!(
                    key.trim(),
                    "HTTPEnable" | "HTTPSEnable" | "SOCKSEnable" | "ProxyAutoConfigEnable"
                ) && value.trim() == "1"
            })
        })
        .unwrap_or(false);

    ProxySummary { environment_configured, system_configured }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteSummary {
    default_interface: Option<String>,
    vpn_interfaces: Vec<String>,
    vpn_likely: bool,
}

fn route_summary() -> RouteSummary {
    let default_interface = command_output("route", &["-n", "get", "default"]).and_then(|text| {
        text.lines().find_map(|line| {
            let (key, value) = line.split_once(':')?;
            (key.trim() == "interface").then(|| value.trim().to_string())
        })
    });

    let interface_text = command_output("ifconfig", &["-l"])
        .or_else(|| command_output("ip", &["-o", "link", "show"]))
        .unwrap_or_default();

    let vpn_interfaces: Vec<String> = interface_text
        .split_whitespace()
        .map(|part| part.trim_matches(':'))
        .filter(|name| {
            let name = name.to_ascii_lowercase();
            name.starts_with("utun")
                || name.starts_with("tun")
                || name.starts_with("tap")
                || name.starts_with("wg")
                || name.starts_with("ppp")
                || name.starts_with("ipsec")
        })
        .map(str::to_string)
        .collect();

    let default_is_tunnel = default_interface.as_deref().is_some_and(|name| {
        let name = name.to_ascii_lowercase();
        name.starts_with("utun")
            || name.starts_with("tun")
            || name.starts_with("tap")
            || name.starts_with("wg")
            || name.starts_with("ppp")
            || name.starts_with("ipsec")
    });

    RouteSummary {
        default_interface,
        vpn_likely: default_is_tunnel || !vpn_interfaces.is_empty(),
        vpn_interfaces,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSnapshot {
    captured_at_ms: u128,
    os: String,
    dns: Vec<DnsCheck>,
    endpoints: Vec<EndpointCheck>,
    proxy: ProxySummary,
    route: RouteSummary,
    hints: Vec<String>,
}

#[tauri::command]
pub async fn run_network_diagnostics() -> Result<NetworkSnapshot, String> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(10))
        .user_agent("Openguin-Network-Observatory/0.1")
        .build()
        .map_err(|error| error.to_string())?;

    let (chatgpt_dns, auth_dns, github_dns, speed_dns) = tokio::join!(
        check_dns("chatgpt.com"),
        check_dns("auth.openai.com"),
        check_dns("github.com"),
        check_dns("speed.cloudflare.com")
    );
    let (chatgpt, auth, github) = tokio::join!(
        check_endpoint(&client, "ChatGPT", "chatgpt.com", "https://chatgpt.com/"),
        check_endpoint(&client, "OpenAI authentication", "auth.openai.com", "https://auth.openai.com/"),
        check_endpoint(&client, "GitHub control", "github.com", "https://github.com/")
    );

    let dns = vec![chatgpt_dns, auth_dns, github_dns, speed_dns];
    let endpoints = vec![chatgpt, auth, github];
    let proxy = proxy_summary();
    let route = route_summary();
    let mut hints = Vec::new();

    if dns.iter().all(|check| !check.resolved) {
        hints.push("All sampled DNS lookups failed. First reconnect the active network or VPN, then repeat the test. If it still fails, compare once with the VPN off and inspect the VPN app's DNS setting; record the original setting before changing anything.".into());
    } else if dns.iter().any(|check| !check.resolved) {
        hints.push("Some DNS lookups failed while others succeeded. This points more toward domain-specific DNS, filtering, split-tunnel rules, or routing than a complete internet outage. Compare the same domains with the VPN off.".into());
    }

    if endpoints.iter().any(|check| !check.reachable) {
        hints.push("At least one HTTPS connection failed before an HTTP status was received. If DNS resolved, suspect a route/tunnel, TLS, firewall, or endpoint reachability issue before changing DNS. Repeat the same test with VPN on and off.".into());
    }
    if dns.iter().all(|check| check.resolved)
        && endpoints.iter().all(|check| check.reachable && check.status.is_some_and(|status| status < 400))
    {
        hints.push("All sampled DNS lookups resolved and the sampled HTTPS endpoints returned successful HTTP responses. This does not rule out intermittent or page-specific failures.".into());
    }
    if endpoints.iter().any(|check| matches!(check.status, Some(401 | 403 | 429))) {
        hints.push("A 401, 403, or 429 means the server answered but denied, challenged, or rate-limited the request. If this occurs only with VPN on, test a different VPN exit location or protocol; do not treat it as proof of low bandwidth.".into());
    }
    if proxy.environment_configured || proxy.system_configured {
        hints.push("A proxy configuration signal was detected. Check whether the VPN app and system/browser proxy settings are both routing traffic; avoid disabling security controls blindly. Proxy addresses and credentials are intentionally not displayed.".into());
    }
    if route.vpn_likely {
        hints.push("A VPN-like interface or default route was detected, but split tunneling may still route some domains outside the tunnel. For calibration, change one setting at a time (nearby exit server or VPN protocol), rerun the same tests, and keep the best repeatable result.".into());
    } else {
        hints.push("No obvious VPN interface was detected. Some VPNs use system network extensions or app-specific proxies, so confirm the connection state in the VPN app before drawing a conclusion.".into());
    }
    if hints.is_empty() {
        hints.push("The sampled DNS and HTTPS checks completed. If one web page still stalls, use the browser extension to inspect page-level errors.".into());
    }
    hints.push("For a fair VPN comparison, run the same tests once with VPN on and once with VPN off. Openguin will not change VPN, proxy, DNS, or routing settings automatically.".into());

    Ok(NetworkSnapshot {
        captured_at_ms: now_ms(),
        os: env::consts::OS.into(),
        dns,
        endpoints,
        proxy,
        route,
        hints,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestResult {
    captured_at_ms: u128,
    provider: String,
    latency_ms: Option<f64>,
    jitter_ms: Option<f64>,
    probe_failures: u8,
    probe_count: u8,
    download_bytes: u64,
    upload_bytes: u64,
    download_mbps: Option<f64>,
    upload_mbps: Option<f64>,
    download_ms: Option<u128>,
    upload_ms: Option<u128>,
    download_error: Option<String>,
    upload_error: Option<String>,
}

fn mbps(bytes: u64, elapsed_ms: u128) -> Option<f64> {
    (elapsed_ms > 0).then(|| bytes as f64 * 8.0 / (elapsed_ms as f64 / 1000.0) / 1_000_000.0)
}

#[tauri::command]
pub async fn run_network_speed_test() -> Result<SpeedTestResult, String> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(45))
        .user_agent("Openguin-Network-Observatory/0.1")
        .build()
        .map_err(|error| error.to_string())?;

    let mut result = SpeedTestResult {
        captured_at_ms: now_ms(),
        provider: "Cloudflare speed test endpoint".into(),
        latency_ms: None,
        jitter_ms: None,
        probe_failures: 0,
        probe_count: 5,
        download_bytes: 0,
        upload_bytes: 0,
        download_mbps: None,
        upload_mbps: None,
        download_ms: None,
        upload_ms: None,
        download_error: None,
        upload_error: None,
    };

    let mut probes = Vec::<f64>::new();
    for _ in 0..5 {
        let started = Instant::now();
        match timeout(
            Duration::from_secs(5),
            client.get("https://www.cloudflare.com/cdn-cgi/trace")
                .header("Cache-Control", "no-cache")
                .send(),
        ).await {
            Ok(Ok(response)) if response.status().is_success() => {
                probes.push(started.elapsed().as_secs_f64() * 1000.0);
            }
            _ => result.probe_failures += 1,
        }
    }
    if !probes.is_empty() {
        result.latency_ms = Some(probes.iter().sum::<f64>() / probes.len() as f64);
        if probes.len() > 1 {
            result.jitter_ms = Some(
                probes.windows(2).map(|pair| (pair[1] - pair[0]).abs()).sum::<f64>()
                    / (probes.len() - 1) as f64,
            );
        }
    }

    let started = Instant::now();
    match client.get("https://speed.cloudflare.com/__down?bytes=10000000").send().await {
        Ok(response) if response.status().is_success() => match response.bytes().await {
            Ok(bytes) => {
                result.download_bytes = bytes.len() as u64;
                result.download_ms = Some(started.elapsed().as_millis());
                result.download_mbps = mbps(result.download_bytes, result.download_ms.unwrap_or(0));
            }
            Err(error) => result.download_error = Some(error.to_string()),
        },
        Ok(response) => result.download_error = Some(format!("Download endpoint returned HTTP {}", response.status())),
        Err(error) => result.download_error = Some(if error.is_timeout() { "Download test timed out".into() } else { error.to_string() }),
    }

    let upload = vec![0x5Au8; 3 * 1024 * 1024];
    let upload_len = upload.len() as u64;
    let started = Instant::now();
    match client
        .post("https://speed.cloudflare.com/__up")
        .header("Content-Type", "application/octet-stream")
        .body(upload)
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => match response.bytes().await {
            Ok(_) => {
                result.upload_bytes = upload_len;
                result.upload_ms = Some(started.elapsed().as_millis());
                result.upload_mbps = mbps(result.upload_bytes, result.upload_ms.unwrap_or(0));
            }
            Err(error) => result.upload_error = Some(error.to_string()),
        },
        Ok(response) => result.upload_error = Some(format!("Upload endpoint returned HTTP {}", response.status())),
        Err(error) => result.upload_error = Some(if error.is_timeout() { "Upload test timed out".into() } else { error.to_string() }),
    }

    Ok(result)
}
