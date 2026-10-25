# Openguin Network Watch — browser extension

A minimal Chrome/Chromium Manifest V3 extension for opt-in diagnostics of the active HTTP(S) tab.

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
3. Click **Copy diagnostic report** to copy the redacted JSON, or click **Download JSON report** / **Download CSV table** to save a file under your browser's Downloads folder.
4. In Openguin, open **电脑网络体检 → 高级网络与浏览器诊断 → Browser incident report · 浏览器故障诊断**.
5. For copied JSON, click **从剪贴板分析**. For a downloaded JSON file, open it in a text editor, copy its contents, paste them into the report box, then click **分析粘贴报告**. The CSV is for spreadsheet review; use JSON when importing events.
6. After import, choose **复制完整诊断包**, **下载 JSON**, or **下载 CSV 表格**. This combines the browser timeline with the current desktop DNS/HTTPS checks, speed-test samples, VPN comparisons, local scan history, and suggested findings. Paste the copied JSON into a ChatGPT conversation for analysis, or attach the downloaded JSON file.

If the extension icon is missing, open the Extensions menu and pin it. If events appear duplicated, reload the page, click **Start this tab** once, and reproduce the problem; duplicate bridge listeners from an older injected version are cleared by a page reload. If it says no events were captured, reload the page, click **Start this tab** again, and reproduce the problem. Some browser-internal failures are not visible to a page-level extension.

## What it records

- Fetch/XHR start, response status, errors, and long waits for response headers.
- Long gaps between readable response-stream chunks when the page uses ReadableStream.getReader().
- Resource load errors, slow resource timing entries, JavaScript error categories, unhandled promise rejections, long main-thread tasks, navigation/paint timing, and early DOM-mutation activity.
- Optional browser download monitoring after separate user-granted `downloads` and `alarms` permissions: start, coarse progress, completion, interrupted/failure categories, and a no-progress warning after 60 seconds. It does not store filenames or full download URLs.

Only metadata is recorded: event kind, timestamp, sanitized host/path, request method, HTTP status, timing, coarse rendering/download metrics, and error category. Query strings, page text, prompts, model answers, cookies, headers, and request/response bodies are not recorded. The JSON/CSV exports apply a second sanitization pass and are created locally. Events are stored in chrome.storage.local and are not uploaded. Review any report before sharing it.

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
