# Browser & Network Observatory

## Goal

Diagnose slow or failed browser sessions without guessing whether the cause is the local network, DNS, VPN/proxy routing, a remote service, or the page itself.

## Architecture

- **Desktop diagnostics (Tauri 2 + Rust):** DNS resolution, HTTPS reachability and time-to-response for selected endpoints, default-route/interface hints, proxy/VPN signals, and an explicit on-demand download/upload speed test.
- **Browser extension (Chrome Manifest V3):** opt-in telemetry for the active tab: fetch/XHR request outcomes, resource failures, JavaScript errors, long main-thread tasks, and long gaps while a response stream is being read.
- **Local-only storage:** diagnostic events stay on the device. Never record page text, prompts, response content, request/response bodies, cookies, authorization headers, or URL query strings.
- **Current reporting:** the desktop app can copy a redacted network-only report; extension events remain in local browser storage. Importing extension telemetry into the desktop report remains future work.

## Phase 1 — desktop MVP

1. Add Network Observatory to the existing Diagnostics screen.
2. Run bounded DNS and HTTPS checks for ChatGPT, OpenAI authentication, GitHub, and the selected speed-test provider.
3. Display status code and response timing separately: an HTTP 401/403 proves a server answered, but does not mean the network request succeeded for the user.
4. Inspect default-route and VPN-like interface signals plus proxy configuration presence. Treat these as hints, not proof of VPN state.
5. Run an explicit, bounded download/upload test. Do not run it automatically or continuously.
6. Compare VPN-on and VPN-off runs only when the user manually changes their VPN state. Never silently change VPN, proxy, DNS, firewall, or routing settings.

## Phase 2 — browser monitor

- User clicks the extension icon and explicitly starts monitoring the current tab.
- An optional, separately approved ChatGPT host permission allows re-attaching after reloads on ChatGPT domains.
- Record request metadata and timing only; redact query strings and likely identifier path segments.
- Distinguish navigation/load issues, DNS/TLS/HTTP reachability, JavaScript errors, failed resources, long main-thread tasks, and request/stream gaps.
- Do not claim that browser telemetry can identify server-side faults with certainty. Reports should state evidence and confidence.

## Acceptance checks

- Desktop diagnostics still work when Ollama is stopped.
- Every network operation has a timeout and the speed test transfers bounded amounts of data.
- HTTP status is shown separately from transport failure.
- VPN/proxy detection never claims certainty from one interface or environment variable.
- The extension requires a user action to begin monitoring and has no broad default host access.
- No user content or request bodies are stored.
- Failed tests show actionable, appropriately qualified explanations rather than a generic “internet broken” label.
- Optional browser-download monitoring records start/progress/completion/interruption metadata without filenames or full URLs.
- With downloads/alarms permissions granted, a download with no byte progress for 60 seconds generates a local stall event.
- Every page/network event includes a specific next-step suggestion where the symptom supports one; advice distinguishes HTTP denial/rate limiting from transport failure.
