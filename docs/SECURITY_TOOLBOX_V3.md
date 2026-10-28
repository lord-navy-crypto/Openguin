
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
