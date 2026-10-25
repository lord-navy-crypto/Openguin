# Network Observatory — research findings, fault diagnosis and delivery checklist

Status: experimental feature branch, pending build and real-device acceptance.
Purpose: understand whether a stuck ChatGPT/browser page is blocked by local network, DNS, VPN/proxy routing, HTTPS transport, application response, response stream, download progress or browser rendering.

## Architecture and key limits

The application is deliberately two components: Tauri/Rust desktop network diagnostics and an opt-in Chrome/Chromium Manifest V3 extension. A normal website cannot inspect all tabs, macOS VPN routes and downloads.

| Module | Observed evidence | Limitation |
| --- | --- | --- |
| Desktop | DNS timing; HTTPS status/transport error; bounded speed/HTTP latency/jitter; VPN-like route and proxy hints | Does not inspect ChatGPT server internals or prove the path taken by every VPN packet |
| Browser | Post-activation Fetch/XHR symptoms; selected stream gaps; resource/script errors; long tasks; paint and DOM observations | Does not monitor all earlier requests, browser internals or all WebSocket traffic |
| Optional downloads permission | Start, coarse progress, completed/interrupted status, reason category, potential 60s stall | Does not reliably identify a source-server defect |
| Report import | Safe redacted JSON, issue frequencies, timeline, suggestions and desktop network evidence | A symptom classifier, not a certified root-cause forensic tool |

A response with HTTP 401, 403 or 429 means an HTTP server responded, even if the user did not receive the desired page. This is different from DNS failure or a TCP/TLS timeout. An HTTP 5xx suggests an upstream request fault, not proof that the user's internet connection is bad.

HTTP latency and jitter measured by repeated requests are not ICMP round-trip time or packet-loss rate. A single download speed result is noisy; compare the same provider and conditions over repeat trials. All throughput tests must be bounded and user initiated.

Browser scripts cannot inspect typed user input or message text. A typing freeze can be suggested by long main-thread tasks and script exceptions; it cannot be diagnosed reliably from throughput alone. The tool deliberately avoids logging keystrokes, prompts and answers.

## Chrome download research and implementation correction

The Chrome downloads API documents that onChanged does not fire when only bytesReceived or estimatedEndTime changes. Therefore listening to onChanged for download progress is insufficient.

Implementation:

1. onCreated records the start time; onChanged records complete/interrupted plus Chrome interruption reasons.
2. After separate user approval of downloads and alarms, poll downloads.search for active downloads using a 30-second alarm.
3. Store a compact baseline in chrome.storage.session because Manifest V3 background service workers can suspend.
4. Log coarse 10% progress milestones, no-progress warnings after approximately 60 seconds, and completion/failure. Chrome may delay alarms, so the threshold is approximate.
5. Paused and incognito downloads must not be treated as stalled monitored downloads.
6. Store only host, timestamp, byte counts, status class and coarse failure category. Never store filenames, full download URLs, cookies, headers, file contents or URL queries.

Primary source: https://developer.chrome.com/docs/extensions/reference/api/downloads

## Fault classification matrix

| Signal | Classification | Next user action |
| --- | --- | --- |
| All sampled DNS names fail | DNS/local network/VPN DNS hypothesis | Reconnect and repeat; compare manually labelled VPN on/off |
| DNS passes but HTTPS transport fails | Route, proxy, TLS, firewall or target reachability hypothesis | Compare route, proxy and VPN; do not change multiple settings simultaneously |
| HTTP 401/403 | Authentication/permission or service challenge | Check account/session/access before investigating Mbps |
| HTTP 429 | Rate limit | Do not rapid-retry; retry later |
| HTTP 5xx | Upstream application error signal | Check service status and repeat at another time |
| Fetch/XHR pending for 15 seconds | No response header symptom | Compare desktop DNS/HTTPS and the same website under both VPN states |
| Response-stream gap | Stalled response-reading symptom | Correlate with service response, tab script/runtime and route changes |
| Resource load failure | Resource/CDN/blocker/cache possibility | Check resource host, browser blockers and network reachability |
| JS exception or long task | Browser runtime/rendering possibility | Test with fewer tabs or extensions and reproduce on a clean profile |
| Chrome download NETWORK_* | Potential transport issue | Compare a different download and repeat with VPN on/off |
| Chrome download FILE_* | Local filesystem/storage problem | Inspect available disk space and destination permissions |
| Chrome download SERVER_* | Download source/server response issue | Check source site availability and try again later |
| Chrome download USER_* | User-initiated interruption | Do not label it a network failure |
| Unchanged download bytes for roughly 60s | Possible stalled download | Verify it is not paused; compare source and VPN paths |
| Blank page after successful transport | Browser application/render hypothesis | Cross-check script/resource/paint events, not just DNS |

All findings are qualified as evidence. There is no silent VPN, DNS, proxy, MTU, routing or firewall reconfiguration. Suggestions are reversible and must not promise a successful fix.

## Report presentation and privacy

Browser extension: click Copy diagnostic report. It exports a versioned JSON record containing event kind, time, host, status, bounded timings and coarse error category. It omits URL path, tab IDs, filenames, prompts, responses and request/response bodies.

Desktop Diagnostics: paste that JSON into Browser incident report. The parser validates report signature, schema, event kind whitelist, valid time, allowed host format, at most 300 events and a 300 KB input limit. It renders the issue taxonomy, frequencies, recent timeline, next-step suggestions and available DNS/HTTPS/throughput/VPN comparisons. Nothing is uploaded; imported content remains in transient UI state unless the user explicitly copies a combined report.

Page-world instrumentation is untrusted because site scripts may interfere with it. The extension accepts page telemetry only from a previously authorized monitored tab and treats the result as observational data, not an authenticated packet trace. All user-visible event labels use text rendering rather than untrusted HTML.

## Automated acceptance

- Node syntax checks for browser extension scripts and JSON validity for manifest.
- Browser-report parser: accept valid format, reject unsupported versions and oversized reports, ignore unexpected event categories, exclude unrelated fields.
- Simulated download test: observe start, progress via alarm polling, no-progress warning after 60+ seconds, interrupted download reason, and check redaction of filename and URL query.
- Active-tab authorization test: discard telemetry when no monitored tab is active.
- TypeScript/Vite build for the desktop incident report panel.
- Rust cargo check after existing Tauri patch/reconciliation steps.
- DMG build on a macOS runner, then inspect generated artifacts.

## Manual acceptance

1. Offline and captive portal: distinguish DNS, HTTPS and HTTP status.
2. VPN enabled/disabled: label runs manually; compare repeated latency/jitter/speed.
3. ChatGPT tab: activate extension, navigate, reload with optional permission.
4. Slow/stalled ChatGPT response: observe Fetch/XHR and stream events where available.
5. Deliberately failed resource and script: record distinct fault classes.
6. Download a legitimate sizeable file: confirm progress milestones and that no filename/full URL is stored.
7. Pause a download: confirm no spurious stall warning.
8. Interrupt a download: check Chrome NETWORK_*, FILE_*, SERVER_*, USER_* reason categories.
9. Restart MV3 worker: ensure session baseline can be recovered.
10. Copy redacted extension report and import it into the desktop combined report.
11. Verify Universal2 DMG opens on Apple Silicon and Intel; check any bundled auxiliary runtime's architecture separately.

## macOS packaging requirements

A successful GitHub Actions workflow should provide one compressed artifact with: Universal2 DMG, separate browser-extension ZIP, installer instructions and SHA-256 checksum list. Browser extensions cannot be silently installed by dragging a .app out of a DMG; the user installs the extension separately through the browser's Load unpacked workflow.

An unsigned/unnotarized build is a developer prototype, not a trusted public release. Building a universal desktop executable does not guarantee every bundled secondary binary is universal; explicitly check the Ollama companion runtime.

References:
- https://v2.tauri.app/distribute/dmg/
- https://v2.tauri.app/distribute/sign/macos/
- https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts

## Verification status

The code and CI definitions exist on the feature branch. Passing tests, a successful macOS build, a verified downloadable DMG and full real-device compatibility must be confirmed from actual workflow results. Source commit alone does not prove functionality.
