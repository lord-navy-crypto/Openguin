# OpenPenguin Security Toolbox v7 — Virtual Web Defense Lab

## What was implemented

The Security Lab now contains a **local-only, deterministic virtual website defensive simulator**. It is not a penetration-testing client, real attack tool, HTTP request generator, password-testing utility, DDoS simulator or network scanner. It makes **zero network requests** and never connects to any website or localhost port.

- Scenario presets: regular website usage, higher-frequency login activity, role boundary checks, missing state-change verification, expired sessions, and combined events.
- Editable defensive policies: per-virtual-actor event limit and rolling window, session expiry, server-side role check switch, state-change CSRF verification switch, and security-header configuration signal.
- Rule evaluation produces synthetic 200/401/403/429 responses with a simplified decision reason for each invented event.
- Training metrics: permitted/blocked events, correct decisions, missed expected protections and false positives (legitimate events incorrectly blocked).
- Explicit policy comparison: intentionally permissive **educational comparison profile** vs. currently configured virtual defenses, including both underblocking and overblocking.
- Per-event timeline and bounded report JSON export. No IP addresses, password attempts, payloads, real URLs, captured website content, or customer activity.

### Synthetic evidence files for the existing forensic workflows

The simulator can also download two entirely invented datasets:
1. **Virtual Apache access.log:** fixed loopback source 127.0.0.1, fixed request classes /, /login, /admin and /account, simulated status codes and UTC timestamps. It is compatible with Server Access Log Investigator.
2. **Virtual Browser Journal JSON:** schema openguin-browser-journal-v1, invented hostname virtual.local, synthetic fetch-response events with generated timestamps/status/durations. It is compatible with Browser Journal Analyzer and can be used in the Evidence Correlator.

The simulator's CSV/JSON exports and time labels are training artefacts only. Do not upload or describe these as actual production website evidence.

## How to practice

1. Open the Security tab and choose Virtual Web Defense Lab.
2. Run a preset such as a role-boundary or expired-session scenario using the permissive comparison profile.
3. Observe missed protections and the virtual status codes.
4. Enable role checks or decrease session life as appropriate, then run again.
5. Compare missed protection counts and false positive counts. Requiring extremely low rate thresholds can create false positives for legitimate requests.
6. Download the virtual server access.log and browser journal JSON. Import each into the existing offline analyzers below.
7. Review what is observable in the logs and what remains unknowable without backend context.
8. On your own real website, use passive logs and configuration review separately. Do not use synthetic findings as security certification.

## Source and automated verification

- src/local-defense-simulator.ts — deterministic generator, safe policy evaluator, reporting and synthetic log exports.
- src/LocalDefenseSimulator.tsx — interactive controls, synthetic timeline, status distribution and comparison.
- src/local-defense-simulator.css — responsive layout.
- tests/local-defense-simulator.test.mjs — known outcomes, negative controls, deterministic data, rule constraints, privacy and compatibility with existing importers.
- .github/workflows/network-observatory.yml — uses esbuild to run these tests before frontend build, native Rust check, and extension tests.

## Limits

This simulator does not implement HTTP transport, real TLS, database/session issuance, browser CORS/CSP enforcement, SSRF, JavaScript injection, vulnerability exploitation, authentication service integration or network load generation. It is designed to teach how defensive controls and event logs interact. Authorization boundaries and CSRF protections in a real website must be implemented server-side using trusted frameworks and verified by its own tests.

References for defensive design:
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Cross-Site Request Forgery Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
