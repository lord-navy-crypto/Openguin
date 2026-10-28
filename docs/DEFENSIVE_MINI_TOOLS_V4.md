# Defensive Mini Tools v4 — design and verification

This feature is on a draft branch layered on top of Security Toolbox v3. It is not a full penetration testing suite, does not exploit targets, and should not be described as certified, exhaustive, or ready for DMG distribution until CI and platform review are completed.

## Tools (all user-initiated)

1. **CSP Policy Checker:** paste an existing Content-Security-Policy value or header. Parses semicolon-delimited directives, duplicate directives, wildcard script source, unsafe inline/eval modes, and selected important omitted restrictions. This static lint cannot determine the deployed policy's real enforcement or all browser compatibility behavior.
2. **security.txt Validator:** validates pasted disclosure contact and expiry information against the requirements of RFC 9116, including Contact URI scheme, Expires date and HTTPS Canonical hints. It cannot verify hosting path, HTTPS deployment, signatures or ownership. Use the official path `/.well-known/security.txt`.
3. **DNS Configuration Review:** inspect user-pasted basic DNS record text (owner, optional TTL, IN, record type, value). Detect SPF duplicates, SPF +all, DMARC monitoring policy, absence of CAA in the provided sample and parse omissions. No DNS queries, DNSSEC verification or complete zone-file parsing. Absence in this sample is not absence online.
4. **URL Structure & Privacy:** parse a manually pasted URL without navigation. Warn about HTTP scheme, URL-embedded credentials, internationalized Punycode hostnames, IP literals and query/fragment privacy. No threat-intelligence reputation score, proof of phishing or external lookup.
5. **robots.txt Review:** parse the content of a manually pasted robots.txt file, counts User-agent, Disallow and Sitemap entries, and reminds site owners that Disallow is not access control. URLs and excluded path values are not retained in findings.
6. **Local File Integrity:** SHA-256 digest computed through browser Web Crypto on a user-selected file limited to 16 MiB. Optional manual comparison with the official checksum. File bytes never leave the browser runtime and are not copied to diagnostic exports. Hash equivalence verifies matching bytes, not freedom from malware.

## Security/privacy contracts

- All textual inputs have bounded sizes, and findings return only a small allowlist of human-written messages and numeric counts. Pasted domain records, URLs and contact identifiers are not echoed back into exported reports.
- All functions run without network requests; neither a DNS query nor an HTTP request is triggered by these tools.
- No exploit automation, credential guessing, scanning of third-party sites, packet sniffing, arbitrary request replay or DDoS functionality.
- User-facing warnings are contextual observations, not proof of insecure deployment or malicious activity.
- The existing OpenPenguin AI Model Lab, Ollama, browser/network diagnostic tools and Security Lab incident workflows stay available.

## Verification

CI includes `tests/defensive-mini-tools.test.mjs` plus existing security analysis, frontend build, Rust checks and extension validation. First confirm the earlier v3 test-order regression is fixed (bundle defensive header audit before running the action-plan test). Exercise the desktop WebCrypto hash path manually on macOS, verify all six tabs and local JSON downloads, and inspect all user-provided text for sensitive data before sharing reports.

References:
- RFC 9116: https://www.rfc-editor.org/rfc/rfc9116.html
- OWASP Secure Headers Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- MDN Content Security Policy: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
- Web Crypto: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
