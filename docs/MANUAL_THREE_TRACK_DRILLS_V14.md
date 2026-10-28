# OpenPenguin Security Toolbox v14 — Manual Three-Track Training

v14 adds a **human-operated, localhost-only training console** at `/drills`. The goal is to experience how three classes of defensive response behave before and after a teaching-policy change, with **real HTTP responses for each manual click** and **entirely imaginary security events**.

It does **not** ship a password cracker, exploitation framework or high-traffic generator. Nothing is concealed in the interface. Localhost binding is defense-in-depth and is not authorization to create transferable harmful capabilities.

## Run

From the OpenPenguin source checkout with Node.js installed:

```bash
npm run security:lab
```

Visit **http://127.0.0.1:19090/drills** on the same machine. Stop the process with Ctrl+C.

The currently released DMG does not package or start the Node.js training server. A direct link has been added to the Security Lab React pane.

## Three manual tracks

| Track | One click models | Protected response | Teaching comparison |
| --- | --- | --- | --- |
| Fictional identity | One invented unsuccessful authentication event **without any username/password or candidate guessing** | First three clicks 401, subsequent clicks 429 in a 60-second window | Repeated 401 with count bounded at 6 |
| Fictional object access | Attempt to view a single fixed made-up member record | 403 | 200 with no private or sensitive record exposed |
| Virtual capacity | Increase a numeric queue counter **without generating any traffic or compute load** | First three steps 200, further steps 429 | First three 200, further steps conceptual 503 |

The user explicitly selects a track, taps **one event**, and observes the **actual localhost HTTP response status**. Separate CSRF-protected controls switch between protection and education modes or reset a track. Each track is independent.

The purpose is not to run attacks: for identity, no password is entered or guessed; for ownership, no arbitrary object ID or real data is accepted; for capacity, no packets, concurrent requests, stress load or server jobs are created. Each explicit click is exactly one low-volume local HTTP form submission.

## Suggested hands-on workflow

1. Run one step in protected mode and record the actual HTTP status.
2. Continue the fictional identity or virtual queue track until the bounded defense threshold is reached; in the object track observe the immediate 403.
3. Switch that track to **Teaching comparison**, then perform one manual step (or a few manual capacity steps) and compare the resulting status.
4. Restore **Protected** and verify the change again.
5. Download `/drill-report`: a bounded, synthetic, **per-session** JSON history without credentials, tokens, account names, IPs, payloads or request bodies.
6. Download `/access-log`: a sanitized record of the **real local HTTP transactions** that produced the responses, compatible with the existing OpenPenguin Server Access Log Investigator.

## Architecture and privacy

- `scripts/manual-drills-v14.mjs`: synchronous, bounded in-memory training state. 64 token-scoped identities max; 30 recorded actions max per identity; counts cap at 6. No networking APIs.
- `scripts/localhost-defense-lab.mjs`: fixed `/drills`, `/drill-step`, `/drill-policy`, `/drill-reset`, and `/drill-report` routes. HTTP server listens only on `127.0.0.1`; no target form fields or outbound requests.
- Form submissions are restricted to the four known routes, three fixed tracks and two fixed modes; require a locally server-issued CSRF token. Unrecognized choices return 422 and forged CSRF returns 403.
- All exercise data are prewritten and fictional. Reports exclude user inputs, raw cookies, session tokens and browser contents. User-controlled request paths or payloads cannot be injected into the event generator.
- This is not a benchmark, penetration test, cryptographic assessment, or evidence of a real site's security.

## Verification and release gates

- `tests/manual-drills-v14.test.mjs`: pure-state protection thresholds, mode comparison, per-token isolation, strict bounds and privacy.
- `tests/localhost-defense-lab.test.mjs`: end-to-end loopback HTTP 401/403/429/503, CSRF, bad inputs, sanitized exports, parser compatibility, per-identity separation.
- `.github/workflows/network-observatory.yml`: macOS CI runs v14 and older test suites, builds frontend, checks native Rust commands and browser extension.
- CI must pass at the exact v14 head; manually check macOS GUI and exports before merging. This work remains a draft PR stacked on unmerged v13 and its predecessor branches.
