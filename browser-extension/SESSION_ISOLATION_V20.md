# OpenPenguin Network Watch v0.6 / v20 — Manual Session Isolation and Reliable Stop

This work builds on v19's Chrome/Chromium Manifest V3 single-active-tab network diagnostics. It retains the existing localhost laboratory integration, desktop Browser incident import, request timing, privacy-limited exports, optional downloads/journal, and v19 capture receipt/stop-reason UI. No permissions are added.

## Why change it?

The v19 implementation already checked whether monitoring was enabled before it wrote a page event. But a rapid **Stop → Start** on the **same tab** could let an event accepted under the old session complete its asynchronous storage write during the new session. Similarly, a repeated event could be suppressed as a duplicate merely because a previous session observed the same source timestamp. Finally, Stop used an asynchronous window.postMessage dispatch, making quick restart sensitive to the message event loop.

Chrome documentation recommends that Manifest V3 service workers persist essential state and tolerate suspension:
https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

Chrome's content script documentation and OWASP Browser Extension Vulnerabilities guidance require treating page messages as untrusted:
https://developer.chrome.com/docs/extensions/develop/concepts/messaging
https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html

## Implemented in v20

1. **Persisted capture generation**. Each explicit Start increments a bounded local `captureGeneration`, stored alongside the selected tab/host. This is a session consistency marker, not a secret and not an authentication credential.
2. **Second-generation check at write time**. Page events are accepted for processing only if the tab/host and current monitoring state match. Immediately before writing to local storage, they are checked again against the generation captured when they entered the event pipeline. An old queued event cannot be appended to a different generation.
3. **Per-generation duplicate fingerprints**. The same event metadata from separate human-started sessions is no longer erroneously merged by the in-memory five-second duplicate filter.
4. **Old timestamp filtering**. If a page event carries a timestamp clearly before the current session start, the extension discards it. Because page timestamps are untrusted, this is defensive consistency filtering and not cryptographic proof of event origin.
5. **Synchronous Stop command in the MAIN execution world**. The popup explicitly dispatches the Stop message synchronously inside the page through one permitted Chrome `scripting.executeScript` action. The existing monitor restores the original Fetch and XHR functions and disconnects its observers before a rapid next Start. The asynchronous receipt and persistent record checks remain defensive backstops.
6. **Preserved features and permission policy**. No new site list, `<all_urls>` permission, background polling, request capture, traffic generation or remote monitoring is introduced.

## Manual browser verification

From a source checkout of `feature/browser-session-isolation-v20`:

1. Open `chrome://extensions`, enable Developer mode, and use **Load unpacked** for the repository's `browser-extension` folder.
2. Open your own website or the local OpenPenguin training page `http://127.0.0.1:19090/workbench` (after running `npm run security:lab`).
3. Click **Start this tab**, then perform several ordinary manual Fetch/XHR interactions. Verify that the capture receipt count increases.
4. Click **Stop monitoring**, then immediately **Start this tab** on the same document. Perform one fresh action and verify that the new session begins cleanly rather than inheriting previously queued events.
5. Compare the new session's received-event counter and normal diagnostic export. Old locally retained event history is intentionally kept until manually cleared; **capture receipts count only events in this started session**, not all historical events.
6. Navigate to another site, revoke optional localhost reload permission, or close the tab. Ensure the extension stops as previously documented in v19. No event from the old session should appear as a new-session receipt.
7. Run `npm run security:lab:test` for localhost exercises. GitHub CI additionally runs `tests/extension-session-isolation-v20.test.mjs` and the existing browser/desktop/native regression checks.

## Safety and limitations

The extension only monitors tabs deliberately activated by their user, and monitors metadata rather than passwords, page text, cookies, bodies or private documents. A webpage may still interfere with MAIN-world hooks or forge page-originated messages. This monitoring feature is a troubleshooting instrument, **not a packet capture, security certification, password attack or high-load testing tool**.

This remains a stacked draft development PR until exact-commit CI, a Chrome/Edge manual UI check, and extension ZIP packaging verification succeed. No new installed app or DMG is implied.
