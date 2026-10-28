//! Passive macOS application connection summary.
//! Only an explicitly requested local lsof sample is taken. No connection
//! destinations, file paths, command-line arguments, or traffic bodies leave
//! the native process; no administrator permission or packet capture is used.
use serde::Serialize;
use std::{collections::HashMap,time::{SystemTime,UNIX_EPOCH}};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct AppSocketSummary {
    pid: u32,
    process: String,
    observed_sockets: u32,
}
#[derive(Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct AppConnectionSnapshot {
    captured_at_ms: u128,
    source: String,
    process_count: usize,
    observed_sockets: u64,
    processes: Vec<AppSocketSummary>,
    caveats: Vec<&'static str>,
}
fn timestamp_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
}
fn clean_process(name: &str) -> String {
    let name: String = name.chars().filter(|c|c.is_ascii_alphanumeric() || matches!(c,' '|'_'|'-'|'.')).take(45).collect();
    if name.is_empty() { "unknown".into() } else { name }
}
fn parse_lsof(text:&str) -> Vec<AppSocketSummary> {
    let mut current_pid: Option<u32> = None;
    let mut rows: HashMap<u32,AppSocketSummary> = HashMap::new();
    for line in text.lines() {
        if let Some(rest)=line.strip_prefix('p') {
            current_pid = rest.parse::<u32>().ok().filter(|n|*n>0);
            if let Some(pid)=current_pid {
                rows.entry(pid).or_insert(AppSocketSummary{
                    pid,process:"unknown".into(),observed_sockets:0
                });
            }
        } else if let Some(rest)=line.strip_prefix('c') {
            if let Some(pid)=current_pid {
                if let Some(row)=rows.get_mut(&pid) { row.process=clean_process(rest); }
            }
        } else if line.starts_with('f') && line.len()>1 {
            if let Some(pid)=current_pid {
                if let Some(row)=rows.get_mut(&pid) {
                    row.observed_sockets=row.observed_sockets.saturating_add(1);
                }
            }
        }
    }
    let mut out: Vec<_> = rows.into_values().filter(|x|x.observed_sockets>0).collect();
    out.sort_by(|a,b|b.observed_sockets.cmp(&a.observed_sockets).then(a.process.cmp(&b.process)));
    // Preserve every visible process so totals are not silently undercounted.
    out
}
#[tauri::command]
pub async fn sample_app_connections() -> Result<AppConnectionSnapshot,String> {
    #[cfg(not(target_os="macos"))]
    return Err("Application connection sampling is currently supported on macOS only.".into());
    #[cfg(target_os="macos")]
    {
        // No untrusted command arguments or shell. Fixed one-shot inventory.
        // Only -Fpcf is requested so lsof never prints endpoint addresses.
        let output=tokio::time::timeout(
            std::time::Duration::from_secs(5),
            tokio::process::Command::new("/usr/sbin/lsof")
                .args(["-nP","-iTCP","-iUDP","-Fpcf"])
                .kill_on_drop(true).output()
        ).await.map_err(|_|"Local socket inventory timed out.".to_owned())?
            .map_err(|e|format!("Could not run the macOS socket inventory: {e}"))?;
        if !output.status.success() && output.stdout.is_empty() {
            return Err("No readable local connection entries were returned; system permissions may limit visibility.".into());
        }
        let text=String::from_utf8_lossy(&output.stdout);
        let processes=parse_lsof(&text);
        let total=processes.iter().map(|x|u64::from(x.observed_sockets)).sum();
        Ok(AppConnectionSnapshot{
            captured_at_ms:timestamp_ms(),
            source:"macos-lsof-passive-snapshot".into(),
            process_count:processes.len(),observed_sockets:total,processes,
            caveats:vec![
                "Only visible open socket descriptors at one instant are counted.",
                "A socket count is not network speed, traffic bytes, a connection's remote address, or evidence of malware.",
                "OS permissions and short-lived sockets can hide entries; repeated samples are not full flow history.",
                "No packet payloads, endpoint addresses, arguments, file paths, or process histories are captured."
            ]
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_only_processes_and_socket_counts(){
        let input="p91\ncExampleApp\nf24\nnsecret.example.com:443\nf25\np5\ncTool\nf8\n";
        let result=parse_lsof(input);
        assert_eq!(result.len(),2);
        assert_eq!(result[0].pid,91);
        assert_eq!(result[0].observed_sockets,2);
        assert!(!format!("{:?}",result).contains("secret.example.com"));
    }
    #[test]
    fn sanitizes_display_strings(){
        assert_eq!(clean_process("Good;\nApp / -x"),"GoodApp  -x");
        assert_eq!(parse_lsof("pBAD\ncBad\nf1\n").len(),0);
    }
}
