# Security Toolbox v5 — Defensive code and web-configuration checks

## Overview

This branch adds four **working offline review tools** to the existing six Security Toolbox v4 mini tools. It does not modify the original AI Model Lab, Ollama, app socket observatory, browser journal, local server-log analysis or cross-source evidence correlation. Source: `src/defensive-auditors-v5.ts`; UI: `src/DefensiveAuditorsV5.tsx`.

## New tools

| Tool | Input and scope | Result | Limits |
| --- | --- | --- | --- |
| Cookie Security Reviewer | Manually pasted Set-Cookie response headers from a website under your control | Counts missing Secure, HttpOnly, SameSite; invalid SameSite=None+Secure combinations, __Host-/__Secure- attributes, Domain scope | Does not infer which cookies contain session credentials; never outputs cookie name/value |
| npm Dependency Manifest Auditor | Local JSON pasted from package.json or package-lock.json | Floating versions, nonstandard remote sources, workspace dependencies and hasInstallScript signals from lockfiles | Does not query vulnerabilities or license database, inspect actual install or confirm supply-chain safety |
| Potential Secret Exposure Reviewer | Locally pasted source/configuration snippet from a project you control | Only pattern categories and aggregate counts for private-key boundaries, high-confidence token patterns and sensitive assignments | False positives/negatives; does not output matched text, secret values or raw code |
| File Signature Reviewer | Local file explicitly chosen by user; browser reads at most first 8 KiB | Detects common PDF/PNG/JPEG/GIF/ZIP, ELF/PE/Mach-O, shebang and HTML signatures, some extension mismatches | Does not execute file, validate code signatures, decompress content or scan for malware |

All checks are run only when the user chooses the specific tool. The results stay in the current page session; exported JSON contains only typed rule descriptions and statistics, and never the original text or file bytes. There is no HTTP request or external scanning. File selection is capped at 100 MiB by UX; only the first 8 KiB is read.

## Why this matters

Following OWASP's Session Management and Secrets Management guidance, the tools are intended to help website maintainers identify *configuration review topics*, not prove exploitability or intrusion.

- OWASP Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP Secrets Management: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- NPM lockfiles: https://docs.npmjs.com/cli/configuring-npm/package-lock-json

## Validation and release gate

The GitHub Network Observatory macOS CI builds frontend, checks Rust and extension JavaScript, and runs the existing security regression tests. v5 adds `tests/defensive-auditors-v5.test.mjs` to validate the new reviews, redaction and bounded inputs. Before releasing, confirm CI for the **exact v5 commit**, manually exercise all four new tabs and download exports, and verify Chrome extension and AI features remain functional.

Do not treat a draft PR as a published DMG or claim malware/vulnerability detection from these offline heuristics.
