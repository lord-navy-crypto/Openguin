# OpenPenguin Network Watch v0.5 — Capture Integrity and Desktop Evidence

This release strengthens the existing **opt-in, one-active-tab** Chrome/Chromium Manifest V3 browser diagnostic extension. It retains v0.4's health dashboard, v0.3's localhost integration, the original events, downloadable reports and optional 30-day local journal. It does not expand browser permissions or auto-start monitoring.

## Why this update

Chrome may stop and later restart a Manifest V3 service worker. Ephemeral global counters therefore cannot be trusted to represent a long-running capture session. Webpage instrumentation is also untrusted: a page can interfere with injected scripts and the data they send. See:

- Chrome's [extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- Chrome's [extension security guidance](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)
- OWASP [Browser Extension Vulnerabilities Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html)

## Implemented

1. **Session receipt evidence**: when a user presses Start, the popup records a local start timestamp and resets its current-session count. Each accepted page event updates the receipt counter and time in `chrome.storage.local`, serialized with the pre-existing event write queue. The counter survives a service worker restart. Optional browser-wide download notifications do not increase the active-tab page counter.
2. **Foreground capture-state transparency**: popup displays whether this tab or another tab is targeted, receipt count, last accepted event age, elapsed idle warning, and a short reason if collection ended. This is *receipt metadata*, not proof the browser observed every request.
3. **Explicit reasons for stopping**: user stop, closed monitored tab, navigation away, loss of optional persistent host permission, temporary activeTab permission loss, or failure to restore the injected monitor.
4. **Prevent late events after Stop**: page events waiting behind asynchronous storage writes are discarded when monitoring has been disabled or the selected tab changed.
5. **Validate sender provenance**: require the reported tab to match the user-approved active tab/host. Where supplied by Chrome, require the sender to be this extension and to be in the main frame; do not accept messages from another extension or subframes. A hostile webpage may still fabricate page-level events, so reports are never treated as cryptographic proofs of network traffic.
6. **Desktop compatibility**: original `source: openguin-network-watch` and `formatVersion:1` are unchanged. The regular diagnostic report includes an optional, bounded `captureSession` object containing only local receipt timestamps, counts, monitor state at export and one of seven recognized stop reasons. Desktop OpenPenguin validates this object, shows a Capture Integrity section, and includes it in the combined diagnostic bundle.
7. **Safety limits**: no reading page content, credentials, cookies or network request bodies; no new host permissions, background traffic, outbound telemetry, automated request sequences, or remotely controllable monitor.

## Reproducible QA

1. Load the extension from `browser-extension` via Chrome `chrome://extensions` > Developer mode > Load unpacked.
2. Open a site you control or OpenPenguin's `http://127.0.0.1:19090/workbench` demo. Click **Start this tab** and manually trigger normal page actions. The session counter and last receipt time should advance if instrumented events occur.
3. Click **Stop monitoring**. Further page events must not append. The popup should show the user-stop reason and not claim that monitoring remains active.
4. Reload with and without the separately approved optional localhost/ChatGPT permission. A temporary session should stop; an approved persistent session may be reattached on that host after the document loads.
5. Navigate off the selected host, close the tab, and revoke any optional monitoring permission. In each case the monitor should stop with a meaningful reason, without changing the opt-in download journal.
6. Export **Download JSON report** or **Copy diagnostic report**. In the OpenPenguin desktop Browser incident panel, import the JSON and review the Capture Integrity section. A report lacking `captureSession` remains supported.
7. Inspect aggregate v0.4 health and v0.3 localhost reports separately. They remain available and are not replaced by the v0.5 session metadata.

## Automated testing / release

- `tests/extension-capture-integrity-v19.test.mjs`: service-worker restart, accepted-event counters, active tab enforcement, sender id and main-frame requirements, no events after stop, tab close, permission revocation and UI/report wiring.
- `tests/network-observatory.test.mjs`: desktop's guarded capture-session parsing, time ordering and stop-reason allowlist.
- `.github/workflows/network-observatory.yml`: all historical browser tests, desktop, frontend, native Rust and extension ZIP packaging.

This source is delivered via a **stacked draft PR**, not an already installed or released DMG/ZIP. Build success at the exact commit and manual browser QA are required before release.
