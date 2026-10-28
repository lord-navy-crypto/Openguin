# Security Toolbox v6 — Website and CI Configuration Lint

This feature branch builds on v5 without changing AI Model Lab, Ollama, Network Doctor, browser monitoring, or existing Security Lab workflows. All four new checks are **offline and manually triggered**. They cannot send HTTP requests, probe services, read local secrets, execute an HTML page or run a GitHub Actions workflow.

## Tools

| Tool | Supplied evidence | Defensive findings |
| --- | --- | --- |
| CORS Response Reviewer | Manually pasted HTTP response headers from an owned web service | Duplicated origins, credentialed wildcard browser incompatibility, null origin with credentials, invalid/multiple origins, potentially missing Vary: Origin |
| Private HTTP Cache Reviewer | Pasted Cache-Control and selected response headers | Review shared-cache directives alongside identity signals, conflicting public/private, difference between no-cache and no-store |
| Subresource Integrity Lint | Pasted HTML script/link tag snippet | External script/stylesheet references without integrity, malformed SHA-256/384/512 digest syntax, absent crossorigin for external SRI references |
| GitHub Actions Workflow Lint | Pasted workflow YAML fragment from the user's own repository | Broad GITHUB_TOKEN write permissions, pull_request_target/workflow_run review, unpinned action refs, downloaded scripts piped into shell, certain untrusted event interpolations |

## Limitations and privacy

- CORS is a browser cross-origin read control, **not authorization**. A wildcard with credentials usually causes a browser error, not direct proof of a security exploit.
- Cache policy conclusions depend on actual response content, headers and CDN behavior. A Set-Cookie header alone is not evidence that private data was exposed.
- SRI lint checks string formatting and attribute presence only. It does not fetch dependencies to compare actual bytes and does not cover dynamically injected resources.
- GitHub Actions lint is a lightweight regex heuristic rather than full YAML AST; it can miss expressions and produce false positives. Pinning by SHA alone is not sufficient security review.
- The input is capped and is cleared on successful analysis. Reports are authored from known rule messages and counts only; pasted origins, cookie values, URLs, workflow steps and other raw text are not exported.
- Neither a lack of findings nor a low number of findings means a website, repository, CI workflow or file is secure.

## Validation

- `tests/defensive-lints-v6.test.mjs` covers the four engines, safe exports and input limits.
- The existing GitHub Actions macOS workflow runs these tests before `npm run build`, then native Rust check and Chrome extension tests.
- Before releasing a new DMG, confirm the latest commit's green CI run, verify browser UI tabs and JSON exports on macOS, and ensure no regression to AI and network tools.

References:

- [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
- [MDN Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity)
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use)
