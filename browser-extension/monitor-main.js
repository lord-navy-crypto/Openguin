(() => {
  const STATE_KEY = "__openguinNetWatchState";
  const existing = window[STATE_KEY];
  if (existing && existing.active) {
    window.postMessage({ source: "openguin-netwatch", event: { kind: "monitor-active", host: location.hostname } }, "*");
    return;
  }

  const state = {
    active: true,
    originalFetch: window.fetch,
    originalXhrOpen: XMLHttpRequest.prototype.open,
    originalXhrSend: XMLHttpRequest.prototype.send,
    lastLongTaskAt: 0
  };
  window[STATE_KEY] = state;

  function safeUrl(raw) {
    try {
      const url = new URL(String(raw || ""), location.href);
      const path = url.pathname.split("/").map((part) => {
        if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) || /^\d{7,}$/.test(part) || part.length > 64) return ":id";
        return part;
      }).join("/").slice(0, 160);
      return { host: url.hostname.slice(0, 120), path };
    } catch {
      return { host: location.hostname.slice(0, 120), path: "" };
    }
  }

  function emit(event) {
    if (!state.active) return;
    try {
      window.postMessage({ source: "openguin-netwatch", event: Object.assign({ at: Date.now() }, event) }, "*");
    } catch { /* Diagnostics must never break the page. */ }
  }

  function typeOfError(error) {
    if (error && typeof error === "object" && error.constructor && error.constructor.name) return String(error.constructor.name).slice(0, 60);
    return typeof error === "string" ? "StringRejection" : "UnknownError";
  }

  function instrumentResponseBody(response, meta) {
    try {
      const body = response.body;
      if (!body || body.__openguinNetWatchWrapped) return;
      const originalGetReader = body.getReader.bind(body);
      Object.defineProperty(body, "__openguinNetWatchWrapped", { value: true });
      Object.defineProperty(body, "getReader", {
        configurable: true,
        value: function(...args) {
          const reader = originalGetReader(...args);
          const originalRead = reader.read.bind(reader);
          reader.read = function(...readArgs) {
            const started = performance.now();
            let settled = false;
            const timer = setTimeout(() => {
              if (!settled) emit(Object.assign({ kind: "stream-gap", gapMs: 15000, method: meta.method }, meta));
            }, 15000);
            return originalRead(...readArgs).then((result) => {
              settled = true;
              clearTimeout(timer);
              const gap = performance.now() - started;
              if (gap > 1500) emit(Object.assign({ kind: "stream-gap-resolved", gapMs: Math.round(gap), method: meta.method }, meta));
              if (result && result.done) emit(Object.assign({ kind: "stream-end", method: meta.method }, meta));
              return result;
            }, (error) => {
              settled = true;
              clearTimeout(timer);
              emit(Object.assign({ kind: "stream-error", errorType: typeOfError(error), method: meta.method }, meta));
              throw error;
            });
          };
          return reader;
        }
      });
    } catch { /* Some streams cannot be wrapped; fetch telemetry still works. */ }
  }

  const wrappedFetch = function(input, init) {
    const rawUrl = typeof input === "string" ? input : (input && input.url) || "";
    const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase().slice(0, 12);
    const meta = Object.assign({ method }, safeUrl(rawUrl));
    const started = performance.now();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) emit(Object.assign({ kind: "fetch-stall", durationMs: 15000 }, meta));
    }, 15000);
    emit(Object.assign({ kind: "fetch-start" }, meta));
    try {
      return state.originalFetch.apply(this, arguments).then((response) => {
        settled = true;
        clearTimeout(timer);
        emit(Object.assign({ kind: "fetch-response", status: response.status, durationMs: Math.round(performance.now() - started) }, meta));
        instrumentResponseBody(response, meta);
        return response;
      }, (error) => {
        settled = true;
        clearTimeout(timer);
        emit(Object.assign({ kind: "fetch-error", errorType: typeOfError(error), durationMs: Math.round(performance.now() - started) }, meta));
        throw error;
      });
    } catch (error) {
      settled = true;
      clearTimeout(timer);
      emit(Object.assign({ kind: "fetch-error", errorType: typeOfError(error) }, meta));
      throw error;
    }
  };
  state.fetchWrapper = wrappedFetch;
  window.fetch = wrappedFetch;

  const wrappedXhrOpen = function(method, url) {
    this.__openguinNetWatchMeta = Object.assign({ method: String(method || "GET").toUpperCase().slice(0, 12) }, safeUrl(url));
    return state.originalXhrOpen.apply(this, arguments);
  };
  state.xhrOpenWrapper = wrappedXhrOpen;
  XMLHttpRequest.prototype.open = wrappedXhrOpen;

  const wrappedXhrSend = function() {
    const xhr = this;
    const meta = xhr.__openguinNetWatchMeta || safeUrl(location.href);
    const started = performance.now();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) emit(Object.assign({ kind: "xhr-stall", durationMs: 15000 }, meta));
    }, 15000);
    emit(Object.assign({ kind: "xhr-start" }, meta));
    xhr.addEventListener("loadend", () => {
      settled = true;
      clearTimeout(timer);
      emit(Object.assign({ kind: xhr.status ? "xhr-response" : "xhr-error", status: xhr.status, durationMs: Math.round(performance.now() - started) }, meta));
    }, { once: true });
    return state.originalXhrSend.apply(this, arguments);
  };
  state.xhrSendWrapper = wrappedXhrSend;
  XMLHttpRequest.prototype.send = wrappedXhrSend;

  window.addEventListener("error", (event) => {
    if (event.target && event.target !== window) {
      const target = event.target;
      const url = target.currentSrc || target.src || target.href || "";
      emit(Object.assign({ kind: "resource-error", tag: String(target.tagName || "resource").toLowerCase().slice(0, 20) }, safeUrl(url)));
      return;
    }
    const source = safeUrl(event.filename || location.href);
    emit(Object.assign({ kind: "javascript-error", errorType: typeOfError(event.error), line: Number(event.lineno) || 0 }, source));
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    emit(Object.assign({ kind: "unhandled-rejection", errorType: typeOfError(event.reason) }, safeUrl(location.href)));
  });

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < 1500) continue;
        const meta = safeUrl(entry.name);
        emit(Object.assign({ kind: "slow-resource", durationMs: Math.round(entry.duration), transferBytes: Number(entry.transferSize) || 0 }, meta));
      }
    });
    observer.observe({ type: "resource", buffered: true });
    state.resourceObserver = observer;
  } catch {}

  try {
    const observer = new PerformanceObserver((list) => {
      const now = Date.now();
      for (const entry of list.getEntries()) {
        if (entry.duration < 250 || now - state.lastLongTaskAt < 3000) continue;
        state.lastLongTaskAt = now;
        emit({ kind: "long-task", durationMs: Math.round(entry.duration), host: location.hostname, path: location.pathname.slice(0, 100) });
      }
    });
    observer.observe({ type: "longtask", buffered: true });
    state.longTaskObserver = observer;
  } catch {}

  const nav = performance.getEntriesByType("navigation")[0];
  if (nav) {
    emit({
      kind: "navigation",
      host: location.hostname,
      path: location.pathname.slice(0, 100),
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
      loadMs: Math.round(nav.loadEventEnd || nav.duration || 0)
    });
  }

  const paintEntries = performance.getEntriesByType("paint");
  const paintTime = (name) => {
    const entry = paintEntries.find((item) => item.name === name);
    return entry ? Math.round(entry.startTime) : null;
  };
  emit({
    kind: "render-summary",
    host: location.hostname,
    path: location.pathname.slice(0, 100),
    readyState: document.readyState,
    bodyChildCount: document.body ? document.body.childElementCount : 0,
    firstPaintMs: paintTime("first-paint"),
    firstContentfulPaintMs: paintTime("first-contentful-paint")
  });

  let mutationCount = 0;
  if (document.body && typeof MutationObserver !== "undefined") {
    const renderObserver = new MutationObserver((records) => {
      mutationCount = Math.min(1000000, mutationCount + records.length);
    });
    renderObserver.observe(document.body, { childList: true, subtree: true });
    state.renderObserver = renderObserver;
    state.renderTimer = setTimeout(() => {
      renderObserver.disconnect();
      emit({
        kind: "render-stability",
        host: location.hostname,
        path: location.pathname.slice(0, 100),
        mutationCount
      });
    }, 5000);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "openguin-netwatch-control" || event.data.action !== "stop") return;
    state.active = false;
    if (window.fetch === state.fetchWrapper) window.fetch = state.originalFetch;
    if (XMLHttpRequest.prototype.open === state.xhrOpenWrapper) XMLHttpRequest.prototype.open = state.originalXhrOpen;
    if (XMLHttpRequest.prototype.send === state.xhrSendWrapper) XMLHttpRequest.prototype.send = state.originalXhrSend;
    if (state.resourceObserver) state.resourceObserver.disconnect();
    if (state.longTaskObserver) state.longTaskObserver.disconnect();
    if (state.renderObserver) state.renderObserver.disconnect();
    if (state.renderTimer) clearTimeout(state.renderTimer);
  });

  emit({ kind: "monitor-started", host: location.hostname, path: location.pathname.slice(0, 100) });
})();
