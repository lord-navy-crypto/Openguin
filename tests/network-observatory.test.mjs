import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBrowserReport,
  analyzeBrowserReport,
  eventCounts,
  summarizeBrowserTelemetry,
} from "../.network-test/browser-diagnostics.mjs";

const baseTime = Date.UTC(2026, 9, 25, 5, 0);
const report = (events) => JSON.stringify({
  source: "openguin-network-watch",
  formatVersion: 1,
  generatedAt: new Date(baseTime).toISOString(),
  events: events.map((event, i) => ({
    kind: "fetch-error", host: "chatgpt.com", at: baseTime + i * 1000,
    ...event
  }))
});

test("imports a valid redacted report with sorted timeline", () => {
  const parsed = parseBrowserReport(report([
    {kind: "fetch-stall", at: baseTime + 2_000},
    {kind: "download-failed", at: baseTime + 1_000, errorType: "NETWORK_FAILED"},
  ]));
  assert.equal(parsed.events.length, 2);
  assert.deepEqual(parsed.events.map(x => x.kind), ["download-failed", "fetch-stall"]);
});

test("preserves source timestamps and capture-quality counters from extension export", () => {
  const raw = JSON.stringify({
    source: "openguin-network-watch",
    formatVersion: 1,
    generatedAt: new Date(baseTime + 2000).toISOString(),
    quality: {
      storedEventCount: 300,
      exportedEventCount: 300,
      duplicateEventsSuppressed: 18,
      droppedEvents: 7,
      eventCapReached: true,
      firstEventAt: baseTime,
      lastEventAt: baseTime + 1000,
      eventCounts: {"fetch-response": 2}
    },
    events: [{
      kind: "fetch-response", host: "chatgpt.com", at: baseTime + 1000,
      sourceAt: baseTime + 900, bridgeDelayMs: 100, status: 200
    }]
  });
  const parsed = parseBrowserReport(raw);
  assert.equal(parsed.events[0].sourceAt, baseTime + 900);
  assert.equal(parsed.events[0].bridgeDelayMs, 100);
  assert.equal(parsed.quality?.duplicateEventsSuppressed, 18);
  assert.equal(parsed.quality?.droppedEvents, 7);
  assert.equal(parsed.quality?.eventCapReached, true);
  assert.equal(parsed.quality?.eventCounts["fetch-response"], 2);
});

test("rejects malformed/untrusted report source and oversized content", () => {
  assert.throws(() => parseBrowserReport("not json"), /JSON/);
  assert.throws(() => parseBrowserReport(JSON.stringify({
    source: "unrelated", formatVersion: 1, generatedAt: new Date(baseTime).toISOString(), events: []
  })), /不兼容/);
  assert.throws(() => parseBrowserReport(" ".repeat(300_001)), /300 KB/);
});

test("drops malicious metadata while keeping diagnostic event categories", () => {
  const parsed = parseBrowserReport(report([
    {kind: "fetch-response", status: 403, host: "CHATGPT.COM", method: "POST",
      path: "/conversation/private?token=secret", body: "secret answer",
      headers: {Authorization: "Bearer example"},
      durationMs: -100},
    {kind: "malicious-new-kind", host: "chatgpt.com"},
    {kind: "fetch-error", host: "chatgpt.com/secret", errorType: "<script>"}
  ]));
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].host, "chatgpt.com");
  assert.equal(parsed.events[0].durationMs, 0);
  assert.equal(Object.hasOwn(parsed.events[0], "body"), false);
  assert.equal(Object.hasOwn(parsed.events[0], "headers"), false);
  assert.equal(parsed.events[0].path, "/conversation/private");
  assert.equal(parsed.events[0].method, "POST");
  assert.equal(JSON.stringify(parsed).includes("token=secret"), false);
});

test("summarizes response percentiles, slow requests, and resolved stream pauses", () => {
  const parsed = parseBrowserReport(report([
    {kind: "fetch-response", durationMs: 100, status: 200},
    {kind: "fetch-response", durationMs: 3000, status: 200},
    {kind: "xhr-response", durationMs: 7000, status: 503},
    {kind: "fetch-error", errorType: "TypeError"},
    {kind: "stream-gap-resolved", gapMs: 7815},
    {kind: "javascript-error", errorType: "UnknownError"}
  ]));
  const summary = summarizeBrowserTelemetry(parsed);
  assert.equal(summary.responseCount, 3);
  assert.equal(summary.medianResponseMs, 3000);
  assert.equal(summary.p95ResponseMs, 7000);
  assert.equal(summary.slowResponses, 2);
  assert.equal(summary.transportErrors, 1);
  assert.equal(summary.http5xx, 1);
  assert.equal(summary.streamPauseEvents, 1);
  assert.equal(summary.maxStreamGapMs, 7815);
  assert.equal(summary.scriptErrors, 1);
  assert(analyzeBrowserReport(parsed).some(item => item.id === "stream"));
  assert(analyzeBrowserReport(parsed).some(item => item.id === "slow-response"));
});

test("distinguishes HTTP access denial from transport failure", () => {
  const parsed = parseBrowserReport(report([
    {kind: "fetch-response", status: 401},
    {kind: "fetch-response", status: 429},
    {kind: "fetch-error", errorType: "TypeError"}
  ]));
  const findings = analyzeBrowserReport(parsed);
  assert.equal(findings.find(x => x.id === "blocked")?.count, 2);
  assert.equal(findings.find(x => x.id === "transport")?.count, 1);
  assert.equal(findings.find(x => x.id === "server"), undefined);
});

test("diagnoses stalled ChatGPT streams, downloads, and scripts separately", () => {
  const parsed = parseBrowserReport(report([
    {kind: "stream-gap", gapMs: 15_000},
    {kind: "download-stall", gapMs: 60_000},
    {kind: "download-failed", errorType: "NETWORK_FAILED"},
    {kind: "javascript-error", errorType: "TypeError"},
    {kind: "long-task", durationMs: 700}
  ]));
  const ids = new Set(analyzeBrowserReport(parsed).map(x => x.id));
  for (const key of ["stream","download-stall","downloads","javascript","render"]) {
    assert.equal(ids.has(key), true, key);
  }
  assert.equal(eventCounts(parsed).length, 5);
});

test("reports incomplete evidence rather than inventing a root cause", () => {
  const parsed = parseBrowserReport(report([
    {kind: "fetch-response", status: 200},
    {kind: "download-complete", progressPercent: 100}
  ]));
  assert.deepEqual(analyzeBrowserReport(parsed), []);
});
