# Openguin Network Watch — browser extension

A minimal Chrome/Chromium Manifest V3 extension for opt-in diagnostics of the active HTTP(S) tab.

## Load locally

1. Open the browser's extensions page.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this browser-extension directory.
4. Open the page you want to inspect and click the Openguin Network Watch icon.
5. Choose **Start this tab**. For ChatGPT, you can separately grant the optional host permission to re-attach the monitor after reloads.

## What it records

- Fetch/XHR start, response status, errors, and long waits for response headers.
- Long gaps between readable response-stream chunks when the page uses ReadableStream.getReader().
- Resource load errors, slow resource timing entries, JavaScript error categories, unhandled promise rejections, long main-thread tasks, navigation/paint timing, and early DOM-mutation activity.
- Optional browser download monitoring after a separate user-granted `downloads` permission: start, coarse progress, completion, and interrupted/failure categories. It does not store filenames or full download URLs.

Only metadata is recorded: event kind, sanitized host/path, HTTP status, timing, and coarse error category. Query strings, page text, prompts, model answers, cookies, headers, and request/response bodies are not recorded. Events are stored in chrome.storage.local and are not uploaded.

## Permission model

- activeTab + scripting: monitoring starts only after the user explicitly clicks the extension and starts it.
- Optional host permission: only chatgpt.com or chat.openai.com, requested by a separate button, to re-attach after reloads on that host.
- Optional `downloads` permission is separately requested by a button. If granted, it observes download metadata across the browser, not only the active tab; it never stores filenames or full URLs.
- No webRequest, debugger, all-sites host permission, or remote telemetry.

## Limitations

- This is diagnostic evidence, not a packet capture. It cannot see every browser-internal failure, VPN tunnel packet, or server-side condition.
- Cross-origin browser security and page instrumentation limits mean some resource status codes may be unavailable.
- A long response-stream gap is a symptom, not proof of the cause. Compare the event with the desktop DNS/HTTPS checks and a manual VPN-on/VPN-off run.
- It does not alter VPN, proxy, DNS, firewall, or routing configuration.
