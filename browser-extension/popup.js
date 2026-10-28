const currentPage = document.getElementById("currentPage");
const status = document.getElementById("status");
const captureAudit=document.getElementById("captureAudit");
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const permissionButton = document.getElementById("chatgptPermission");
const downloadPermissionButton = document.getElementById("downloadPermission");
const clearButton = document.getElementById("clear");
const exportButton = document.getElementById("exportReport");
const downloadJsonButton = document.getElementById("downloadJson");
const downloadCsvButton = document.getElementById("downloadCsv");
const eventsNode = document.getElementById("events");
const qualityNode = document.getElementById("quality");
const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const labSummaryNode = document.getElementById("labSummary");
const labJsonButton = document.getElementById("labJson");
const observedResponsesNode=document.getElementById("observedResponses");
const observedErrorsNode=document.getElementById("observedErrors");
const observedP95Node=document.getElementById("observedP95");
const observedPendingNode=document.getElementById("observedPending");
const observabilityQuality=document.getElementById("observabilityQuality");
const observabilityNotes=document.getElementById("observabilityNotes");
const observabilityJson=document.getElementById("observabilityJson");
const observabilityScope=document.getElementById("observabilityScope");
function supportedPersistentOrigin(tabUrl) {
  try {
    const url = new URL(tabUrl);
    if (CHATGPT_HOSTS.has(url.hostname) && url.protocol === "https:") return "https://" + url.hostname + "/*";
    if (LOOPBACK_HOSTS.has(url.hostname) && url.protocol === "http:") return "http://" + url.hostname + "/*";
  } catch {}
  return "";
}

const journalToggle = document.getElementById("journalToggle");
const journalClear = document.getElementById("journalClear");
const journalJson = document.getElementById("journalJson");
const journalCsv = document.getElementById("journalCsv");
const journalState = document.getElementById("journalState");
const journalPreview = document.getElementById("journalPreview");

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function isChatGPT(host) {
  return CHATGPT_HOSTS.has(host);
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
  const approved = supportedPersistentOrigin(tab.url);
  const persistent = Boolean(approved) && await chrome.permissions.contains({ origins: [approved] });
  try {
    await chrome.storage.local.set({
      monitoring: true,
      activeTabId: tab.id,
      activeHost: host,
      monitorMode: persistent ? "site-persistent" : "active-tab",
      captureStartedAt:Date.now(),captureLastEventAt:null,
      captureObservedCount:0,captureStopReason:""
    });
    await inject(tab.id);
    status.textContent = persistent
      ? "Monitoring this approved site; optional permission permits same-site reload reattachment."
      : "Monitoring this tab until it navigates away. No page text or request bodies are stored.";
  } catch (error) {
    // A blocked/script-ineligible tab must not leave monitoring marked as active.
    // Otherwise the popup appears to monitor successfully but no page events arrive.
    await chrome.storage.local.set({
      monitoring: false,activeTabId:null,activeHost:"",monitorMode:"active-tab",
      captureStopReason:"Script injection failed."
    });
    status.textContent = "Could not inject monitor: " + String(error).slice(0, 180);
  }
  await render();
}

async function enableApprovedReloadMonitoring() {
  const tab = await activeTab();
  const pattern = supportedPersistentOrigin(tab?.url);
  if (!pattern) {
    status.textContent = "Reload monitoring is optional and limited to approved ChatGPT or loopback pages.";
    return;
  }
  try {
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (!granted) {
      status.textContent = "Permission not granted. You may still start this tab manually.";
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
  await chrome.storage.local.set({ monitoring: false, activeTabId: null, activeHost: "", monitorMode: "active-tab",
    captureStopReason:"Stopped by user." });
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
    chrome.storage.local.get({
      events: [], monitoring: false, activeTabId: null, activeHost: "",
      duplicateEventsSuppressed: 0, droppedEvents: 0,
      journalEnabled: false, journalEvents: [], journalDropped: 0,
      captureStartedAt:null,captureLastEventAt:null,captureObservedCount:0,
      captureStopReason:""
    }),
    chrome.permissions.contains({ permissions: ["downloads"] }).catch(() => false)
  ]);
  let host = "";
  try { host = tab && tab.url ? new URL(tab.url).hostname : ""; } catch {}
  currentPage.textContent = host ? "Active tab: " + host : "Active tab URL unavailable";
  startButton.disabled = Boolean(stored.monitoring);
  stopButton.disabled = !stored.monitoring;
  const reloadPattern = supportedPersistentOrigin(tab?.url);
  permissionButton.hidden = !reloadPattern;
  permissionButton.textContent = LOOPBACK_HOSTS.has(host)
    ? "Allow localhost reload monitoring" : "Allow ChatGPT reload monitoring";
  downloadPermissionButton.disabled = downloadPermission;
  downloadPermissionButton.textContent = downloadPermission ? "Download + timeout monitoring enabled" : "Enable download + timeout monitoring";
  if (stored.monitoring && stored.activeTabId === (tab && tab.id)) {
    status.textContent = "Monitoring this tab. Events are stored locally.";
  } else if (stored.monitoring) {
    status.textContent = "Another tab is being monitored. Stop it before switching.";
  }
  const captureCount=Math.max(0,Number(stored.captureObservedCount)||0);
  const latest=Number(stored.captureLastEventAt);
  const started=Number(stored.captureStartedAt);
  const elapsed=Number.isFinite(latest)&&latest>0?Math.max(0,Date.now()-latest):null;
  const ageText=elapsed===null?"无确认事件":
    elapsed<60000?"最近事件 "+Math.floor(elapsed/1000)+" 秒前":
    "最近事件 "+Math.floor(elapsed/60000)+" 分钟前";
  const active=stored.monitoring===true;
  const matched=active&&stored.activeTabId===tab?.id;
  captureAudit.textContent=(active?(matched?"当前标签页已请求监测":"正在监测另一个标签页"):
    "监测已关闭")+
    " · 本次会话已接收 "+captureCount+" 条 · "+ageText+
    (started>0?" · 记录开始于 "+new Date(started).toLocaleTimeString():"")+
    (!active&&stored.captureStopReason?" · 停止原因："+stored.captureStopReason:"")+
    (matched&&captureCount===0?" · 尚未收到页面监测事件；并不代表没有网页活动。":"")+
    (matched&&elapsed!==null&&elapsed>120000?
      " · 长时间无新事件，可能是页面空闲、监测失效或页面导航。":"");
  const events = Array.isArray(stored.events) ? stored.events.slice(0, 12) : [];
  const duplicateCount = Math.max(0, Number(stored.duplicateEventsSuppressed) || 0);
  const droppedCount = Math.max(0, Number(stored.droppedEvents) || 0);
  qualityNode.textContent = [
    duplicateCount ? "Suppressed duplicate events: " + duplicateCount : "",
    droppedCount ? "Older events omitted after the 300-event cap: " + droppedCount : "",
    !duplicateCount && !droppedCount ? "Capture quality: no duplicate or overflow events recorded." : ""
  ].filter(Boolean).join(" ");
  // The long-term journal is deliberately separate from the 300-event report.
  const archived = Array.isArray(stored.journalEvents) ? stored.journalEvents : [];
  const capped = Math.max(0, Number(stored.journalDropped) || 0);
  journalToggle.textContent = stored.journalEnabled ? "Pause journal (keep saved events)" : "Enable 30-day local journal";
  journalState.textContent = (stored.journalEnabled ? "Recording enabled when tab/download monitoring is active. " : "Recording paused. ") +
    archived.length + " bounded records saved (max 2500 / 30 days)." +
    (capped ? " " + capped + " older records replaced at capacity." : "");
  journalJson.disabled = archived.length === 0;
  journalCsv.disabled = archived.length === 0;
  journalPreview.replaceChildren();
  for (const event of archived.slice(0,5)) {
    const row = document.createElement("div");
    row.className = "event";
    row.textContent = new Date(event.at).toLocaleString() + " · " + String(event.host || "") + " · " + String(event.kind || "");
    journalPreview.appendChild(row);
  }
  const scopeOptions=observabilityScope.value==="current"?{tabId:tab?.id??-1}:{};
  const dashboard=globalThis.OpenguinObservability.summarize({
    events:Array.isArray(stored.events)?stored.events:[],
    quality:{droppedEvents:stored.droppedEvents,
      duplicateEventsSuppressed:stored.duplicateEventsSuppressed,
      eventCapReached:stored.droppedEvents>0}
  },scopeOptions);
  const diagnoses=dashboard.symptoms;
  observedResponsesNode.textContent=String(dashboard.responseCount);
  observedErrorsNode.textContent=String(
    dashboard.statusFamilies["4xx"]+dashboard.statusFamilies["5xx"]);
  observedErrorsNode.classList.toggle("alert",
    dashboard.statusFamilies["5xx"]>0||diagnoses.transportErrors>0);
  observedP95Node.textContent=dashboard.p95ResponseMs===null?
    (dashboard.timingSamples?"样本不足":"—"):dashboard.p95ResponseMs+" ms";
  observedPendingNode.textContent=String(diagnoses.unfinished);
  observedPendingNode.classList.toggle("alert",diagnoses.unfinished>0);
  observabilityQuality.textContent="错误事件 "+diagnoses.transportErrors+
    " · 限流 429 "+diagnoses.throttled+
    " · 失败/卡顿信号 "+diagnoses.stalls+
    " · 采集丢弃 "+dashboard.capture.droppedEvents+
    " · 去重 "+dashboard.capture.duplicateEventsSuppressed;
  observabilityNotes.textContent=(dashboard.scope==="selected-active-tab"?
    "仅当前标签页；":"全部手动采集记录；")+
    (dashboard.capture.notices.length?dashboard.capture.notices.join("；"):
    "不读取网页正文、密码、Cookie 或请求内容。")+
    " 截断和去重数量是整个本地缓存的统计。";
  const labEvidence=globalThis.OpenguinLabCompat.toLabEvidence({
    events:Array.isArray(stored.events)?stored.events:[],
    quality:{droppedEvents:stored.droppedEvents,
      duplicateEventsSuppressed:stored.duplicateEventsSuppressed}
  });
  const lab=labEvidence.summary;
  const statuses=Object.entries(lab.statusCounts).map(([code,count])=>
    "HTTP "+code+": "+count).join(" · ");
  labSummaryNode.textContent=lab.observedResponses+
    " observed localhost Fetch/XHR responses"+
    (statuses?" · "+statuses:" · No matching localhost responses yet.")+
    ". Only fixed training endpoints appear in the export.";
  labJsonButton.disabled=labEvidence.report.events.length===0;
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
permissionButton.addEventListener("click", () => { void enableApprovedReloadMonitoring(); });
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
  const stored = await chrome.storage.local.get({
    events: [], duplicateEventsSuppressed: 0, droppedEvents: 0,
    monitoring:false,captureStartedAt:null,captureLastEventAt:null,
    captureObservedCount:0,captureStopReason:""
  });
  const allowedKinds = new Set([
    "monitor-active","monitor-started","navigation","render-summary","render-stability",
    "fetch-start","fetch-response","fetch-error","fetch-stall","xhr-start","xhr-response",
    "xhr-error","xhr-stall","stream-gap","stream-gap-resolved","stream-error","stream-end",
    "body-read-complete","body-read-error",
    "resource-error","slow-resource","javascript-error","unhandled-rejection","long-task",
    "download-start","download-progress","download-complete","download-failed","download-stall"
  ]);
  const cleanEvents = (Array.isArray(stored.events) ? stored.events : []).slice(0, 300)
    .filter(event => event && typeof event === "object" && allowedKinds.has(event.kind)
      && typeof event.host === "string" && /^[a-z0-9.-]{1,120}$/i.test(event.host)
      && Number.isFinite(event.at))
    .map(event => {
      const row = { kind: event.kind, host: event.host.toLowerCase(), at: event.at };
      if (/^[a-z0-9_-]{1,64}$/i.test(event.requestId || "")) row.requestId = event.requestId;
      if (Number.isFinite(event.sourceAt)) row.sourceAt = event.sourceAt;
      if (Number.isFinite(event.bridgeDelayMs)) row.bridgeDelayMs = Math.max(0, Math.min(event.bridgeDelayMs, 300000));
      const path = safeExportPath(event.path);
      if (path) row.path = path;
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(event.method || "")) row.method = event.method;
      if (/^[a-z][a-z0-9-]{0,19}$/i.test(event.tag || "")) row.tag = event.tag;
      for (const key of [
        "status","durationMs","gapMs","bodyReadDurationMs","headersToBodyReadMs","line","bytes","transferBytes","domContentLoadedMs",
        "loadMs","bodyChildCount","firstPaintMs","firstContentfulPaintMs","mutationCount",
        "bytesReceived","totalBytes","progressPercent"
      ]) {
        if (typeof event[key] === "number" && Number.isFinite(event[key])) row[key] = Math.max(0, Math.min(event[key], 1e9));
      }
      if (/^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(event.errorType || "")) row.errorType = event.errorType;
      if (["loading","interactive","complete"].includes(event.readyState)) row.readyState = event.readyState;
      return row;
    });
  const eventCounts = {};
  for (const event of cleanEvents) eventCounts[event.kind] = (eventCounts[event.kind] || 0) + 1;
  const droppedEvents = Math.max(0, Number(stored.droppedEvents) || 0);
  const duplicateEventsSuppressed = Math.max(0, Number(stored.duplicateEventsSuppressed) || 0);
  return {
    source: "openguin-network-watch",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    eventCount: cleanEvents.length,
    quality: {
      storedEventCount: Array.isArray(stored.events) ? stored.events.length : 0,
      exportedEventCount: cleanEvents.length,
      duplicateEventsSuppressed,
      droppedEvents,
      eventCapReached: droppedEvents > 0 || (Array.isArray(stored.events) && stored.events.length >= 300),
      firstEventAt: cleanEvents.length ? Math.min(...cleanEvents.map(event => event.at)) : null,
      lastEventAt: cleanEvents.length ? Math.max(...cleanEvents.map(event => event.at)) : null,
      eventCounts
    },
    captureSession:{
      monitoringAtExport:stored.monitoring===true,
      startedAt:Number.isFinite(stored.captureStartedAt)&&stored.captureStartedAt>0?
        stored.captureStartedAt:null,
      lastObservedAt:Number.isFinite(stored.captureLastEventAt)&&stored.captureLastEventAt>0?
        stored.captureLastEventAt:null,
      observedCount:Math.max(0,Math.min(1e9,Math.floor(Number(stored.captureObservedCount)||0))),
      stopReason:["Stopped by user.","Script injection failed.",
        "Optional site permission was removed or is unavailable."].includes(stored.captureStopReason)?
        stored.captureStopReason:""
    },
    privacy: {
      localOnly: true,
      includes: ["event category","timestamp","sanitized host/path","local request correlation ID","HTTP status","request duration","coarse rendering and download metrics","error category"],
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
  const quality = report.quality || {};
  const columns = [
    "at","sourceAt","bridgeDelayMs","requestId","kind","host","path","method","tag","status","durationMs","gapMs","bodyReadDurationMs","headersToBodyReadMs","errorType","line",
    "readyState","progressPercent","bytes","transferBytes","bytesReceived","totalBytes","bodyChildCount",
    "domContentLoadedMs","loadMs","firstPaintMs","firstContentfulPaintMs","mutationCount"
  ];
  const metadata = [
    "source","formatVersion","generatedAt","eventCount","duplicateEventsSuppressed","droppedEvents","eventCapReached"
  ];
  const metaValues = [
    report.source,report.formatVersion,report.generatedAt,report.eventCount,
    quality.duplicateEventsSuppressed ?? 0,quality.droppedEvents ?? 0,Boolean(quality.eventCapReached)
  ];
  const rows = [[...metadata,...columns]];
  if (!report.events.length) rows.push([...metaValues,...columns.map(() => "")]);
  else for (const event of report.events) {
    rows.push([...metaValues,...columns.map(key => event[key] ?? "")]);
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

observabilityScope.addEventListener("change",()=>{void render();});
observabilityJson.addEventListener("click",async()=>{
  try{
    const [tab,saved]=await Promise.all([activeTab(),chrome.storage.local.get({
      events:[],droppedEvents:0,duplicateEventsSuppressed:0
    })]);
    const options=observabilityScope.value==="current"?{tabId:tab?.id??-1}:{};
    const summary=globalThis.OpenguinObservability.summarize({
      events:saved.events,quality:saved
    },options);
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    downloadReport("openguin-observability-v18-"+stamp+".json",
      JSON.stringify({source:"openguin-network-watch",formatVersion:1,
        generatedAt:new Date().toISOString(),observability:summary,
        privacy:{localOnly:true,noPageContent:true,noCredentials:true,
          noCookies:true,noRequestBodies:true,noFullUrls:true}},null,2),
      "application/json;charset=utf-8");
    status.textContent="导出本地只读运行摘要；不包含原始网页内容。";
  }catch(error){
    status.textContent="运行概况导出失败："+String(error).slice(0,110);
  }
});

labJsonButton.addEventListener("click",async()=>{
  try {
    const report=await buildDiagnosticReport();
    const adapted=globalThis.OpenguinLabCompat.toLabEvidence(report);
    if(!adapted.report.events.length){
      status.textContent="No compatible localhost lab events captured; open the lab workbench and monitor its Fetch/XHR checks.";
      return;
    }
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    downloadReport("openguin-localhost-lab-v17-"+stamp+".json",
      JSON.stringify(adapted.report,null,2),"application/json;charset=utf-8");
    status.textContent="Downloaded a redacted localhost-only Browser incident report for OpenPenguin.";
  }catch(error){
    status.textContent="Lab-only export failed: "+String(error).slice(0,130);
  }
});
exportButton.addEventListener("click", () => { void copyDiagnosticReport(); });
downloadJsonButton.addEventListener("click", () => { void downloadDiagnosticReport("json"); });
downloadCsvButton.addEventListener("click", () => { void downloadDiagnosticReport("csv"); });

clearButton.addEventListener("click", async () => {
  await chrome.storage.local.set({ events: [], duplicateEventsSuppressed: 0, droppedEvents: 0 });
  await render();
});

journalToggle.addEventListener("click", async () => {
  const current = await chrome.storage.local.get({journalEnabled:false});
  await chrome.storage.local.set({journalEnabled:current.journalEnabled!==true});
  await render();
});
journalClear.addEventListener("click", async () => {
  await chrome.storage.local.set({journalEnabled:false,journalEvents:[],journalDropped:0});
  await render();
});
async function buildLongTermJournal() {
  const saved = await chrome.storage.local.get({journalEvents:[],journalDropped:0,journalEnabled:false});
  const allowedKinds = new Set([
    "monitor-active","monitor-started","navigation","render-summary","render-stability",
    "fetch-start","fetch-response","fetch-error","fetch-stall","xhr-start","xhr-response","xhr-error","xhr-stall",
    "stream-gap","stream-gap-resolved","stream-error","stream-end","body-read-complete","body-read-error",
    "resource-error","slow-resource","javascript-error","unhandled-rejection","long-task",
    "download-start","download-progress","download-complete","download-failed","download-stall"
  ]);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const events = (Array.isArray(saved.journalEvents) ? saved.journalEvents : [])
    .slice(0,2500)
    .filter(e => e && typeof e === "object" && Number.isFinite(e.at) && e.at >= cutoff
      && typeof e.host === "string" && /^[a-z0-9.-]{1,120}$/i.test(e.host)
      && allowedKinds.has(e.kind))
    .map(e => ({
      at:e.at,host:e.host.toLowerCase(),kind:e.kind,
      status:Number.isFinite(e.status)?Math.max(0,Math.min(999,e.status)):null,
      durationMs:Number.isFinite(e.durationMs)?Math.max(0,Math.min(1e9,e.durationMs)):null
    }));
  return {
    schema:"openguin-browser-journal-v1",createdAt:new Date().toISOString(),
    retentionDays:30,capacity:2500,recordCount:events.length,
    capacityDropped:Math.max(0,Number(saved.journalDropped)||0),
    recordingEnabled:saved.journalEnabled===true,
    completeness:"May omit events outside active monitoring, expired records, or records lost to capacity.",
    privacy:{localOnly:true,autoUpload:false,excluded:["URL paths","queries","request IDs","prompts","responses","cookies","headers","tokens","download filenames","packet content"]},
    events
  };
}
async function exportJournal(format) {
  try {
    const report = await buildLongTermJournal();
    const stamp = new Date().toISOString().replace(/[:.]/g,"-");
    if (format === "json") {
      downloadReport("openguin-browser-journal-"+stamp+".json",JSON.stringify(report,null,2),"application/json;charset=utf-8");
    } else {
      const columns=["at","host","kind","status","durationMs"];
      const csv = "\uFEFF" + [columns.join(","),...report.events.map(e => columns.map(k => csvCell(e[k])).join(","))].join("\r\n") + "\r\n";
      downloadReport("openguin-browser-journal-"+stamp+".csv",csv,"text/csv;charset=utf-8");
    }
    status.textContent = "Local long-term journal export started. Review domains and times before sharing.";
  } catch(e) {
    status.textContent = "Journal export failed: " + String(e).slice(0,120);
  }
}
journalJson.addEventListener("click",()=>{void exportJournal("json");});
journalCsv.addEventListener("click",()=>{void exportJournal("csv");});
chrome.storage.onChanged.addListener(() => { void render(); });
void render();
