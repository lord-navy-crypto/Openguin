# Openguin Network Watch — browser extension

A minimal Chrome/Chromium Manifest V3 extension for opt-in diagnostics of the active HTTP(S) tab.

## v0.4.0 — Passive browser health and capture-quality dashboard

The popup now has an additional **网页运行概况 / Browser health** section. It summarizes only already-captured (opt-in) sanitized events and does not activate monitoring, expand host permissions, or make any new requests. It retains **all previous v0.3.0 capabilities**, including the localhost lab export, ChatGPT and arbitrary single-active-tab diagnostics, optional download monitoring, and 30-day opt-in journal.

The new panel shows:

- Observed Fetch/XHR HTTP response counts, with 2xx/3xx/4xx/5xx family grouping and specific denied/limited signals (401, 403, 429).
- Human-observed browser median/P95 request timings; P95 requires at least three valid response samples. These numbers are **not measured server capacity or load-test results**.
- Requests that have a recorded start but no recorded terminal event, distinguishing recently-started work from starts older than 15 seconds. Missing terminal events can simply reflect navigations, missed capture or buffer truncation; this is **not proof of a server hang**.
- Local evidence-quality context: dropped events, deduplicated events, and warnings if the fixed 300-event cache may be truncated.
- A separate **Download privacy-limited health summary** button. This aggregate-only JSON contains no hostnames, URL paths, cookies, credentials, headers, payloads or exact per-event timestamps. It is for independent review/sharing; it is **not** the Desktop Browser incident report format.
- For the desktop application's **Browser incident report**, continue using the original **Copy diagnostic report** or **Download JSON report** buttons. The v17 localhost-lab JSON is also supported, and the desktop app recalculates its local HTTP metrics.

This feature follows Chrome MV3 official guidance on [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [permission declarations](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) and [service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), and [OWASP browser extension vulnerabilities](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html).

**Security and privacy tradeoff:** the monitor collects only metadata on tabs where the user explicitly starts it; the page bridge involves untrusted page-originated events. Results are clues, not independently authenticated network evidence. Do not infer that missing errors prove a site is secure or that a status code alone indicates an attack. The extension does not provide credential guessing, exploit payloads, traffic generation or passive collection of other people's private content.

### v18 validation checklist

1. Load the extension from the updated `browser-extension` directory and open any ordinary user-controlled website or local lab.
2. Click **Start this tab**; perform ordinary interactions, and observe that new HTTP-response and timing figures appear after reopening the popup.
3. Perform a few single-click Fetch/XHR requests in the OpenPenguin localhost Workbench; compare the popup's 401/403/429/503 observations with the localhost report and server access.log.
4. Use **Stop monitoring** and confirm that subsequent page interactions do not increase the page's captured events.
5. Try reloading with and without individually granted optional loopback permission, and confirm the monitor does not follow unrelated navigation.
6. Export the aggregate health summary. Confirm it contains only numeric counts/timings and quality notices, not hosts or paths. Import a **separate standard diagnostic JSON** for a complete desktop browser incident investigation.
7. The source CI validates JavaScript syntax, v17 permission boundaries, v18 telemetry bounds and privacy, macOS build, and ZIP contents.

---

## v0.3.0 — Match the OpenPenguin v9–v16 localhost defense labs

This version preserves all previous page, ChatGPT, download and optional 30-day journal diagnostics. It adds a dedicated **OpenPenguin Localhost Lab** panel and an **opt-in** reload permission limited to `http://127.0.0.1/*` and `http://localhost/*`. There is no broad `<all_urls>` host access, and no cookie, request-body, or response-body monitoring.

1. Launch the real local practice server from the v16 source checkout with `npm run security:lab`. It stays on `127.0.0.1:19090`.
2. Open **http://127.0.0.1:19090/workbench** in the browser, then click the extension icon and **Start this tab**. This is an explicit, temporary `activeTab` permission; the extension does not start recording on its own.
3. If you want monitoring to survive reload on that specific loopback host, click **Allow localhost reload monitoring** and approve the optional browser prompt. This does not grant monitoring of other sites. You can decline and simply start the tab again after reload.
4. Perform normal single-click **Fetch/XHR** checks in the lab workbench. Reopen the extension popup to see the local HTTP status summary. The extension counts observed responses from the preinstalled lab routes only, including 200, 401, 403, 422, 429 and 503.
5. Use **Download lab-only JSON for OpenPenguin**. The report uses `source: openguin-network-watch` and `formatVersion: 1`, retaining the desktop app's existing Browser incident report format while adding a `labCompatibility` section.
6. In the desktop OpenPenguin **Browser incident report**, import this JSON as you would any other extension report. The desktop app now reads the usual `events`, recalculates the v17 `labCompatibility` response counts from its sanitized, allowlisted localhost events, and displays a dedicated Localhost Lab summary with HTTP status distribution and observed median/P95; it does not blindly trust unverified summary numbers.

**Important capture scope:** monitoring hooks into the page's Fetch and XMLHttpRequest activity; a regular HTML form submission that navigates the whole tab may not expose its HTTP response status to these hooks. For the v12–v15 form-only exercises, use the lab's own redacted `/access-log` as the authoritative status evidence, or use v11/v16 Workbench buttons that issue Fetch. This extension does not run a broad, background `webRequest` capture or any load test.

**Privacy:** the lab-only export excludes all non-loopback domains, routes outside the fixed training allowlist, cookies, credentials, headers, bodies, query strings, arbitrary URL parameters and tab IDs. It preserves only a maximum of 300 already-sanitized local events and coarse status/timing metadata. Captures are on-device; there is no automatic upload.

**Authoritative design references:** [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [Chrome extension permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions), [Chrome webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest), and [OWASP Browser Extension Security Vulnerabilities Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html). In Manifest V3, request blocking with `webRequestBlocking` is unavailable to most extensions, and this diagnostic extension has no need for it.



## Install in Chrome, Edge, Brave, or another Chromium browser

1. Download the dedicated **Openguin-Network-Watch.zip** artifact from the repository's latest successful **Network Observatory checks** workflow, then extract it. The extracted folder should contain `manifest.json` directly. Alternatively, download/clone the full source repository and select its `browser-extension` subfolder.
2. Open `chrome://extensions` in Chrome/Brave, or `edge://extensions` in Edge.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the extracted extension folder containing `manifest.json` (do not select the ZIP file itself).
5. Open `https://chatgpt.com`, click the puzzle-piece Extensions menu, and pin **Openguin Network Watch** if desired.
6. Click the extension icon, then click **Start this tab**. Keep the tab open while reproducing the loading or response problem.
7. If you need to capture events after ChatGPT reloads, click **Allow ChatGPT reload monitoring** and approve the optional permission. This permission is limited to `chatgpt.com` or `chat.openai.com`.
8. After installing an updated extension version, reload the ChatGPT tab once to clear any old page-injected listeners, then click **Start this tab** once. The bridge now guards against repeated injection, but an already-open page may still contain listeners from an older version.
9. To monitor downloads, click **Enable download + timeout monitoring** and approve the separate downloads/alarms permission. This watches download metadata browser-wide, so only enable it if you want that additional coverage.

## Export a report and analyze it in Openguin

1. Reproduce the issue (for example, wait for a stuck response or failed download).
2. Click the extension icon. The recent-events list should show fetch/XHR errors, response statuses, long response gaps, script/resource errors, or download events if the relevant permission was enabled.
3. Click **Copy diagnostic report** to copy the redacted JSON, or click **Download JSON report** / **Download CSV table** to save a file under your browser's Downloads folder. The popup shows whether duplicate events were suppressed or older events were dropped after the 300-event buffer filled.
4. In Openguin, open **电脑网络体检 → 高级网络与浏览器诊断 → Browser incident report · 浏览器故障诊断**.
5. For copied JSON, click **从剪贴板分析**. For a downloaded JSON file, open it in a text editor, copy its contents, paste them into the report box, then click **分析粘贴报告**. The CSV is for spreadsheet review; use JSON when importing events.
6. After import, choose **复制完整诊断包**, **下载 JSON**, or **下载 CSV 表格**. This combines the browser timeline with the current desktop DNS/HTTPS checks, speed-test samples, VPN comparisons, local scan history, and suggested findings. Paste the copied JSON into a ChatGPT conversation for analysis, or attach the downloaded JSON file.

If the extension icon is missing, open the Extensions menu and pin it. If events appear duplicated, reload the page, click **Start this tab** once, and reproduce the problem; duplicate bridge listeners from an older injected version are cleared by a page reload. If it says no events were captured, reload the page, click **Start this tab** again, and reproduce the problem. Some browser-internal failures are not visible to a page-level extension.

## What it records

- Fetch/XHR start, response status, errors, and long waits for response headers.
- Long gaps between readable response-stream chunks when the page uses ReadableStream.getReader().
- Resource load errors, slow resource timing entries, JavaScript error categories, unhandled promise rejections, long main-thread tasks, navigation/paint timing, and early DOM-mutation activity.
- Optional browser download monitoring after separate user-granted `downloads` and `alarms` permissions: start, coarse progress, completion, interrupted/failure categories, and a no-progress warning after 60 seconds. It does not store filenames or full download URLs.

Only metadata is recorded: event kind, page-event and capture timestamps, a random local request-correlation ID, sanitized host/path, request method, HTTP status, request and body-consumption timing, coarse rendering/download metrics, and error category. Request IDs are generated locally for each observed Fetch/XHR request so start, response/error, stall, response-stream, and body-read events can be grouped; they are not credentials or server-provided identifiers. For Fetch responses, the extension may instrument calls to `text()`, `json()`, `arrayBuffer()`, `blob()`, and `formData()` to record elapsed time and error type only. It never inspects, stringifies, stores, or exports the returned response body. Duplicate page events are suppressed using a short-lived fingerprint of the sanitized event and its source timestamp. The report includes a capture-quality summary (duplicates suppressed, events dropped after the 300-event buffer fills, and per-kind counts). Query strings, page text, prompts, model answers, cookies, headers, and request/response bodies are not recorded. The JSON/CSV exports apply a second sanitization pass and are created locally. Events are stored in chrome.storage.local and are not uploaded. Review any report before sharing it.

## Permission model

- activeTab + scripting: monitoring starts only after the user explicitly clicks the extension and starts it.
- Optional host permission: only chatgpt.com or chat.openai.com, requested by a separate button, to re-attach after reloads on that host.
- Optional `downloads` and `alarms` permissions are separately requested by a button. If granted, the extension observes download metadata across the browser, not only the active tab, and checks for a 60-second stall. It never stores filenames or full URLs.
- No webRequest, debugger, all-sites host permission, or remote telemetry.

## Limitations

- This is diagnostic evidence, not a packet capture. It cannot see every browser-internal failure, VPN tunnel packet, or server-side condition.
- Cross-origin browser security and page instrumentation limits mean some resource status codes may be unavailable.
- A long response-stream gap is a symptom, not proof of the cause. Compare the event with the desktop DNS/HTTPS checks and a manual VPN-on/VPN-off run.
- It does not alter VPN, proxy, DNS, firewall, or routing configuration.


## Optional 30-day local event journal (v3 feature branch)

Openguin Network Watch now includes a separate **default-off** activity journal. It does not grant additional site access, reactivate monitoring automatically, or observe every site in the browser. It receives events only from an explicitly monitored tab, plus browser-wide download metadata if separately authorized.

1. Click **Enable 30-day local journal** in the extension popup.
2. Start the HTTP(S) tab using **Start this tab**. The original 300-event diagnostic buffer is unchanged.
3. The journal stores time, host, category, optional status and approximate duration. It excludes URL paths, query strings, request IDs, tab IDs, cookies, bodies, prompts, download filenames, and authentication data.
4. Use **Pause journal** to stop logging without deleting data, **Export journal JSON/CSV** to save local data, or **Stop and clear journal** to delete the journal.
5. Capacity: **2,500 events** and at most **30 days** of retained events when new writes occur or when exported; old data may remain in browser local storage when the extension is idle until the next write or cleanup. The quota may be exhausted much sooner under load. The export reports dropped entries; it is not a complete browser history.
6. The long-term journal and original 300-event diagnostic JSON use **different schemas**. The desktop Browser Incident Report still imports the original diagnostic JSON. Journal JSON/CSV is for direct local inspection or sharing with ChatGPT after review.

The journal is stored in local browser extension storage, not automatically uploaded or synced. Deleting the extension also clears extension-local records. Domain names and timestamps can still be sensitive.
