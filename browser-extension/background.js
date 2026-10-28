const MAX_EVENTS = 300;
// Prevent extension content scripts from directly reading locally retained
// diagnostic/journal data. The trusted popup and service worker keep access.
if (typeof chrome.storage.local.setAccessLevel === "function") {
  void chrome.storage.local.setAccessLevel({accessLevel:"TRUSTED_CONTEXTS"}).catch(() => {});
}
// Optional, user-initiated, bounded long-term journal.
// Records coarse metadata only and never restarts monitoring on its own.
const JOURNAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const JOURNAL_MAX_EVENTS = 2500;
function journalRecord(record) {
  return {
    at: Number(record.at) || Date.now(),
    host: /^[a-z0-9.-]{1,120}$/i.test(record.host || "") ? record.host : "",
    kind: ALLOWED_KINDS.has(record.kind) ? record.kind : "unknown",
    status: Number.isFinite(record.status) ? record.status : null,
    durationMs: Number.isFinite(record.durationMs) ? Math.min(1e9, Math.max(0,record.durationMs)) : null
  };
}
const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
function approvedPersistentOrigin(tabUrl, host) {
  try {
    const url = new URL(tabUrl);
    if (url.hostname !== host) return "";
    if (CHATGPT_HOSTS.has(host) && url.protocol === "https:") return "https://" + host + "/*";
    if (LOOPBACK_HOSTS.has(host) && url.protocol === "http:") return "http://" + host + "/*";
  } catch {}
  return "";
}
// Page events carry their own timestamp. A duplicate bridge listener forwards
// the same timestamp and payload, which lets us suppress duplicates safely.
const recentPageEvents = new Map();
const DUPLICATE_WINDOW_MS = 5000;
const ALLOWED_KINDS = new Set([
  "monitor-active", "monitor-started", "navigation",
  "fetch-start", "fetch-response", "fetch-error", "fetch-stall",
  "xhr-start", "xhr-response", "xhr-error", "xhr-stall",
  "stream-gap", "stream-gap-resolved", "stream-error", "stream-end",
  "body-read-complete", "body-read-error",
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
  const requestId = String(event.requestId || "").slice(0, 64);
  const output = {
    kind: ALLOWED_KINDS.has(kind) ? kind : "unknown",
    host: /^[a-z0-9.-]+$/i.test(host) ? host : "",
    path: cleanPath(event.path),
    method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method) ? method : "",
    errorType: /^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(errorType) ? errorType : "",
    tag: /^[a-z][a-z0-9-]{0,19}$/i.test(tag) ? tag : "",
    requestId: /^[a-z0-9_-]{1,64}$/i.test(requestId) ? requestId : ""
  };
  const receivedAt = Date.now();
  const sourceAt = Number.isFinite(event.at) && event.at > 1_000_000_000_000 &&
    Math.abs(receivedAt - event.at) <= 5 * 60_000 ? Math.round(event.at) : undefined;
  if (sourceAt !== undefined) {
    output.sourceAt = sourceAt;
    output.bridgeDelayMs = Math.max(0, Math.min(300_000, receivedAt - sourceAt));
  }
  for (const key of ["status", "durationMs", "gapMs", "bodyReadDurationMs", "headersToBodyReadMs", "line", "bytes", "transferBytes", "domContentLoadedMs", "loadMs", "bodyChildCount", "firstPaintMs", "firstContentfulPaintMs", "mutationCount", "bytesReceived", "totalBytes", "progressPercent"]) {
    if (Number.isFinite(event[key])) output[key] = Math.max(0, Math.min(Number(event[key]), 1e9));
  }
  output.readyState = ["loading", "interactive", "complete"].includes(event.readyState) ? event.readyState : "";
  return output;
}

let eventWriteQueue = Promise.resolve();
function appendEvent(record, expectedGeneration=null) {
  eventWriteQueue = eventWriteQueue.catch(() => {}).then(async () => {
    const state = await chrome.storage.local.get({
      events: [], droppedEvents: 0, journalEnabled: false,
      journalEvents: [], journalDropped: 0,
      monitoring:false, activeTabId:null, captureObservedCount:0,
      captureGeneration:0
    });
    // Drop delayed page records once explicit monitoring has ended.
    if(Number.isInteger(record.tabId) && (
      state.monitoring!==true||
      state.activeTabId!==record.tabId||
      (expectedGeneration!==null&&
        (Number(state.captureGeneration)||0)!==expectedGeneration)
    ))return;
    const events = Array.isArray(state.events) ? state.events : [];
    const droppedEvents = Number(state.droppedEvents) || 0;
    const nextDropped = events.length >= MAX_EVENTS ? Math.min(1e9, droppedEvents + 1) : droppedEvents;
    const updates = {
      events: [record, ...events].slice(0, MAX_EVENTS),
      droppedEvents: nextDropped
    };
    // Session receipt counters are stored with the events. They survive MV3
    // worker suspension and exclude optional browser-wide download events.
    if (Number.isInteger(record.tabId) && state.monitoring===true &&
        state.activeTabId===record.tabId) {
      updates.captureObservedCount=Math.min(1e9,Math.max(0,
        Number(state.captureObservedCount)||0)+1);
      updates.captureLastEventAt=record.at;
    }
    if (state.journalEnabled === true) {
      const cutoff = Date.now() - JOURNAL_RETENTION_MS;
      const older = Array.isArray(state.journalEvents) ? state.journalEvents : [];
      const recent = older.filter(e => Number.isFinite(e.at) && e.at >= cutoff && e.at <= Date.now() + 60000);
      const incoming = journalRecord(record);
      const journal = [incoming, ...recent];
      const capacityDropped = Math.max(0, journal.length - JOURNAL_MAX_EVENTS);
      updates.journalEvents = journal.slice(0, JOURNAL_MAX_EVENTS);
      updates.journalDropped = Math.min(1e9, (Number(state.journalDropped) || 0) + capacityDropped);
    }
    await chrome.storage.local.set(updates);
  });
  return eventWriteQueue;
}

function fingerprintPageEvent(event, sourceAt) {
  return JSON.stringify([
    sourceAt, event.kind, event.host, event.path, event.method, event.requestId, event.status,
    event.durationMs, event.gapMs, event.errorType, event.tag, event.line,
    event.readyState, event.bodyChildCount, event.firstPaintMs,
    event.firstContentfulPaintMs, event.mutationCount, event.transferBytes,
    event.bytesReceived, event.totalBytes, event.progressPercent
  ]);
}

function noteDuplicateSuppressed() {
  eventWriteQueue = eventWriteQueue.catch(() => {}).then(async () => {
    const state = await chrome.storage.local.get({ duplicateEventsSuppressed: 0 });
    await chrome.storage.local.set({
      duplicateEventsSuppressed: Math.min(1e9, (Number(state.duplicateEventsSuppressed) || 0) + 1)
    });
  });
  return eventWriteQueue;
}
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "openguin-network-event") return;
  const tabId = sender.tab && sender.tab.id;
  if (!Number.isInteger(tabId)) return;
  // Chrome identifies the extension and main frame. Reject cross-frame and
  // other-extension messages even if their page event looks plausible.
  if (chrome.runtime.id && sender.id !== chrome.runtime.id) return;
  if (Number.isInteger(sender.frameId) && sender.frameId!==0) return;
  // Events must originate from the tab the user explicitly activated.
  // Do not accept unrelated tabs/frames or events after monitoring was stopped.
  void chrome.storage.local.get({ monitoring: false, activeTabId: null, activeHost: "",captureGeneration:0 }).then(state => {
    if (!state.monitoring || state.activeTabId !== tabId) return;
    const generation=Number(state.captureGeneration)||0;
    let senderHost = "";
    try { senderHost = new URL(sender.url || sender.tab.url).hostname; } catch { return; }
    if (senderHost !== state.activeHost) return;
    const safe = sanitizeEvent(message.event);
    if (safe.kind === "unknown") return;
    const at = Date.now();
    if (Number.isFinite(safe.sourceAt)) {
      // A short-lived exact fingerprint suppresses duplicate forwarding while
      // allowing legitimate repeated requests with different source times.
      for (const [key, expiry] of recentPageEvents) {
        if (expiry <= at) recentPageEvents.delete(key);
      }
      const key = generation+":"+fingerprintPageEvent(safe, safe.sourceAt);
      if (recentPageEvents.has(key)) {
        return noteDuplicateSuppressed();
      }
      recentPageEvents.set(key, at + DUPLICATE_WINDOW_MS);
      while (recentPageEvents.size > 1200) {
        recentPageEvents.delete(recentPageEvents.keys().next().value);
      }
    }
    return appendEvent({
      id: at.toString(36) + Math.random().toString(36).slice(2, 8),
      at, tabId, ...safe
    },generation);
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
      monitoring: false,activeTabId:null,activeHost:"",monitorMode:"active-tab",
      captureStopReason:navigatedAway?"Monitored tab navigated to another host.":"Temporary tab permission ended on navigation."
    });
    return;
  }
  if (changeInfo.status !== "complete" ||
      !["chatgpt-persistent", "site-persistent"].includes(state.monitorMode)) return;
  if (!currentHost || currentHost !== state.activeHost) return;
  const origin = approvedPersistentOrigin(tab && tab.url, state.activeHost);
  if (!origin || !(await chrome.permissions.contains({ origins: [origin] }))) {
    await chrome.storage.local.set({monitoring:false,activeTabId:null,
      activeHost:"",monitorMode:"active-tab",
      captureStopReason:"Optional site permission was removed or is unavailable."});
    return;
  }
  try { await injectMonitor(tabId); } catch {
    // The user should not see a misleading active state if reattachment failed.
    await chrome.storage.local.set({
      monitoring:false,activeTabId:null,activeHost:"",monitorMode:"active-tab",
      captureStopReason:"Monitor injection could not be restored."
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
async function reconcileReloadMonitoringPermission() {
  const state=await chrome.storage.local.get({
    monitoring:false,activeTabId:null,activeHost:"",monitorMode:"active-tab"
  });
  if(!state.monitoring||!["chatgpt-persistent","site-persistent"].includes(state.monitorMode))return;
  const host=state.activeHost;
  const origin=CHATGPT_HOSTS.has(host)?"https://"+host+"/*":
    LOOPBACK_HOSTS.has(host)?"http://"+host+"/*":"";
  if(origin&&await chrome.permissions.contains({origins:[origin]}))return;
  await chrome.storage.local.set({monitoring:false,activeTabId:null,
    activeHost:"",monitorMode:"active-tab",
    captureStopReason:"Optional site permission was removed or is unavailable."});
}
if (chrome.permissions) {
  chrome.permissions.onAdded.addListener(() => { void configureDownloadAlarm().catch(() => {}); });
  chrome.permissions.onRemoved.addListener(() => {
    void configureDownloadAlarm().catch(() => {});
    void reconcileReloadMonitoringPermission().catch(() => {});
  });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await chrome.storage.local.get({ activeTabId: null });
  if (state.activeTabId === tabId) {
    await chrome.storage.local.set({ monitoring: false, activeTabId: null, activeHost: "", monitorMode: "active-tab",
      captureStopReason:"Monitored tab closed." });
  }
});
