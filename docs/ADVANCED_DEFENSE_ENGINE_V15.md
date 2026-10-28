# OpenPenguin Security Toolbox v15 — Advanced Offline Defensive Engineering Model

The v15 workbench develops the already-running localhost training environment with a more thorough but **non-operational** security engineering simulator. It is meant for teaching the reasons behind effective authentication controls, object-level authorization, validation, rate limiting and capacity/backpressure. It is not a password cracker, exploitation framework, load generator, remote scanner or penetration-test tool.

## Grounding

- OWASP [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html): rate limiting and lockout policies must consider false lockouts and availability.
- OWASP [API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/): broken object-level authorization, broken authentication and unrestricted resource consumption.
- NIST [SP 800-63B-4](https://csrc.nist.gov/pubs/sp/800/63/B/4/final): authentication protections and limitations on failed authentication attempts. Model policy thresholds below are **arbitrary teaching parameters**; do not interpret them as NIST requirements or actual attack-effort budgets.

## Start

In a source checkout of the v15 branch with Node.js:

```bash
npm run security:lab
```

Visit **http://127.0.0.1:19090/defense-engine** in a browser on the same machine. The desktop Security Lab React page also provides a link. Stop the Node process with Ctrl+C. No new DMG is bundled here.

## Features

1. **Queue and capacity teaching**: preinstalled 16-slot regular / release / restoration curves, with per-slot arrivals never exceeding 12 conceptual units.
2. **Manually adjustable, finite policies**: fictional processing capacity 3/5/8, backlog queue 2/5/8, throttle 3/5/8 and fictional failure protection threshold 2/3/4. These are small preapproved numbers, not server settings or requests per second.
3. **Conservation rule**: total synthetic arrivals must equal processed + throttled + overflowed + still queued. The simulation checks this invariant.
4. **Comparison**: evaluate protected vs. teaching-contrast policies using identical synthetic arrivals. Show processed events, throttled events, conceptual 503 capacity outcomes, backlog peaks and final backlog.
5. **Conceptual latency**: virtual latency units are a simplified queue indicator, **not milliseconds** and not an estimate of user experience on a real server. P95 and maximum values are derived from the fixed 16-point series.
6. **Usability guardrail**: estimate how many normal fictional requests might be affected by indiscriminate throttling using an explicit 70% fictional regular-user mix assumption. This is not real false-positive detection.
7. **Credential-free auth model**: a prewritten sequence of “failed event” and “recovery” labels, showing the impact of a bounded virtual guardrail without any usernames, passwords, hashes, wordlists or guessing algorithm.
8. **Non-executable authorization and validation matrix**: fixed conceptual owner record, role, form-origin and input-validation checks, with status comparison and short remediation concepts; no exploit strings or target paths.
9. **Responsive, server-rendered time-slot visualization**: 16-slot table with compact bars. Form submission is one manual request to the same fixed localhost server; the simulation produces zero additional HTTP requests.
10. **CSV summary**: 16 data rows, aggregate only; no sessions, cookies, addresses, request bodies, credentials or payloads.

## Safe workflow

Choose one regular-traffic pattern. Run the model, review rate throttling, virtual unavailability and backlog. Change **only one parameter** and rerun, considering the tradeoff between virtual availability and overly aggressive throttling. Separately inspect the safe v9-v14 one-click localhost training checks and sanitized access.log for actual single-transaction HTTP status behavior.

The model never launches socket traffic or intentionally consumes compute resources. It does not determine real-world throughput, credential resilience, exploitability or vulnerability status. It cannot be pointed at a public or private site. The only HTTP traffic created by operating the page is the user's individual local form submission.

## Verification

- `scripts/defense-engine-v15.mjs`: bounded pure offline simulation and aggregate CSV.
- `scripts/localhost-defense-lab.mjs`: localhost-only HTML model controls and export route.
- `tests/defense-engine-v15.test.mjs`: 243 fixed scenario combinations, queue conservation, reproducibility, option validation and privacy tests.
- `tests/localhost-defense-lab.test.mjs`: localhost form, CSRF, Host/Origin boundaries, parameter rejection, CSV and sanitized Apache log compatibility.
- `src/LocalhostManualLab.tsx`: direct link from OpenPenguin.
- `.github/workflows/network-observatory.yml`: macOS Node+frontend+Rust+extension regressions.

This is a draft feature stacked on v14. **The exact v15 head must pass CI and manual browser/macOS GUI review before merge or release.**
