
# Network Security Toolbox v3: Defensive release candidate

Branch: feature/security-toolbox-journal-app-monitor-v3
Base: feature/network-security-lab-v2
Status: source-level implementation; CI/manual macOS validation must complete before any production release.

## Design goals

Protect the existing AI Model Lab, Ollama controls, LabBridge, Network Doctor and browser incident review. Add only transparent, user-initiated, local-first defensive diagnostics. A tool that creates network traffic or tries to exploit services is outside this release.

## Added: macOS App Socket Observatory

- Native command: sample_app_connections, user-triggered on the Security Lab page.
- On macOS, invokes the fixed system utility /usr/sbin/lsof using parameters that request process identities and open socket descriptors only.
- Displays process names, PIDs, visible socket counts, and sample time. No elevated privileges, no shell, no remote address, no filenames, no command-line arguments, and no packet payloads.
- This is one snapshot, not a network byte-rate meter, continuous process history, or proof of malicious behavior.
- Reports limitations: system permission boundaries, short-lived sockets and sample completeness.
- JSON export requires an explicit click.

## Added: HTTP Response Header Audit

- Completely offline: users paste HTTP response headers from their own website using browser developer tools.
- Checks CSP enforcement vs Report-Only, HSTS, MIME sniffing, framing, Referrer-Policy, Permissions-Policy, and selected Cookie/CORS configuration signals.
- Produces human-readable, context-sensitive advice instead of pretending to certify site security.
- Session-only baseline lets the user compare two separate response-header observations before and after a server configuration change.
- Raw copied response headers and any Cookie values are never included in audit JSON exports.
- Use the same route and response type for meaningful before/after comparisons.

## Added: long-term browser journal

- Opt-in, off by default; never activates tab monitoring itself.
- Only stores metadata already visible to the existing opted-in browser capture or separately permitted browser download monitor.
- Source fields: at, host, event kind, optional HTTP status and duration.
- Excluded fields: URL path, query, request ID, tab ID, browser content, user input, prompts, response bodies, authorization data and download filenames.
- Capacity: maximum 2,500 journal entries, up to 30-day age window on new writes and exports. Data can be dropped earlier if the buffer fills; old stored data may persist when idle until a new write or manual clear.
- Independent control buttons for enable, pause, JSON export, CSV export and stop/clear.
- Events are saved locally via chrome.storage.local; not automatically synchronized with the desktop app or ChatGPT.
- Existing 300-event Browser incident report format is unchanged; the journal uses an independent schema for long-term analysis.

## Defensive workflow for a website you control

1. Record a baseline with existing DNS/HTTPS checks and the browser extension, taking care to enable only the tab under observation.
2. Copy the actual response headers from the browser developer tools for the site's HTML entry point.
3. Run the offline audit and save its findings as the baseline in the Security Lab.
4. Correct a documented configuration issue on your own server, without deliberately causing downtime or changing many variables at once.
5. Repeat the same observation and compare the two audit reports. Keep limitations and contextual differences in the report.
6. Export reduced logs only when needed. Inspect the domains and times before sharing with ChatGPT.

No request replay, password guessing, vulnerability exploitation, rate-limit evasion, load attack, TLS interception, covert capture, or access to third-party data is provided.

## Current technical limitations

- macOS process inventory provides counts, not bytes or network throughput per app. It is a one-shot sample, not live continuous monitoring.
- The browser extension cannot capture all browser activity, especially before user activation, inside other extensions, or browser-internal network operations.
- Journal 2,500-event cap means it can drop substantial activity on busy pages. It does not certify a complete browsing history.
- Offline response-header audit is a review of supplied text, not a scan or formal pentest.
- Device and browser reports are separate; there is no privileged background bridge or invisible data transfer.

## Verification expectations

- TypeScript/Vite build.
- Extension JavaScript syntax and deterministic permission/privacy tests.
- Journal retention, capacity and off-state tests.
- Header parser and before/after comparison tests.
- Rust cargo check and macOS manual sampling verification.
- Browser extension reinstall, explicit permission prompts, pause/resume and JSON/CSV export review.

## Authoritative references

- OWASP HTTP Security Response Headers Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- Chrome extension storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome DevTools Network panel: https://developer.chrome.com/docs/devtools/network/
- Apple Network Framework path-monitoring overview: https://developer.apple.com/documentation/network/nwpathmonitor

Future research: user-selected periodic health checks with clear cancellation, limited storage budgets, explicit permissions, and better local-only report import. Those future capabilities are NOT implemented in v3.


## Added: Browser Journal Analyzer (desktop)

- Under the Security Lab tab, users can import JSON created by the extension's optional long-term journal.
- Accepts local JSON files or pasted JSON only; max 1 MiB and at most 2,500 events.
- Safely rebuilds each event from a small allowlist (timestamp, domain, kind, status, duration). Discards unknown fields, including any accidental URLs, request IDs, response content, or tokens.
- Shows per-domain counts and HTTP responses, 4xx / 5xx, transport failures, stream stalls, rendering and download issues, response duration median/P95, and daily UTC activity trend.
- Search and filter by domain, event category, or text within the *already-sanitized* domain and kind fields. Local pagination prevents 2,500 records rendering at once.
- Produces a **summary-only** JSON report for ChatGPT that omits every raw event row while retaining aggregates and documented limits. Domains, summary activity times, and counts remain sensitive.
- Does not silently read browser extension storage. Browser report v1 and journal v1 are different schemas and remain different import paths.

## Added: Server Access Log Investigator (desktop)

- For web servers you administer, the Security Lab now accepts up to 1 MiB of Apache/Nginx Common or Combined access-log text, from a selected local file or manual paste.
- The fixed offline parser extracts only timestamp, HTTP status and reported response bytes. Remote IPs, requested URLs, query parameters, cookies, referrers, user agents and file paths are **never kept in the audit model or export**.
- Aggregates status distribution, HTTP 429, 4xx / 5xx, minute-level request counts and UTC daily counts.
- Flags unusually high **observed** minute-level event counts relative to other minutes in the supplied sample; these are preliminary observations, never proof of an attack or total server load.
- Clears pasted raw log from the UI after successful parsing. The completed report is aggregate-only JSON for later ChatGPT analysis.
- Limitations: does not support every custom log format, exclude error logs and CDN logs not in Common/Combined format, cannot verify completeness, and does not classify individual visitors as attackers.

## Recommended self-hosted website workflow

1. Capture normal website performance with the browser Network Watch and existing DNS/HTTPS diagnostics.
2. Enable the optional browser journal explicitly; collect a small sample during the issue and export JSON manually.
3. In Security Lab import that journal, inspect domain/timing aggregates and save a summary report.
4. If you administer a web server and have its access.log, analyze a bounded sample locally using Server Access Log Investigator.
5. Compare browser-side events, server 5xx/429 counts and configuration audit results for a time window you know is comparable.
6. Fix known configuration or application issues on your own system, then repeat the observation. Do not infer attackers, VPN routing or security effectiveness from these logs alone.

Independent data sources should not be linked to named persons or interpreted as proof of wrongdoing; this tool does not collect visitor identities or implement active penetration testing.


## Added: cross-source evidence correlation

- Open Security Lab and import two local sources: an opt-in browser journal JSON and an Apache/Nginx access-log sample from a site you administer.
- Explicitly choose the browser hostname corresponding to the access log and confirm that the sources refer to a website you are authorized to inspect. The server log does not itself identify its virtual host.
- The analyzer aligns observed metadata in UTC one-minute windows, counts browser 5xx/transport/stall signals alongside server 5xx/429 signals, and shows days/minutes with only one side or both sides reporting issues.
- Co-occurrence is **not** packet-level matching, request identity, proof of wrongdoing, attack detection, or validation of VPN routing. CDN/caching, different logs and clock skew introduce significant uncertainty.
- The downloadable summary includes counts, named domain, UTC days and aggregate overlaps but explicitly **excludes** raw source rows and minute-level timelines. Share only after reviewing domain names and activity dates.
- Both source models and all correlation results stay in the Security Lab session memory; unloading a source clears it from the correlation view.

### Current tests and verification

The CI workflow now includes deterministic tests for journal summary exports, private server access-log aggregation, and cross-source overlap. A previously failing test incorrectly prohibited the legitimate aggregate field `hosts[].events`; the assertion was corrected to prohibit a top-level raw event timeline instead. The latest revision still needs its own full CI run before distribution.
