# Security Toolbox v11 — Interactive Manual HTTP Workbench

This increment extends the real, loopback-only v9/v10 Node.js practice server with a **browser-based, user-initiated HTTP inspection UI**. It is not a remote scanner or attack toolkit.

## Start and open

From a local source checkout with Node.js installed:

```
npm run security:lab
```

Open **http://127.0.0.1:19090/workbench** in the same machine's browser. The Security Lab React panel also links to this fixed URL. Stop the Node process using Ctrl+C.

No auto-start process has been added to the existing DMG; the lab is a source-checkout development feature.

## Implemented

- Dedicated workbench page with buttons for Health, Member, Admin, Form, Rate Check, missing CSRF verification, invalid form fields and a normal form submission.
- Each button is one **explicit user gesture** which causes exactly one browser fetch to a **compile-time fixed, relative localhost route**. No editable destination, target IP, arbitrary URL, custom payload or run loop.
- The web page displays the actual HTTP status, elapsed time, short status explanation and a limited allowlist of safe security response headers (Cache-Control, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Retry-After). It deliberately never reads response bodies.
- Fixed form examples only; normal browser session is required for protected POST cases. The browser sends its own same-origin cookies, while the page JavaScript never reads Cookie values or returns CSRF token content in exported results.
- At most 30 in-page request outcomes and a local JSON export with manually executed route ID, method, status, elapsed time and explanation. The report contains no credentials, cookies, IPs, posted text or response bodies.
- V9/V10 sanitized server access-log and event-summary routes remain available to compare browser observations to server status totals.

## Isolation and security properties

- The Node server binds to 127.0.0.1 only and accepts only fixed route names, no query strings, and approved local Host/Origin headers. There is no outward network client or proxy support.
- The inspector script lives in a local static file served at /workbench-client. **Only /workbench** has `script-src 'self'; connect-src 'self'` in its CSP. Other site pages retain the stricter no-script CSP.
- No automated credential guessing, password list, exploit delivery, SQL/HTML injection payloads, flood generation, stress test, hardware interface, traffic scheduler or network targeting.
- This is a teaching/test harness, not a real website security audit or a penetration-testing platform. Passing checks on these fixed demo routes does not establish the user's production-site security.

## Code and validation

- `scripts/localhost-http-workbench.js`: manual-only, fixed-target UI script, bounded in-memory browser history.
- `scripts/localhost-defense-lab.mjs`: static JS route, workbench page, scoped CSP.
- `tests/localhost-defense-lab.test.mjs`: checks safe CSP, routes, document controls, JS asset, bad Host/Origin and query rejection.
- `src/LocalhostManualLab.tsx`: link from existing Security Lab.
- `.github/workflows/network-observatory.yml`: new JS syntax check plus unchanged browser/native/frontend/extension checks.

Release gate: full macOS CI for the **exact v11 branch head**, then manual macOS browser + desktop UI review. This remains a draft PR based on v10; it is not merged into main and no new DMG has been produced.
