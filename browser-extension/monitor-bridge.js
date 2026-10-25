(() => {
  // Repeated Start/injection calls must not add another forwarding listener.
  // The MAIN-world monitor already has its own guard; this isolated-world
  // bridge needs one too, otherwise each page event is copied N times.
  const BRIDGE_KEY = "__openguinNetWatchBridgeInstalled";
  if (window[BRIDGE_KEY]) return;
  Object.defineProperty(window, BRIDGE_KEY, { value: true, configurable: false });

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "openguin-netwatch") return;
    if (!event.data.event || typeof event.data.event !== "object") return;
    try {
      chrome.runtime.sendMessage({ type: "openguin-network-event", event: event.data.event });
    } catch { /* The service worker may be asleep; page behavior must not be affected. */ }
  });
})();
