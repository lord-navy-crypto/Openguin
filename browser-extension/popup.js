const currentPage = document.getElementById("currentPage");
const status = document.getElementById("status");
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const permissionButton = document.getElementById("chatgptPermission");
const downloadPermissionButton = document.getElementById("downloadPermission");
const clearButton = document.getElementById("clear");
const exportButton = document.getElementById("exportReport");
const downloadJsonButton = document.getElementById("downloadJson");
const downloadCsvButton = document.getElementById("downloadCsv");
const eventsNode = document.getElementById("events");
const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function isChatGPT(host) {
  return CHATGPT_HOSTS.has(host);
}

function permissionPattern(host) {
  return "https://" + host + "/*";
}

async function inject(tabId) {
  // Install the isolated bridge first so early page events are not dropped.
  await chrome.scripting.executeScript({ target: { tabId }, files: ["monitor-bridge.js"], world: "ISOLATED" });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["monitor-main.js"], world: "MAIN" });
}

async function startMonitoring() {
  const tab = await activeTab();
  if (!tab || !Number.isInteger(tab.id) || !tab.url || !/^https?:/.test(tab.url)) {
    status.textContent = "Open a normal HTTP or HTTPS page, then start monitoring.";
    return;
  }
  const host = new URL(tab.url).hostname;
  const persistent = isChatGPT(host) && await chrome.permissions.contains({ origins: [permissionPattern(host)] });
  try {
    await chrome.storage.local.set({
      monitoring: true,
      activeTabId: tab.id,
      activeHost: host,
      monitorMode: persistent ? "chatgpt-persistent" : "active-tab"
    });
    await inject(tab.id);
    status.textContent = persistent
      ? "Monitoring this ChatGPT tab; approved permission allows re-attachment after reload."
      : "Monitoring this tab until it navigates away. No page text or request bodies are stored.";
  } catch (error) {
    // A blocked/script-ineligible tab must not leave monitoring marked as active.
    // Otherwise the popup appears to monitor successfully but no page events arrive.
    await chrome.storage.local.set({
      monitoring: false,activeTabId:null,activeHost:"",monitorMode:"active-tab"
    });
    status.textContent = "Could not inject monitor: " + String(error).slice(0, 180);
  }
  await render();
}

async function enableChatGPTReloadMonitoring() {
  const tab = await activeTab();
  if (!tab || !tab.url) {
    status.textContent = "Open ChatGPT first.";
    return;
  }
  const host = new URL(tab.url).hostname;
  if (!isChatGPT(host)) {
    status.textContent = "This permission is only for chatgpt.com or chat.openai.com.";
    return;
  }
  try {
    const granted = await chrome.permissions.request({ origins: [permissionPattern(host)] });
    if (!granted) {
      status.textContent = "Permission was not granted. You can still monitor the current tab manually.";
      return;
    }
    await startMonitoring();
  } catch (error) {
    status.textContent = "Permission request failed: " + String(error).slice(0, 160);
  }
}

async function enableDownloadMonitoring() {
  try {
    const granted = await chrome.permissions.request({ permissions: ["downloads", "alarms"] });
    if (!granted) {
      status.textContent = "Download monitoring permission was not granted. Page monitoring still works.";
      return;
    }
    status.textContent = "Browser download monitoring enabled. It records metadata for downloads across this browser, not filenames or full URLs.";
  } catch (error) {
    status.textContent = "Could not enable download monitoring: " + String(error).slice(0, 160);
  }
  await render();
}

async function stopMonitoring() {
  const stored = await chrome.storage.local.get({ activeTabId: null });
  if (Number.isInteger(stored.activeTabId)) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: stored.activeTabId },
        world: "MAIN",
        func: () => window.postMessage({ source: "openguin-netwatch-control", action: "stop" }, "*")
      });
    } catch { /* The tab may have navigated or closed. */ }
  }
  await chrome.storage.local.set({ monitoring: false, activeTabId: null, activeHost: "", monitorMode: "active-tab" });
  status.textContent = "Monitoring stopped.";
  await render();
}

function eventText(event) {
  const location = (event.host || "page") + (event.path || "");
  const duration = Number.isFinite(event.durationMs) ? " · " + event.durationMs + " ms" : "";
  switch (event.kind) {
    case "monitor-started": return "Monitor started on " + location;
    case "navigation": return "Navigation timing · DOM " + (event.domContentLoadedMs ?? "—") + " ms · load " + (event.loadMs ?? "—") + " ms";
    case "render-summary": return "Render snapshot · ready " + (event.readyState || "unknown") + " · body elements " + (event.bodyChildCount ?? "—") + " · first contentful paint " + (event.firstContentfulPaintMs === null || event.firstContentfulPaintMs === undefined ? "not recorded" : event.firstContentfulPaintMs + " ms");
    case "render-stability": return "DOM activity in first 5 seconds · " + (event.mutationCount ?? "—") + " mutation batches (content not captured)";
    case "download-start": return "Browser download started · " + (event.host || "unknown host") + " · " + (event.totalBytes ? (event.totalBytes / 1048576).toFixed(1) + " MB" : "size unknown");
    case "download-progress": return "Browser download progress · " + (event.host || "unknown host") + " · " + (event.progressPercent ?? "—") + "% · " + (event.bytesReceived ? (event.bytesReceived / 1048576).toFixed(1) + " MB received" : "bytes unknown");
    case "download-complete": return "Browser download completed · " + (event.host || "unknown host") + " · " + (event.durationMs ?? "—") + " ms · " + (event.bytesReceived ? (event.bytesReceived / 1048576).toFixed(1) + " MB" : "size unknown");
    case "download-failed": return "Browser download failed/interrupted · " + (event.errorType || "unknown error") + " · " + (event.host || "unknown host") + " · " + (event.durationMs ?? "—") + " ms";
    case "download-stall": return "Browser download made no progress for 60+ seconds · " + (event.host || "unknown host") + " · " + (event.bytesReceived ? (event.bytesReceived / 1048576).toFixed(1) + " MB received" : "no progress recorded");
    case "fetch-start": return "Fetch started · " + (event.method || "GET") + " " + location;
    case "fetch-response": return "Fetch response · HTTP " + event.status + " · " + location + duration;
    case "fetch-error": return "Fetch failed (" + (event.errorType || "network error") + ") · " + location + duration;
    case "fetch-stall": return "Fetch waiting for response headers for 15+ seconds · " + location;
    case "xhr-start": return "XHR started · " + (event.method || "GET") + " " + location;
    case "xhr-response": return "XHR response · HTTP " + event.status + " · " + location + duration;
    case "xhr-error": return "XHR failed · " + location + duration;
    case "xhr-stall": return "XHR pending for 15+ seconds · " + location;
    case "stream-gap": return "Response stream had no readable chunk for 15+ seconds · " + location;
    case "stream-gap-resolved": return "Response stream resumed after " + event.gapMs + " ms · " + location;
    case "stream-error": return "Response stream error (" + event.errorType + ") · " + location;
    case "stream-end": return "Response stream ended · " + location;
    case "resource-error": return "Resource failed (" + event.tag + ") · " + location;
    case "slow-resource": return "Slow resource · " + location + duration;
    case "javascript-error": return "JavaScript error (" + event.errorType + ") · " + location + ":" + (event.line || 0);
    case "unhandled-rejection": return "Unhandled promise rejection (" + event.errorType + ")";
    case "long-task": return "Main thread busy for " + event.durationMs + " ms";
    default: return String(event.kind || "Browser event");
  }
}

function eventAdvice(event) {
  if (event.kind === "download-stall") return "The browser reported no byte progress for at least 60 seconds. Check whether the source server is responding, rerun DNS/HTTPS diagnostics, and compare VPN-on/off results. If other downloads work, the issue may be source-specific.";
  if (event.kind === "download-failed") {
    const code = String(event.errorType || "").toUpperCase();
    if (code.includes("NETWORK") || code.includes("CONNECTION") || code.includes("TIMEOUT")) return "Next: rerun the desktop DNS/HTTPS check. If only VPN-on runs fail, compare a nearby VPN exit or protocol one change at a time.";
    if (code.includes("FILE") || code.includes("ACCESS") || code.includes("DISK")) return "Next: check free disk space, the download folder, and file permissions before retrying.";
    if (code.includes("CANCELED") || code.includes("CANCELLED")) return "The download was cancelled; no network fault is implied.";
    return "Next: retry once and note the error category. Compare VPN-on/off and verify whether the source server is reachable.";
  }
  if (event.kind === "fetch-stall" || event.kind === "xhr-stall") return "No response arrived for 15 seconds. Run desktop DNS/HTTPS diagnostics; if those pass, compare VPN routes and check whether only this site is affected.";
  if (event.kind === "fetch-error" || event.kind === "xhr-error") return "The request failed before a usable response. Check DNS first; if DNS succeeds, inspect VPN routing, proxy/TLS filtering, and the target service.";
  if (event.kind === "fetch-response" || event.kind === "xhr-response") {
    const status = Number(event.status);
    if (status === 429) return "The server rate-limited this request. Avoid rapid retries and wait before trying again.";
    if (status === 401 || status === 403) return "The server answered but denied or challenged the request. Check sign-in or service access; if VPN-only, compare another exit location without disabling security controls.";
    if (status >= 500) return "The server returned an error. Check again later and compare another endpoint; this is not proof of a local network failure.";
    if (status >= 400) return "The server returned an HTTP error. Separate this application-level response from DNS or connection failure.";
  }
  if (event.kind === "stream-gap") return "The response connection stayed open but produced no readable chunk for 15 seconds. Check service status, repeat the request, and compare VPN-on/off latency and jitter.";
  if (event.kind === "stream-error") return "The response stream ended with an error. Compare request timing with desktop connectivity checks; if DNS/HTTPS are healthy, suspect a page/session or upstream stream issue.";
  if (event.kind === "resource-error") return "A page resource failed. If repeatable, compare the resource host with DNS/VPN results and check browser content-blocking settings.";
  if (event.kind === "slow-resource") return "This resource was slow. Compare its host and timing across repeated runs; a single slow resource does not establish the cause.";
  if (event.kind === "javascript-error" || event.kind === "unhandled-rejection") return "This points to a page-script error, not necessarily a network problem. Reload once; if repeatable, test in a clean browser profile and inspect the browser console.";
  if (event.kind === "long-task") return "The page's main thread was busy. If requests completed but the UI froze, test with fewer heavy tabs and compare a clean profile.";
  if (event.kind === "navigation") {
    if ((event.loadMs ?? 0) > 10000) return "Page load took over 10 seconds. Compare DNS/HTTPS timing and inspect slow resources before changing network settings.";
    return "Use this navigation timing as a baseline and compare it with a later slow or failed load.";
  }
  if (event.kind === "render-summary" && event.readyState === "complete" && event.bodyChildCount === 0) return "The document reports complete but has no body elements. This can indicate a blocked or failed page render; reload and check script/resource errors.";
  if (event.kind === "render-stability" && (event.mutationCount ?? 0) > 500) return "The DOM changed frequently during the first five seconds. Check for a busy UI or repeated rendering; correlate with long-task and request events.";
  return "";
}

async function render() {
  const [tab, stored, downloadPermission] = await Promise.all([
    activeTab(),
    chrome.storage.local.get({ events: [], monitoring: false, activeTabId: null, activeHost: "" }),
    chrome.permissions.contains({ permissions: ["downloads"] }).catch(() => false)
  ]);
  let host = "";
  try { host = tab && tab.url ? new URL(tab.url).hostname : ""; } catch {}
  currentPage.textContent = host ? "Active tab: " + host : "Active tab URL unavailable";
  startButton.disabled = Boolean(stored.monitoring);
  stopButton.disabled = !stored.monitoring;
  permissionButton.hidden = !isChatGPT(host);
  downloadPermissionButton.disabled = downloadPermission;
  downloadPermissionButton.textContent = downloadPermission ? "Download + timeout monitoring enabled" : "Enable download + timeout monitoring";
  if (stored.monitoring && stored.activeTabId === (tab && tab.id)) {
    status.textContent = "Monitoring this tab. Events are stored locally.";
  } else if (stored.monitoring) {
    status.textContent = "Another tab is being monitored. Stop it before switching.";
  }
  const events = Array.isArray(stored.events) ? stored.events.slice(0, 12) : [];
  const hasEvents = Array.isArray(stored.events) && stored.events.length > 0;
  exportButton.disabled = !hasEvents;
  downloadJsonButton.disabled = !hasEvents;
  downloadCsvButton.disabled = !hasEvents;
  eventsNode.replaceChildren();
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No events captured yet.";
    eventsNode.appendChild(empty);
  } else {
    for (const event of events) {
      const row = document.createElement("div");
      row.className = "event";
      const time = document.createElement("time");
      time.textContent = new Date(event.at).toLocaleTimeString();
      const label = document.createElement("div");
      label.textContent = eventText(event);
      row.append(time, label);
      const adviceText = eventAdvice(event);
      if (adviceText) {
        const advice = document.createElement("div");
        advice.className = "muted";
        advice.style.marginTop = "4px";
        advice.textContent = "Next step: " + adviceText;
        row.appendChild(advice);
      }
      eventsNode.appendChild(row);
    }
  }
}

startButton.addEventListener("click", () => { void startMonitoring(); });
stopButton.addEventListener("click", () => { void stopMonitoring(); });
permissionButton.addEventListener("click", () => { void enableChatGPTReloadMonitoring(); });
downloadPermissionButton.addEventListener("click", () => { void enableDownloadMonitoring(); });
function safeExportPath(value) {
  if (typeof value !== "string") return "";
  const raw = value.split("?")[0].split("#")[0];
  if (!raw.startsWith("/") || raw.includes("\\") || raw.length > 1000) return "";
  return raw.split("/").map(part => {
    if (part.includes("@") || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) ||
        /^\d{7,}$/.test(part) || /^[A-Za-z0-9_-]{24,}$/.test(part) || part.length > 64) return ":id";
    return part;
  }).join("/").slice(0, 160);
}

async function buildDiagnosticReport() {
  const stored = await chrome.storage.local.get({ events: [] });
  const allowedKinds = new Set([
    "monitor-active","monitor-started","navigation","render-summary","render-stability",
    "fetch-start","fetch-response","fetch-error","fetch-stall","xhr-start","xhr-response",
    "xhr-error","xhr-stall","stream-gap","stream-gap-resolved","stream-error","stream-end",
    "resource-error","slow-resource","javascript-error","unhandled-rejection","long-task",
    "download-start","download-progress","download-complete","download-failed","download-stall"
  ]);
  const cleanEvents = (Array.isArray(stored.events) ? stored.events : []).slice(0, 300)
    .filter(event => event && typeof event === "object" && allowedKinds.has(event.kind)
      && typeof event.host === "string" && /^[a-z0-9.-]{1,120}$/i.test(event.host)
      && Number.isFinite(event.at))
    .map(event => {
      const row = { kind: event.kind, host: event.host.toLowerCase(), at: event.at };
      const path = safeExportPath(event.path);
      if (path) row.path = path;
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(event.method || "")) row.method = event.method;
      if (/^[a-z][a-z0-9-]{0,19}$/i.test(event.tag || "")) row.tag = event.tag;
      for (const key of [
        "status","durationMs","gapMs","line","bytes","transferBytes","domContentLoadedMs",
        "loadMs","bodyChildCount","firstPaintMs","firstContentfulPaintMs","mutationCount",
        "bytesReceived","totalBytes","progressPercent"
      ]) {
        if (typeof event[key] === "number" && Number.isFinite(event[key])) row[key] = Math.max(0, Math.min(event[key], 1e9));
      }
      if (/^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(event.errorType || "")) row.errorType = event.errorType;
      if (["loading","interactive","complete"].includes(event.readyState)) row.readyState = event.readyState;
      return row;
    });
  return {
    source: "openguin-network-watch",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    eventCount: cleanEvents.length,
    privacy: {
      localOnly: true,
      includes: ["event category","timestamp","sanitized host/path","HTTP status","request duration","coarse rendering and download metrics","error category"],
      excludes: ["page text","prompts and answers","cookies","headers","request/response bodies","query strings","download filenames","full URLs","tab identifiers"]
    },
    events: cleanEvents
  };
}

function csvCell(value) {
  let text = value === null || value === undefined ? "" :
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function downloadReport(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function reportCsv(report) {
  const columns = [
    "at","kind","host","path","method","tag","status","durationMs","gapMs","errorType","line",
    "readyState","progressPercent","bytes","transferBytes","bytesReceived","totalBytes","bodyChildCount",
    "domContentLoadedMs","loadMs","firstPaintMs","firstContentfulPaintMs","mutationCount"
  ];
  const rows = [["source","formatVersion","generatedAt","eventCount",...columns]];
  if (!report.events.length) rows.push([report.source,report.formatVersion,report.generatedAt,0,...columns.map(() => "")]);
  else for (const event of report.events) {
    rows.push([report.source,report.formatVersion,report.generatedAt,report.eventCount,...columns.map(key => event[key] ?? "")]);
  }
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

async function copyDiagnosticReport() {
  try {
    const report = await buildDiagnosticReport();
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    status.textContent = "已复制脱敏诊断报告。可粘贴到 Openguin 桌面端 Browser incident report。";
  } catch (error) {
    status.textContent = "Could not copy report: " + String(error).slice(0, 130);
  }
}

async function downloadDiagnosticReport(format) {
  try {
    const report = await buildDiagnosticReport();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "json") {
      downloadReport("openguin-browser-diagnostic-" + stamp + ".json",
        JSON.stringify(report, null, 2), "application/json;charset=utf-8");
      status.textContent = "JSON report download requested. Check your Downloads folder.";
    } else {
      downloadReport("openguin-browser-diagnostic-" + stamp + ".csv",
        reportCsv(report), "text/csv;charset=utf-8");
      status.textContent = "CSV table download requested. Open it in Numbers, Excel, or a text editor.";
    }
  } catch (error) {
    status.textContent = "Could not export report: " + String(error).slice(0, 130);
  }
}

exportButton.addEventListener("click", () => { void copyDiagnosticReport(); });
downloadJsonButton.addEventListener("click", () => { void downloadDiagnosticReport("json"); });
downloadCsvButton.addEventListener("click", () => { void downloadDiagnosticReport("csv"); });

clearButton.addEventListener("click", async () => {
  await chrome.storage.local.set({ events: [] });
  await render();
});
chrome.storage.onChanged.addListener(() => { void render(); });
void render();
