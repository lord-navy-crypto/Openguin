# Security Toolbox v9 — Real localhost HTTP defense practice

v7 and v8 use in-memory virtual requests. **v9 adds a real, manually operable HTTP training website** built with Node.js's standard library. It responds to requests from your browser or an ordinary HTTP development client **on the same computer**.

This is deliberately NOT an exploit target exposed to the internet, a password-cracking tool, a DDoS or stress-testing tool, or a remote scanner. Do not point existing attack software or hardware at real websites as a substitute for a controlled defensive lab.

## Start the exercise

In the OpenPenguin repository on a development machine with Node.js installed:

```bash
npm run security:lab
```

Open **http://127.0.0.1:19090/** in a browser on that same machine. Stop the process with **Ctrl+C**. There is no background daemon, no automatic startup in a release DMG and no other device access.

The server binds to IPv4 **127.0.0.1 only**. It doesn't accept a configurable listening host or remote website URL. It doesn't forward requests. A Host-header allowlist and same-origin form checks provide additional safeguards. The endpoint doesn't serve personal files, execute commands or connect to a database.

## Manual training checklist

| Page | Exercise | Expected |
| --- | --- | --- |
| `/member` | Visit before selecting an invented role | 401 |
| `/admin` | Select **Demo member** on Home, then visit Admin | 403 |
| `/admin` | Select **Demo administrator** on Home | 200 |
| `/form` | Use the member demo form with a normal input that violates the short label format | 422 |
| `/rate-check` | Refresh a few times manually; the dedicated demonstration allows four checks per 30 seconds | 429 after the threshold, then recovers |
| `/member` | End the demo session and reopen Member | 401 |
| `/events` | View status-code counts for the process | HTTP status counts only |
| `/access-log` | Download anonymized manual localhost HTTP outcomes | Apache-compatible access.log for existing offline analyzer |

The home page offers simulated member/admin roles **without passwords**. This is a role model, not a real authentication system. Session cookies expire after five minutes. The POST form requires a matching locally generated anti-CSRF marker, validates short text labels and discards all user input.

The UI also has a self-reported manual checklist and privacy-minimal JSON export. The report is a record of what the user marked, not proof from an automated remote audit.

## Safety, constraints and limitations

- **Same-machine loopback only**: no LAN binding, Wi-Fi exposure, other computer or smartphone access, cloud target, public tunnel, ngrok, proxy, target list or configurable outbound request.
- Default IPv4 host is constant and port 19090. Tests use an ephemeral loopback port without opening to the public network.
- No attack payload library, brute-force, injection exercise strings, vulnerability exploitation, DDoS, request replay, or third-party login handling.
- Request body is capped at 2 KiB; accepted form input is not persisted or reflected. Cookie and role identifiers are random, invented and held only in this process.
- CSP, no-store, frame protection, no-sniff, strict same-site demo cookies and origin/host checks are applied. HTTP on 127.0.0.1 is **only for local education**, not a deployable production login implementation.
- The local event summary shows status-code totals; the explicit access-log download contains only allowlisted route IDs, method, status and timestamp with a fixed loopback IP and training user agent; no source IP, full URL, token, user agent or request body is retained in the report. Stop the server to discard all in-memory data.
- No claims about load capacity, exploit resistance or vulnerability status of a real website.

## Files and verification

- `scripts/localhost-defense-lab.mjs`: loopback-only Node HTTP server and explicit start/stop API.
- `tests/localhost-defense-lab.test.mjs`: end-to-end loopback checks for 200, 401, 403, 422, 429, Host and Origin validation, form/session rules, size bounds and redaction.
- `src/LocalhostManualLab.tsx`: Security Lab launch instructions, manual outcomes and local report export.
- `src/localhost-manual-lab.css`: responsive UI.
- `package.json`: `npm run security:lab` and `npm run security:lab:test`.
- `.github/workflows/network-observatory.yml`: macOS regression tests before frontend build, Rust check and extension tests.

The v9 PR is based on the v8 draft branch. **Before merging or claiming a packaged DMG**, verify the exact v9 head CI and manually test the real web UI, including Tauri behavior and stopping the local process. The current DMG does not bundle an automatically launchable Node server.

For a real website you own, use the existing passive logging, configuration linting and normal application tests separately. Do not infer real-site security from this local demonstration.
