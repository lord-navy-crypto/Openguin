# OpenPenguin Security Toolbox v12 — Hands-on Object Ownership Lab

This update adds a **real, browser-operated localhost-only access-control training exercise** to the existing v9–v11 HTTP lab. It is designed to teach the consequences of missing server-side object ownership checks and how to verify a repair. Only fixed fictional records and invented sessions exist; there is no attacker-controlled target URL or real user data.

## Start the local server

From the project source checkout with Node.js:

```text
npm run security:lab
```

Open http://127.0.0.1:19090/ in your own browser. Create a **Demo member** fictional session, then open:

- http://127.0.0.1:19090/ownership-lab — security exercise controls
- http://127.0.0.1:19090/workbench — one-click fixed-route HTTP inspector
- http://127.0.0.1:19090/access-log — sanitized HTTP results

The server is bound only to IPv4 127.0.0.1, not an internet or LAN interface. The existing DMG does not auto-launch or package this standalone Node.js development server.

## Repeatable manual learning cycle

1. Start in **OWNER CHECK ENABLED** mode, the secure default. Follow the **Read own fictional record** link: the fixed, invented training record A responds with HTTP 200.
2. Visit **Try other fictional member record**: the server checks record ownership and responds with HTTP 403.
3. Return to Ownership Lab. Deliberately enable **INTENTIONALLY INSECURE TRAINING MODE** using its CSRF-protected local form.
4. Visit the exact same other-record link. Its response changes to HTTP 200 and the page labels itself as invented training data.
5. Restore **OWNER CHECK ENABLED**. Retest: the response returns to HTTP 403.
6. Open the localhost HTTP Workbench and compare the fixed **own record** and **other record** checks. Export the local access.log and inspect it in OpenPenguin's existing Server Access Log Investigator.

The mode is isolated to the current **invented member session**; other sessions remain secure by default. Sessions expire after five minutes or at logout. The insecure teaching mode does not affect real processes, storage, files, websites, or application security policies.

## Safeguards

- The only data served is prewritten text: "DEMO RECORD A" and "DEMO RECORD B". No real people, users, passwords, documents, or account records exist.
- Modes are limited to exactly "training" and "protected"; a valid local member session and server-issued CSRF token are required. Modes cannot be activated by URL parameters.
- No arbitrary file path, resource ID, remote hostname, payload, command execution, password guessing, exploit module, attack-device controller or traffic flood is implemented.
- No background requests. The Workbench makes at most one fixed same-origin HTTP request per explicit click.
- Access logs retain only fixed loopback IP, allowlisted path, method, timestamp and HTTP status. Cookies, tokens and request bodies are absent.
- Successful lab tests demonstrate only this intentionally simplified teaching example; they do not certify the security of a real website.

## Implementation and automated validation

- scripts/localhost-defense-lab.mjs: fixed record routes, session-scoped mode switch and on-page controls.
- scripts/localhost-http-workbench.js: manual 200-vs-403 comparison for own and other mock records.
- src/LocalhostManualLab.tsx: launch link to the new lab.
- tests/localhost-defense-lab.test.mjs: real loopback HTTP tests for protected defaults, deliberate missing-check demonstration, session isolation, CSRF, restore, and sanitized Apache log compatibility.
- .github/workflows/network-observatory.yml: macOS tests and frontend/native/extension checks.

Before merge or packaging: the exact v12 head must pass CI and the new browser experience needs manual macOS GUI QA. The PR is based on unmerged v11 and remains draft.
