# Security Toolbox v8 — Editable Virtual Site Builder

Security Lab now includes an editable **in-memory mock website** with public/member/admin pages, resource ownership rules, forms, sessions and synthetic defense scenarios. It does **not** create a real localhost web server, bind a port, browse a production site or generate attack traffic.

## Implemented features

- Three site templates: community, classroom, store. Each contains six virtual pages including public content, members-only content, an owner-scoped resource, a form and admin areas.
- Edit site title and page labels, required role, owner-only requirement, whether a page changes state and whether input validation is required.
- Scenarios: normal access, guest-to-member page, member-to-admin area, other user's synthetic record, expired session, missing state-change verification, malformed form marker (no attack content), synthetic server fault and mixed case.
- Six defense switches: role enforcement, record ownership, session expiration, CSRF-like state-change marker, field validation and generic error handling.
- Deterministic virtual HTTP statuses (200/401/403/422/500), per-event trace, missed expected denials, false denials and generic-error leakage flags.
- Compare an intentionally permissive educational policy to a protected policy using identical synthetic events.
- Export aggregate-only JSON omitting user-entered labels and individual events, plus fully synthetic Apache access.log and browser-journal JSON fixtures compatible with the existing offline analyzers.

## Practice path

1. Select a template and optionally edit the simulated roles and page requirements.
2. Choose a scenario such as resource ownership or expired session.
3. Run with defenses enabled. Observe the conceptual HTTP status and rejection reason.
4. Run the same fixture under the educational comparison preset. Examine missing safeguards and the differences in missed-denial counts.
5. Restore protections, rerun, and compare. Review the synthetic access.log and browser journal using the existing offline tools.
6. For a real website you own, use separate passive logs, configuration reviews and normal application regression tests. This simulator makes no assertions about real site security.

## Safety and privacy

Everything is synchronous in-memory TypeScript. No network client, target host, listening port, captured credentials, XSS/SQLi payloads, password trials, exploit execution, load testing or scanning. Synthetic logs use only loopback IP and fixed invented route IDs; the mock browser log uses the fictional virtual.local label.

The mock site is not an actual deployable website and does not reproduce complete web framework, authentication, database or browser behavior. No findings certify a site's security. User-supplied site/page labels are omitted from aggregate exports.

## Implementation

- src/virtual-site-builder-v8.ts: templates, scenarios, defenses, reports, synthetic evidence
- src/VirtualSiteBuilderV8.tsx: visual editor, toggles, trace, comparisons
- src/virtual-site-builder-v8.css: responsive interface
- tests/virtual-site-builder-v8.test.mjs: deterministic scenarios, permissions, privacy and import compatibility
- .github/workflows/network-observatory.yml: test run before frontend build, native Rust and extension verification

Manual macOS UI inspection and exact-head CI pass are required before this draft PR is merged or a new DMG is released.

Reference background: OWASP Authorization Cheat Sheet; OWASP CSRF Prevention Cheat Sheet; OWASP Web Security Testing Guide.
