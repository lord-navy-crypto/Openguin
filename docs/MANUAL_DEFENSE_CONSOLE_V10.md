# OpenPenguin Security Toolbox v10 — Manual Local Defense Console

This feature expands the v9 runnable localhost website with a **browser-operated, one-click defensive exercise console**. The v9 server stays bound to IPv4 loopback 127.0.0.1 only, does not initiate outbound traffic and has no remote target option.

## Getting started

Run `npm run security:lab` inside the source checkout with Node.js installed. Then visit:

- http://127.0.0.1:19090/ — practice website
- http://127.0.0.1:19090/manual-console — manual defense controls
- http://127.0.0.1:19090/events — in-memory status summary
- http://127.0.0.1:19090/access-log — sanitized access.log suitable for offline analysis

Stop the server with Ctrl+C. The current release DMG does not bundle the Node server.

## Exercises

1. **Fictional identity failure / account lockout:** click the single-action form to record one invented unsuccessful sign-in event (no password field, hash or guessing). The first three actions return 401; further actions within a 60-second window return 429 with Retry-After. The counter resets naturally after the window.
2. **Virtual capacity defense:** click to increment a small in-memory number by one. The first three actions return 200, then 503, demonstrating a hypothetical service availability threshold. It does **not** allocate substantial memory, generate parallel HTTP requests, delay the event loop or cause traffic pressure.
3. **Restore counters:** single click resets only the fictional state for the current server-issued lab token; no real accounts, data or controls are changed.
4. Inspect individual responses in the browser Network inspector or compare the aggregate HTTP status data and exported sanitized access.log.

The controls are explicit HTML forms; there is no timer, auto-clicker, request scheduler, password cracker, exploit library, reverse proxy, hardware controller or flood generator. Each click generates just one localhost POST from the browser. POST requests must pass the server's locally issued anti-CSRF token check, and path/Host/Origin validation stays enabled.

## Privacy and limits

- Synthetic roles only. No real passwords, guesses, credential tokens, targets, attack payloads, captured input or account records.
- State has a fixed maximum of 64 local demo identities and five virtual capacity steps each.
- Sanitized logs retain only a fixed loopback IP, allowlisted route name, HTTP method, status and timestamp; they do not include cookies, tokens, request bodies, user agents or full URLs.
- The capacity model is educational, **not a real load test**. It cannot establish how much traffic a real website can handle. The lockout is a synthetic count, **not a real authentication security test**.
- Do not use this as evidence that a public website is secure or as authorization to attack other endpoints.

## Tests and release verification

- scripts/manual-defense-exercises.mjs: bounded, credential-free one-click exercise state.
- scripts/localhost-defense-lab.mjs: local HTTP HTML forms and real 401/429/503 responses.
- tests/localhost-defense-lab.test.mjs: localhost HTTP integration, CSRF verification and sanitized logging, including existing v9 tests.
- tests/manual-defense-exercises.test.mjs: deterministic pure-state tests.
- src/LocalhostManualLab.tsx: adds direct manual-console launch link.
- GitHub Actions Network Observatory macOS workflow tests before frontend build and native Rust checks.

Keep the PR a draft until the exact v10 head passes the full CI suite and manual macOS GUI review; no DMG is built here.
