# OpenPenguin Security Toolbox v16 — Real Manual HTTP Evidence & Header Audit

This update enhances the existing localhost-only **Manual HTTP Workbench** with observational security-response evidence and human-click response timing. The workbench remains a safe, usable developer tool, not a brute-force program, vulnerability exploit framework, or network attack generator.

## Usage

From a checkout of the v16 source branch with Node.js/npm installed:

```sh
npm install
npm run security:lab:test
npm run security:lab
```

Open **http://127.0.0.1:19090/workbench**. The OpenPenguin desktop Security Lab also has a direct shortcut.

Choose one of ten fixed actions, such as health, member/admin visibility, fictional owner record checks, form input validation, missing form token, or manual rate-check. Each click sends **exactly one** ordinary browser fetch to a fixed **same-origin relative route**; there is no configurable URL, target, payload editor, parallel requests, automation scheduler or background scanner.

## New in v16

- **Security response-header review**: after each manually triggered response, a read-only checklist observes Content-Security-Policy, X-Content-Type-Options: nosniff, X-Frame-Options/CSP frame-ancestors, Referrer-Policy, Cache-Control: no-store, Cross-Origin-Resource-Policy and, only for 429, Retry-After. Display a per-check explanation, not a misleading website safety score.
- **Manual single-request timing evidence**: show up to twelve of the last clicked response durations in a small bar graph. Calculate the median and P95 for measured clicks (P95 appears after at least three observations). These are browser-side measurements affected by scheduling/cache variability, **not a load test, network benchmark, or server throughput result**.
- **Privacy-limited JSON export**: up to 30 individual manual outcomes with only allowlisted check id, static route, method, HTTP status, duration and boolean header-observation flags. No Cookie, Set-Cookie, CSRF token, request body, response body, username, password or credentials are exported; the tool never asks for them.
- **No behavior regressions**: earlier v9–v15 local lab routes, one-click manual checks, secure-vs-teaching fictional authorization, synthetic capacity comparisons, sanitized Apache log and all existing UI controls remain.
- **Stand-alone test fix**: `npm run security:lab:test` now first compiles the offline access-log parser and runs the v9–v16 tests without relying on the CI build steps having run previously.

## Source architecture

- `scripts/manual-audit-evidence-v16.mjs`: pure header-inspection, percentile aggregation and redacted evidence export; no network dependencies or side effects.
- `scripts/localhost-http-workbench.js`: browser module imports the pure inspector; each click manually triggers exactly one fixed fetch.
- `scripts/localhost-defense-lab.mjs`: serves a fixed static `/audit-core` ES module and the same-origin workbench, with a `script-src 'self'; connect-src 'self'` CSP on that page only. Other pages retain their stricter no-script CSP.
- `tests/manual-audit-evidence-v16.test.mjs`: pure tests for headers, 429 guidance, quantiles, privacy and malformed data.
- `tests/localhost-defense-lab.test.mjs`: actual loopback HTTP tests for asset serving, CSP and Host/Origin/query/method boundaries.
- `package.json`, `.github/workflows/network-observatory.yml`: self-contained local test command plus complete macOS CI.

## Guidance / limitations

Read-only response-header observations follow defensive guidance from OWASP's Secure Headers Project and Web Security Testing Guide:

- https://owasp.org/www-project-secure-headers/
- https://owasp.org/www-project-web-security-testing-guide/
- https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html

A header can be present while an application still has serious vulnerabilities. A missing header does not, by itself, prove an exploitable vulnerability. Security response headers and browser timing are not substitutes for real-world permission testing or external performance measurements.

This development code remains bound to **127.0.0.1**. No general attacker-controlled destination, password-guessing, exploit payload, device controller or high-rate traffic generator is provided.

## Release status

This is a draft PR on top of unmerged v15 and earlier changes. The exact v16 commit must pass Node tests, frontend build, Rust checks and extension regressions, followed by manual macOS browser/UI review, before merging or producing a new DMG.
