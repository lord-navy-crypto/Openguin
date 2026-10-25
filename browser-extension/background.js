const MAX_EVENTS = 300;
const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
const ALLOWED_KINDS = new Set([
  "monitor-active", "monitor-started", "navigation",
  "fetch-start", "fetch-response", "fetch-error", "fetch-stall",
  "xhr-start", "xhr-response", "xhr-error", "xhr-stall",
  "stream-gap", "stream-gap-resolved", "stream-error", "stream-end",
  "resource-error", "slow-resource", "javascript-error", "unhandled-rejection", "long-task", "render-summary", "render-stability"
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
    errorType: /^[A-Za-z][A-Za-z0-9]{0,59}$/.test(errorType) ? errorType : "",
    tag: /^[a-z][a-z0-9-]{0,19}$/i.test(tag) ? tag : ""
  };
  for (const key of ["status", "durationMs", "gapMs", "line", "bytes", "transferBytes", "domContentLoadedMs", "loadMs", "bodyChildCount", "firstPaintMs", "firstContentfulPaintMs", "mutationCount"]) {
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

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await chrome.storage.local.get({ activeTabId: null });
  if (state.activeTabId === tabId) {
    await chrome.storage.local.set({ monitoring: false, activeTabId: null, activeHost: "", monitorMode: "active-tab" });
  }
});
