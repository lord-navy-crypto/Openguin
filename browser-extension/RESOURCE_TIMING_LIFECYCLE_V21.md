# Network Watch v0.7 — Browser Resource Timing Visibility & Clean Stop

This is a targeted reliability and privacy update to the **opt-in** OpenPenguin browser diagnostics extension. It preserves all v0.3–v0.6 features, including single-active-tab monitoring, the localhost laboratory, desktop Browser incident report import, request lifecycle indicators, the manually enabled journal and optional download sampling. Manifest permissions have not changed.

## Authoritative references

- [Chrome extensions: activeTab and scripting](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) — user-triggered page access with narrow permissions.
- [Chrome extensions: Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — background worker state and lifecycle.
- [MDN: PerformanceResourceTiming.responseStatus](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus) — `responseStatus=0` can reflect cross-origin visibility restrictions rather than a failing HTTP response, and browser support is uneven.
- [MDN: PerformanceResourceTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming) — Timing-Allow-Origin and cross-origin timing restrictions.
- [OWASP Browser Extension Vulnerabilities](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html) — minimize privileges, avoid leaking browsing data, treat page-originated messages as untrusted.

## Implemented changes

### 1. Clean Stop and repeated reuse

The page monitor previously restored its patched Fetch/XHR functions and disconnected PerformanceObservers when the user clicked Stop, but kept global `error`, `unhandledrejection` and `message` event listeners on the document. These inert listeners would accumulate after repeated Stop/Start cycles.

The v21 monitor now retains named references to all three handlers and unregisters each on Stop. Observers and timers are disconnected as before. New regression tests repeat Stop/Start eight times and assert the listener counts return to zero and original network APIs are restored each time.

### 2. Distinguish missing resource timing data from real HTTP failures

The resource PerformanceObserver only emits a single `resource-timing-limited` **observation** per manually started monitoring session when a cross-origin resource has an unavailable or zero `responseStatus`. It does not record the destination address or request body. Crucially, this event is **not** counted as a network failure, blocked request or server error.

For existing `slow-resource` observations, cross-origin URL paths are replaced by the fixed label `/:cross-origin` rather than exporting arbitrary destination paths. This preserves the fact that a resource was slow without disclosing its pathname. Existing same-origin slow-resource timing still works.

The new observation kind is included in the extension's existing event schema, the popup's optional diagnostics and long-term journal, the passive Browser Health model and desktop Browser incident import. The popup and desktop UI explain what is unavailable, without claiming that the site is malicious or healthy.

### 3. Diagnostics evidence and limits

The Browser Health summary counts `resourceTimingLimited` separately from `transportErrors`, and appends a data-quality note if any limitations were seen. No additional network access, permissions, automatic probes or background logging is added.

The presence or absence of this flag is not a reliable test of CORS configuration, server behavior or exploitability. User-controlled page scripts may forge or suppress instrumentation events. Resource Timing fields also depend on browser support.

## Manual acceptance checklist

1. In Chrome/Edge Developer Mode, load the `browser-extension` directory from v21. Open a site you own or the OpenPenguin localhost practice website, then click **Start this tab**.
2. Run a few **ordinary** page interactions. The existing health dashboard and HTTP events should still update.
3. Click **Stop monitoring**, then **Start this tab** on the same document, repeatedly. Confirm normal browsing remains functional and duplicate network hooks do not accumulate.
4. When cross-origin timing data are unavailable, the popup may show a `resource-timing-limited` warning. Compare against the browser DevTools Network panel to distinguish restrictions from actual HTTP errors. The warning should not increase the HTTP error or 5xx count.
5. Export the normal diagnostic JSON and import it in OpenPenguin's desktop Browser incident panel. The warning should appear with an explanation, and prior v17–v20 reports remain compatible.
6. Inspect exported slow-resource records: cross-origin path metadata must be replaced by `/:cross-origin`.
7. Run CI test suites and check the extension ZIP artifact contains the v21 instructions.

## Release gates

This is a **stacked draft PR** on v20, not a merged or installed release. Exact-head GitHub Actions results and manual Chrome UI verification are required prior to release. The source checkout does not create a new DMG.
