(() => {
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "openguin-netwatch") return;
    if (!event.data.event || typeof event.data.event !== "object") return;
    try {
      chrome.runtime.sendMessage({ type: "openguin-network-event", event: event.data.event });
    } catch { /* The service worker may be asleep; page behavior must not be affected. */ }
  });
})();
