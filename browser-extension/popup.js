const currentPage = document.getElementById("currentPage");
const status = document.getElementById("status");
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const permissionButton = document.getElementById("chatgptPermission");
const clearButton = document.getElementById("clear");
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
  await chrome.scripting.executeScript({ target: { tabId }, files: ["monitor-main.js"], world: "MAIN" });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["monitor-bridge.js"], world: "ISOLATED" });
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
    await inject(tab.id);
    await chrome.storage.local.set({
      monitoring: true,
      activeTabId: tab.id,
      activeHost: host,
      monitorMode: persistent ? "chatgpt-persistent" : "active-tab"
    });
    status.textContent = persistent
      ? "Monitoring this ChatGPT tab; approved permission allows re-attachment after reload."
      : "Monitoring this tab until it navigates away. No page text or request bodies are stored.";
  } catch (error) {
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

async function render() {
  const [tab, stored] = await Promise.all([
    activeTab(),
    chrome.storage.local.get({ events: [], monitoring: false, activeTabId: null, activeHost: "" })
  ]);
  let host = "";
  try { host = tab && tab.url ? new URL(tab.url).hostname : ""; } catch {}
  currentPage.textContent = host ? "Active tab: " + host : "Active tab URL unavailable";
  startButton.disabled = Boolean(stored.monitoring);
  stopButton.disabled = !stored.monitoring;
  permissionButton.hidden = !isChatGPT(host);
  if (stored.monitoring && stored.activeTabId === (tab && tab.id)) {
    status.textContent = "Monitoring this tab. Events are stored locally.";
  } else if (stored.monitoring) {
    status.textContent = "Another tab is being monitored. Stop it before switching.";
  }
  const events = Array.isArray(stored.events) ? stored.events.slice(0, 12) : [];
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
      eventsNode.appendChild(row);
    }
  }
}

startButton.addEventListener("click", () => { void startMonitoring(); });
stopButton.addEventListener("click", () => { void stopMonitoring(); });
permissionButton.addEventListener("click", () => { void enableChatGPTReloadMonitoring(); });
clearButton.addEventListener("click", async () => {
  await chrome.storage.local.set({ events: [] });
  await render();
});
chrome.storage.onChanged.addListener(() => { void render(); });
void render();
