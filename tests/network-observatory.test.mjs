import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBrowserReport,
  analyzeBrowserReport,
  eventCounts,
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
