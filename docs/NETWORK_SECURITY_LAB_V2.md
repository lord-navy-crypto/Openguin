# Network & Security Lab v2 — passive diagnostics and browser evidence

Status: **implemented on feature/network-security-lab-v2**, building on feature/browser-network-diagnostics.
This is a defensive, consent-driven observability project, not a packet-capture product or a vulnerability scanner.

## Product boundaries

- **AI Model Lab:** Keep all pre-existing model discovery, private Ollama runtime, inference, task center, device discovery, and LabBridge endpoints untouched.
- **Network Doctor:** Reuse pre-existing DNS resolution, HTTPS availability/response, HTTP latency and jitter probes, explicit speed test, VPN-on/off labeled samples, and history.
- **Browser Network Watch:** Install the browser extension and explicitly start monitoring a normal HTTP(S) tab. Existing Fetch/XHR instrumentation records coarse request timings, stalls, stream gaps, resource failures, JavaScript failures, and rendering activity. Downloads are monitored only after a separate optional permission.
- **Network & Security Lab:** Import the sanitized browser JSON into the desktop Browser incident report. The newly added review appears below the existing cross-layer evidence and browser timeline.

## Implemented in v2

| Area | Added |
| --- | --- |
| Security event interpretation | Deterministic severity (warning / notice / info) and categories (HTTP / connectivity / rendering / download / activity) |
| Website reliability | Per-domain starts, responses, 4xx/5xx, transport errors, stalls, slow responses, and response median/P95 |
| Log workbench | Chronological event review, filter by domain / category / severity, pagination |
| Traffic trend | Minute-bucket event and warning counts, last 24 occupied intervals rendered |
| Network context | Current DNS/HTTPS success counts, default interface and VPN-tunnel signal, manually labeled VPN comparison samples |
| Shared evidence | Dedicated privacy-reduced security JSON and CSV, included in the desktop combined diagnostic bundle |
| Regression coverage | Empty samples, real-response vs start counts, P95, mixed signals, capture overflow, redaction, spreadsheet formula safety |
| CI | Build checks and deterministic Node test added to the Network Observatory workflow |

**Semantics:** A 401/403/429 response is not evidence of a security incident. A transport or page error cannot prove VPN failure or malware. Timings are browser-visible round-trip observations, not an ICMP ping or per-hop packet loss. Do not add response statuses to start counts as though they were independent requests.

## Data flow and scope

1. The user starts a particular tab in the extension; no global website-collection permission is requested.
2. The existing instrumented page reports metadata, NOT the request/response content.
3. The extension sanitizes metadata and keeps a bounded **300-event rotating local buffer**. It reports dropped events and suppressed duplicates.
4. The user exports JSON/CSV manually and pastes/imports browser JSON into the desktop app.
5. The desktop parser re-validates the report, then v2 computes local event and per-domain summaries.
6. The new **security review export** includes timestamps, domains, types, status and durations but omits URL paths and request IDs. The pre-existing full combined diagnostic bundle still includes sanitized endpoint paths for troubleshooting, so review BOTH export formats before sharing.

There is **no direct transfer to ChatGPT or a cloud server**. Import/export is user-controlled. Domain names and timestamps can still reveal activity; treat them as private data.

## Privacy and defensive design

- Never store prompts, model answers, page text, HTML, user input, auth headers, access tokens, cookies, passwords, VPN/proxy secrets, request/response bodies, or download filenames.
- No packet inspection, network interception, hidden browsing-history extraction, automatic VPN switching, or cross-site background tracking.
- The extension's optional downloads permission applies to browser downloads beyond the monitored tab; only enable it if intentionally needed.
- New review exports omit full URLs and paths. CSV neutralizes spreadsheet formulas and quotes cells.
- The 300-event buffer is intentionally bounded. When a log reaches capacity, report it as truncated rather than claiming a complete history.
- The browser report is untrusted, possibly incomplete evidence. Correlate with desktop samples and repeat experiments rather than declaring an attack.

## Suggested UX workflow

**Reproduce and diagnose a slow AI response**

1. Start monitoring the affected ChatGPT tab; separately approve ChatGPT reload persistence if needed.
2. Reproduce the delay and export the browser JSON.
3. Run the desktop Network Doctor, then (optionally) the explicitly requested speed test.
4. For VPN comparisons, manually record a VPN-on sample and a VPN-off sample using otherwise comparable conditions. The app never changes the VPN.
5. Paste browser JSON into the Browser incident report. Inspect the Network & Security Lab host table, time buckets, error category filters, and browser/network correlation.
6. Export the reduced security JSON or fuller diagnostic bundle to study with ChatGPT. Review domains/timestamps first.

## Not yet implemented / explicit limits

- No system-wide process-to-socket or app-to-domain mapping.
- No packet capture, TLS decryption, browser History API collection, or inspection of all open tabs.
- No automatic per-site monitoring across browser restarts beyond the existing specifically authorized ChatGPT hosts.
- No 24/7 unbounded log journal or tamper-evident archival.
- No deep VPN tunnel protocol examination or proof that a particular request used a tunnel.
- No built-in exploit runner, credential tester, DDoS simulator, or security bypass.
- The extension stores events locally; the native desktop app cannot silently read browser extension storage.

## Safe future design queue

1. Opt-in **additional site scopes** using individually requested host permissions, with a visible monitored-site list and one-click revoke.
2. Optional **local-only scheduled samples**, with clear user activation, disk quota, expiration and pause/stop controls.
3. Local macOS **application health** (CPU, memory, connectivity counters) using operating-system permission boundaries; avoid accessing other applications' secrets.
4. Export journal indexing, richer search, reliability baselines with sample-size indicators and user-defined alert thresholds.
5. Separate **defensive learning workspace** using non-invasive network troubleshooting and log-analysis exercises with sample data.

## Reference standards

- Chrome Extensions Manifest V3: https://developer.chrome.com/docs/extensions/develop/
- Chrome Tabs API permission guidance: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Chrome webRequest overview and limits: https://developer.chrome.com/docs/extensions/reference/api/webRequest
- Apple NWPathMonitor: https://developer.apple.com/documentation/network/nwpathmonitor
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- OWASP Security Logging and Monitoring: https://devguide.owasp.org/en/04-design/02-web-app-checklist/09-logging-monitoring/
- MDN Resource Timing: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/transferSize

These references guide implementation, not evidence of features that are not yet present.
