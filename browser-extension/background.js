const MAX_EVENTS = 300;
const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
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

let eventWriteQueue = Promise.resolve();
function appendEvent(record) {
  eventWriteQueue = eventWriteQueue.catch(() => {}).then(async () => {
    const { events } = await chrome.storage.local.get({ events: [] });
    await chrome.storage.local.set({
      events: [record, ...(Array.isArray(events) ? events : [])].slice(0, MAX_EVENTS)
    });
  });
  return eventWriteQueue;
}
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "openguin-network-event") return;
  const tabId = sender.tab && sender.tab.id;
  if (!Number.isInteger(tabId)) return;
  // Events must originate from the tab the user explicitly activated.
  // Do not accept unrelated tabs/frames or events after monitoring was stopped.
  void chrome.storage.local.get({ monitoring: false, activeTabId: null, activeHost: "" }).then(state => {
    if (!state.monitoring || state.activeTabId !== tabId) return;
    let senderHost = "";
    try { senderHost = new URL(sender.url || sender.tab.url).hostname; } catch { return; }
    if (senderHost !== state.activeHost) return;
    const safe = sanitizeEvent(message.event);
    if (safe.kind === "unknown") return;
    const at = Date.now();
    return appendEvent({
      id: at.toString(36) + Math.random().toString(36).slice(2, 8),
      at, tabId, ...safe
    });
  }).catch(() => {});
});

async function injectMonitor(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["monitor-bridge.js"], world: "ISOLATED" });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["monitor-main.js"], world: "MAIN" });
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" && changeInfo.status !== "loading") return;
  const state = await chrome.storage.local.get({
    monitoring: false, activeTabId: null, activeHost: "", monitorMode: "active-tab"
  });
  if (!state.monitoring || state.activeTabId !== tabId) return;
  // activeTab injection is document-scoped. Never keep showing "monitoring"
  // after a real navigation when persistent permission has not been granted.
  let currentHost = "";
  try { currentHost = tab && tab.url ? new URL(tab.url).hostname : ""; } catch {}
  const navigatedAway = currentHost && currentHost !== state.activeHost;
  if (navigatedAway ||
      (state.monitorMode === "active-tab" && changeInfo.status === "loading")) {
    await chrome.storage.local.set({
      monitoring: false,activeTabId:null,activeHost:"",monitorMode:"active-tab"
    });
    return;
  }
  if (changeInfo.status !== "complete" || state.monitorMode !== "chatgpt-persistent") return;
  if (!CHATGPT_HOSTS.has(state.activeHost) || !currentHost ||
      currentHost !== state.activeHost) return;
  const origin = "https://" + state.activeHost + "/*";
  if (!(await chrome.permissions.contains({ origins: [origin] }))) return;
  try { await injectMonitor(tabId); } catch {
    // The user should not see a misleading active state if reattachment failed.
    await chrome.storage.local.set({
      monitoring:false,activeTabId:null,activeHost:"",monitorMode:"active-tab"
    });
  }
});

function downloadHost(url) {
  try { return new URL(url).hostname.slice(0, 120); } catch { return ""; }
}

function emitDownload(kind, item, extra = {}) {
  const at = Date.now();
  const event = {
    kind, host: downloadHost(item.url),
    bytesReceived: Number.isFinite(item.bytesReceived) ? Math.max(0, item.bytesReceived) : undefined,
    totalBytes: Number.isFinite(item.totalBytes) && item.totalBytes > 0 ? item.totalBytes : undefined,
    ...extra
  };
  if (event.totalBytes && Number.isFinite(event.bytesReceived)) {
    event.progressPercent = Math.min(100, Math.round(event.bytesReceived * 100 / event.totalBytes));
  }
  return appendEvent({
    id: at.toString(36) + Math.random().toString(36).slice(2, 8),
    at, tabId: null, ...sanitizeEvent(event)
  }).catch(() => {});
}

// Stored in storage.session: unlike globals, sampling survives Manifest V3
// background-service-worker suspension. Never persist filenames or full URLs.
const downloadTrackKey = "openguinDownloadTracks";
async function getTracks() {
  const stored = await chrome.storage.session.get({ [downloadTrackKey]: {} });
  return stored[downloadTrackKey] || {};
}
async function setTracks(tracks) {
  await chrome.storage.session.set({ [downloadTrackKey]: tracks });
}
async function beginTrack(item) {
  if (item.incognito) return; // Avoid collecting private-browsing activity.
  const tracks = await getTracks();
  const id = String(item.id);
  const time = Date.now();
  if (tracks[id]) return;
  tracks[id] = {
    startedAt: time, lastProgressAt: time, bytes: Number(item.bytesReceived) || 0,
    percent: 0, notified: false
  };
  await setTracks(tracks);
  await emitDownload("download-start", item);
}
async function finishTrack(item, kind, error) {
  if (!item || item.incognito) return;
  const tracks = await getTracks();
  const id = String(item.id);
  const track = tracks[id];
  if (!track) return;
  delete tracks[id];
  await setTracks(tracks);
  await emitDownload(kind, item, {
    durationMs: Math.max(0, Date.now() - track.startedAt),
    errorType: error || undefined
  });
}
async function sampleDownloads() {
  if (!chrome.downloads) return;
  const items = await chrome.downloads.search({ state: "in_progress" });
  const tracks = await getTracks(), now = Date.now();
  const activeIds = new Set();
  const events = [];
  for (const item of items) {
    if (item.incognito) continue;
    const id = String(item.id);
    activeIds.add(id);
    const bytes = Number(item.bytesReceived) || 0;
    let track = tracks[id];
    if (!track) {
      tracks[id] = { startedAt: now, lastProgressAt: now, bytes, percent: 0, notified: false };
      continue;
    }
    if (bytes > track.bytes) {
      track.bytes = bytes;
      track.lastProgressAt = now;
      track.notified = false;
      const percent = item.totalBytes > 0 ? Math.round(bytes * 100 / item.totalBytes) : 0;
      if (percent >= track.percent + 10 || (item.totalBytes <= 0 && now - track.startedAt >= 30000)) {
        track.percent = percent;
        events.push(["download-progress", item, {}]);
      }
    } else if (!item.paused && now - track.lastProgressAt >= 60000 && !track.notified) {
      track.notified = true;
      events.push(["download-stall", item, { gapMs: now - track.lastProgressAt }]);
    }
  }
  // Completion/interruption updates may arrive after one alarm sample.
  // Keep nonactive state briefly to preserve its original start timestamp.
  // Then expire it silently rather than inventing a completion/failure.
  for (const id of Object.keys(tracks)) {
    if (!activeIds.has(id) && now - tracks[id].lastProgressAt > 5 * 60_000) delete tracks[id];
  }
  await setTracks(tracks);
  for (const [kind, item, extra] of events) await emitDownload(kind, item, extra);
}

let downloadListenersRegistered = false;
function registerDownloadListeners() {
  if (!chrome.downloads || downloadListenersRegistered) return;
  downloadListenersRegistered = true;
  // Register synchronously at service-worker startup when the API is already
  // available. Also register after the user grants the optional permission:
  // on a running worker, chrome.downloads may not exist until then.
  chrome.downloads.onCreated.addListener((item) => { void beginTrack(item); });
  chrome.downloads.onChanged.addListener((delta) => {
    if (!delta.state) return; // Chrome does NOT emit byte-only progress events.
    if (!["complete", "interrupted"].includes(delta.state.current)) return;
    chrome.downloads.search({ id: delta.id }).then((items) => {
      const item = items && items[0];
      return finishTrack(
        item,
        delta.state.current === "complete" ? "download-complete" : "download-failed",
        delta.state.current === "interrupted"
          ? String(delta.error && delta.error.current || (item && item.error) || "INTERRUPTED").slice(0, 60)
          : undefined
      );
    }).catch(() => {});
  });
}
registerDownloadListeners();
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "openguin-download-stall-watch") void sampleDownloads().catch(() => {});
  });
}
async function configureDownloadAlarm() {
  if (!chrome.permissions || !chrome.alarms) return;
  const granted = await chrome.permissions.contains({ permissions: ["downloads", "alarms"] });
  if (granted) {
    registerDownloadListeners();
    chrome.alarms.create("openguin-download-stall-watch", { periodInMinutes: 0.5 });
  } else {
    chrome.alarms.clear("openguin-download-stall-watch");
    await chrome.storage.session.remove(downloadTrackKey);
  }
}
void configureDownloadAlarm().catch(() => {});
if (chrome.permissions) {
  chrome.permissions.onAdded.addListener(() => { void configureDownloadAlarm().catch(() => {}); });
  chrome.permissions.onRemoved.addListener(() => { void configureDownloadAlarm().catch(() => {}); });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await chrome.storage.local.get({ activeTabId: null });
  if (state.activeTabId === tabId) {
    await chrome.storage.local.set({ monitoring: false, activeTabId: null, activeHost: "", monitorMode: "active-tab" });
  }
});
