const MAX_EVENTS = 300;
const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
const downloadStartedAt = new Map();
const downloadLastPercent = new Map();
const downloadLastProgressAt = new Map();
const downloadLastBytes = new Map();
const downloadStallNotified = new Set();
let downloadListenersRegistered = false;
let downloadAlarmListenerRegistered = false;
const ALLOWED_KINDS = new Set([
  "monitor-active", "monitor-started", "navigation",
  "fetch-start", "fetch-response", "fetch-error", "fetch-stall",
  "xhr-start", "xhr-response", "xhr-error", "xhr-stall",
  "stream-gap", "stream-gap-resolved", "stream-error", "stream-end",
  "resource-error", "slow-resource", "javascript-error", "unhandled-rejection", "long-task", "render-summary", "render-stability",
  "download-start", "download-progress", "download-complete", "download-failed", "download-stall"
]);

function cleanHost(value) {
  try { return new URL(value).hostname.slice(0, 120); } catch { return ""; }
}

function cleanPath(value) {
  if (typeof value !== "string") return "";
  const path = value.split("?")[0].split("#")[0];
  return path.split("/").map((part) => {
    if (part.includes("@") || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) || /^\d{7,}$/.test(part) || /^[A-Za-z0-9_-]{24,}$/.test(part) || part.length > 64) return ":id";
    return part;
  }).join("/").slice(0, 160);
}

function sanitizeEvent(input) {
  const event = input && typeof input === "object" ? input : {};
  const kind = String(event.kind || "unknown").slice(0, 40);
  const host = String(event.host || "").slice(0, 120);
  const method = String(event.method || "").toUpperCase().slice(0, 12);
  const errorType = String(event.errorType || "").slice(0, 60);
  const tag = String(event.tag || "").slice(0, 20);
  const output = {
    kind: ALLOWED_KINDS.has(kind) ? kind : "unknown",
    host: /^[a-z0-9.-]+$/i.test(host) ? host : "",
    path: cleanPath(event.path),
    method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method) ? method : "",
    errorType: /^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(errorType) ? errorType : "",
    tag: /^[a-z][a-z0-9-]{0,19}$/i.test(tag) ? tag : ""
  };
  for (const key of ["status", "durationMs", "gapMs", "line", "bytes", "transferBytes", "domContentLoadedMs", "loadMs", "bodyChildCount", "firstPaintMs", "firstContentfulPaintMs", "mutationCount", "bytesReceived", "totalBytes", "progressPercent"]) {
    if (Number.isFinite(event[key])) output[key] = Math.max(0, Math.min(Number(event[key]), 1e9));
  }
  output.readyState = ["loading", "interactive", "complete"].includes(event.readyState) ? event.readyState : "";
  return output;
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "openguin-network-event") return;
  const safe = sanitizeEvent(message.event);
  chrome.storage.local.get({ events: [] }).then(({ events }) => {
    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      at: Date.now(),
      tabId: Number.isInteger(sender.tab && sender.tab.id) ? sender.tab.id : null,
      ...safe
    };
    return chrome.storage.local.set({ events: [record, ...(Array.isArray(events) ? events : [])].slice(0, MAX_EVENTS) });
  }).catch(() => {});
});

async function injectMonitor(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["monitor-main.js"], world: "MAIN" });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["monitor-bridge.js"], world: "ISOLATED" });
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const state = await chrome.storage.local.get({
    monitoring: false, activeTabId: null, activeHost: "", monitorMode: "active-tab"
  });
  if (!state.monitoring || state.activeTabId !== tabId || state.monitorMode !== "chatgpt-persistent") return;
  if (!CHATGPT_HOSTS.has(state.activeHost)) return;
  const origin = "https://" + state.activeHost + "/*";
  if (!(await chrome.permissions.contains({ origins: [origin] }))) return;
  try { await injectMonitor(tabId); } catch { /* Permission or navigation changed; do not broaden access. */ }
});

function downloadHost(url) {
  try { return new URL(url).hostname.slice(0, 120); } catch { return ""; }
}

function emitDownload(kind, item, extra = {}) {
  const at = Date.now();
  const startedAt = downloadStartedAt.get(item.id);
  const totalBytes = Number.isFinite(item.totalBytes) && item.totalBytes > 0 ? item.totalBytes : null;
  const bytesReceived = Number.isFinite(item.bytesReceived) && item.bytesReceived >= 0 ? item.bytesReceived : null;
  const progressPercent = totalBytes && bytesReceived !== null ? Math.max(0, Math.min(100, Math.round(bytesReceived / totalBytes * 100))) : null;
  const event = {
    kind,
    host: downloadHost(item.url),
    totalBytes: totalBytes ?? undefined,
    bytesReceived: bytesReceived ?? undefined,
    progressPercent: progressPercent ?? undefined,
    durationMs: startedAt ? Math.max(0, at - startedAt) : undefined,
    ...extra
  };
  chrome.storage.local.get({ events: [] }).then(({ events }) => {
    const record = {
      id: at.toString(36) + Math.random().toString(36).slice(2, 8),
      at,
      tabId: null,
      ...sanitizeEvent(event)
    };
    return chrome.storage.local.set({ events: [record, ...(Array.isArray(events) ? events : [])].slice(0, MAX_EVENTS) });
  }).catch(() => {});
}

function registerDownloadListeners() {
  if (downloadListenersRegistered || !chrome.downloads) return;
  downloadListenersRegistered = true;
  chrome.downloads.onCreated.addListener((item) => {
    const now = Date.now();
    downloadStartedAt.set(item.id, now);
    downloadLastPercent.set(item.id, 0);
    downloadLastProgressAt.set(item.id, now);
    downloadLastBytes.set(item.id, Number(item.bytesReceived) || 0);
    downloadStallNotified.delete(item.id);
    emitDownload("download-start", item);
  });
  chrome.downloads.onChanged.addListener((delta) => {
    const id = delta.id;
    if (delta.state && delta.state.current === "complete") {
      chrome.downloads.search({ id }, (items) => {
        const item = items && items[0];
        if (item) emitDownload("download-complete", item);
        downloadStartedAt.delete(id);
        downloadLastPercent.delete(id);
        downloadLastProgressAt.delete(id);
        downloadLastBytes.delete(id);
        downloadStallNotified.delete(id);
      });
      return;
    }
    if (delta.state && delta.state.current === "interrupted") {
      chrome.downloads.search({ id }, (items) => {
        const item = items && items[0];
        if (item) emitDownload("download-failed", item, { errorType: String(delta.error && delta.error.current || "INTERRUPTED").slice(0, 60) });
        downloadStartedAt.delete(id);
        downloadLastPercent.delete(id);
        downloadLastProgressAt.delete(id);
        downloadLastBytes.delete(id);
        downloadStallNotified.delete(id);
      });
      return;
    }
    if (delta.bytesReceived || delta.totalBytes) {
      chrome.downloads.search({ id }, (items) => {
        const item = items && items[0];
        if (!item || !item.totalBytes || item.totalBytes <= 0) return;
        const now = Date.now();
        const bytes = Number(item.bytesReceived) || 0;
        if (bytes !== (downloadLastBytes.get(id) ?? 0)) {
          downloadLastBytes.set(id, bytes);
          downloadLastProgressAt.set(id, now);
          downloadStallNotified.delete(id);
        }
        const percent = Math.round(bytes / item.totalBytes * 100);
        const last = downloadLastPercent.get(id) ?? 0;
        if (percent >= last + 10 || percent >= 100) {
          downloadLastPercent.set(id, percent);
          emitDownload("download-progress", item);
        }
      });
    }
  });
}

function registerDownloadAlarm() {
  if (!chrome.alarms || downloadAlarmListenerRegistered) return;
  downloadAlarmListenerRegistered = true;
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== "openguin-download-stall-watch" || !chrome.downloads) return;
    chrome.downloads.search({ state: "in_progress" }, (items) => {
      const now = Date.now();
      for (const item of items || []) {
        const id = item.id;
        const bytes = Number(item.bytesReceived) || 0;
        const previousBytes = downloadLastBytes.get(id);
        const lastAt = downloadLastProgressAt.get(id) ?? (downloadStartedAt.get(id) || now);
        if (previousBytes === undefined || previousBytes !== bytes) {
          downloadLastBytes.set(id, bytes);
          downloadLastProgressAt.set(id, now);
          downloadStallNotified.delete(id);
          continue;
        }
        if (now - lastAt >= 60000 && !downloadStallNotified.has(id)) {
          downloadStallNotified.add(id);
          emitDownload("download-stall", item, { gapMs: now - lastAt });
        }
      }
    });
  });
}

async function startDownloadAlarmIfPermitted() {
  if (!chrome.permissions || !chrome.alarms) return;
  const granted = await chrome.permissions.contains({ permissions: ["downloads", "alarms"] }).catch(() => false);
  if (granted) chrome.alarms.create("openguin-download-stall-watch", { periodInMinutes: 0.5 });
}

registerDownloadListeners();
registerDownloadAlarm();
void startDownloadAlarmIfPermitted();
if (chrome.permissions && chrome.permissions.onAdded) {
  chrome.permissions.onAdded.addListener((permissions) => {
    const granted = permissions.permissions || [];
    if (granted.includes("downloads")) registerDownloadListeners();
    if (granted.includes("alarms")) registerDownloadAlarm();
    if (granted.includes("downloads") || granted.includes("alarms")) void startDownloadAlarmIfPermitted();
  });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await chrome.storage.local.get({ activeTabId: null });
  if (state.activeTabId === tabId) {
    await chrome.storage.local.set({ monitoring: false, activeTabId: null, activeHost: "", monitorMode: "active-tab" });
  }
});
