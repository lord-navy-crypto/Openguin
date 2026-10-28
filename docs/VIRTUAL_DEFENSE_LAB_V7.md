# OpenPenguin Security Toolbox v7 — Virtual Defense Lab

## What is implemented

The Security Lab now includes an **in-memory virtual website and defensive training simulator**. This is a controlled practice environment for learning how rules interact with different patterns of traffic. It does not send requests to localhost, external websites, or any user-supplied destination.

The mock website shows four view-only areas: virtual home page, virtual catalog, virtual account centre, and virtual API/service panel. They are React presentation state, not real HTTP routes.

### Six deterministic training scenarios

- Normal day-to-day synthetic access
- Legitimate campaign/launch traffic increase
- Simulated abnormal activity burst
- Simulated sign-in failure anomaly, with no passwords or real account attempts
- Slower service responses and synthetic server-side errors
- Mixed incident scenario

All events are generated locally from a bounded numeric seed, with fixed model limits. There are no addresses, ports, credentials, attack strings, shell commands, network calls or arbitrary target identifiers.

### Defender controls

The user can change four *simulated* thresholds:

1. Maximum virtual events per actor per minute (2–60)
2. Maximum simulated failed sign-in events per actor in each five-minute training window (1–12)
3. Slow response alert threshold in milliseconds (300–5,000)
4. Server-error observation threshold per minute (1–15)

These do not change browser, operating-system, network, server, firewall or WAF configuration. The simulator compares synthetic pre-labeled anomaly/normal events against the policy's allowed/blocked decisions. It shows correct blocking, false blocks of ordinary events, anomalies still allowed, legitimate availability, simulated alert counts and a ten-minute time histogram. Event inspection displays only fictional categories and explanation codes.

## Defensive training workflow

1. Open Security Lab > Virtual Defense Lab. Choose a virtual website view; note the tool reports **0 network requests**.
2. Select the normal-traffic baseline, run the exercise and record the number of false positives.
3. Select a legitimate event peak and compare how overly strict rate controls affect innocent activity.
4. Select the virtual anomalous-burst or sign-in-failure scenario. Compare stronger and weaker policies.
5. Use the slow-service scenario to distinguish reliability alerts from unwanted traffic.
6. Export a report of summary statistics and policy observations to discuss defensive tradeoffs.

This teaches *defender-side detection and response judgment*. No offensive payloads, password guessing, exploitation routines, attack request generation or performance-stress features exist in the implementation. Even when the user owns a real site, this simulator never interacts with that site.

## Privacy and limitations

- The only persistent artifact is a **user-clicked** JSON export of aggregate synthetic results.
- The export intentionally excludes per-actor virtual records, even though those are fictional.
- Each seeded run is reproducible; its metrics are not evidence of how a real production site will behave.
- False-positive and true-positive labels are model-generated, not ground-truth network forensics.
- The simulator is not a real local web server, penetration-testing platform or live WAF.
- Real defensive configuration checks remain available independently in the existing CORS, CSP, HTTP response, network observer and access-log analysis modules.

## Testing and release gate

`tests/virtual-defense-simulator.test.mjs` covers all six deterministic scenarios, expected policy tradeoffs, sign-in and response alert categories, classification invariants, bounds and sanitized export. The macOS GitHub Actions workflow includes the tests, frontend TypeScript build, Rust check and browser-extension regression tests. Check the **exact commit** before merging or distributing a DMG.

This feature branch depends on v6; its PR should remain draft until CI and manual UI review have both passed.
