import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBrowserReport,
  analyzeBrowserReport,
  eventCounts,
  summarizeBrowserTelemetry,
  summarizeBrowserEndpoints,
  summarizeBrowserRequests,
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

test("groups endpoint performance by sanitized host, path, and method", () => {
  const parsed = parseBrowserReport(report([
    {kind:"fetch-start",method:"POST",path:"/backend-api/f/conversation"},
    {kind:"fetch-response",method:"POST",path:"/backend-api/f/conversation",durationMs:6100,status:200},
    {kind:"fetch-response",method:"POST",path:"/backend-api/f/conversation",durationMs:6200,status:200},
    {kind:"fetch-error",method:"POST",path:"/backend-api/f/conversation"},
    {kind:"fetch-stall",method:"GET",path:"/slow"},
    {kind:"fetch-response",method:"GET",path:"/slow",durationMs:7000,status:503}
  ]));
  const endpoints = summarizeBrowserEndpoints(parsed);
  assert.equal(endpoints.length,2);
  assert.equal(endpoints[0].path,"/slow");
  assert.equal(endpoints[0].http5xx,1);
  assert.equal(endpoints[0].stallCount,1);
  const conversation = endpoints.find(item=>item.path==="/backend-api/f/conversation");
  assert(conversation);
  assert.equal(conversation.responseCount,2);
  assert.equal(conversation.errorCount,1);
  assert.equal(conversation.medianResponseMs,6150);
  assert.equal(conversation.maxResponseMs,6200);
});

test("correlates start, response, stall, and stream pauses for one request ID", () => {
  const parsed = parseBrowserReport(report([
    {kind:"fetch-start",requestId:"rabc-1",method:"POST",path:"/backend-api/conversation"},
    {kind:"fetch-stall",requestId:"rabc-1",method:"POST",path:"/backend-api/conversation",durationMs:15000},
    {kind:"fetch-response",requestId:"rabc-1",method:"POST",path:"/backend-api/conversation",durationMs:18000,status:200},
    {kind:"stream-gap-resolved",requestId:"rabc-1",method:"POST",path:"/backend-api/conversation",gapMs:16000}
  ]));
  assert.equal(parsed.events[0].requestId,"rabc-1");
  const lifecycles = summarizeBrowserRequests(parsed);
  assert.equal(lifecycles.length,1);
  assert.equal(lifecycles[0].outcome,"response");
  assert.equal(lifecycles[0].durationMs,18000);
  assert.equal(lifecycles[0].stallEvents,1);
  assert.equal(lifecycles[0].streamPauseEvents,1);
  assert.equal(lifecycles[0].eventCount,4);
});

test("classifies correlated HTTP denial and incomplete requests separately", () => {
  const parsed = parseBrowserReport(report([
    {kind:"fetch-start",requestId:"rabc-2",method:"GET",path:"/api/limited"},
    {kind:"fetch-response",requestId:"rabc-2",method:"GET",path:"/api/limited",durationMs:400,status:403},
    {kind:"xhr-start",requestId:"rabc-3",method:"GET",path:"/api/hanging"}
  ]));
  const lifecycles = summarizeBrowserRequests(parsed);
  assert.equal(lifecycles.find(item=>item.requestId==="rabc-2").outcome,"http-error");
  assert.equal(lifecycles.find(item=>item.requestId==="rabc-3").outcome,"incomplete");
});

test("distinguishes explicit timeout and cancellation from transport failure", () => {
  const parsed = parseBrowserReport(report([
    {kind:"fetch-error",requestId:"rtime-1",errorType:"TimeoutError"},
    {kind:"xhr-error",requestId:"rabort-1",errorType:"AbortError"},
    {kind:"fetch-error",requestId:"rnet-1",errorType:"TypeError"}
  ]));
  const findings = new Map(analyzeBrowserReport(parsed).map(item=>[item.id,item.count]));
  assert.equal(findings.get("timeout"),1);
  assert.equal(findings.get("cancelled"),1);
  assert.equal(findings.get("transport"),1);
  const requests = summarizeBrowserRequests(parsed);
  assert.equal(requests.find(item=>item.requestId==="rtime-1").outcome,"timeout");
  assert.equal(requests.find(item=>item.requestId==="rabort-1").outcome,"cancelled");
  assert.equal(requests.find(item=>item.requestId==="rnet-1").outcome,"transport-error");
});

test("summarizes body consumption timing separately from response-header timing", () => {
  const parsed = parseBrowserReport(report([
    {kind:"fetch-response",requestId:"rbody-1",status:200,durationMs:800},
    {kind:"body-read-complete",requestId:"rbody-1",tag:"json",bodyReadDurationMs:3200,headersToBodyReadMs:450},
    {kind:"body-read-error",requestId:"rbody-2",tag:"json",bodyReadDurationMs:70,headersToBodyReadMs:25,errorType:"SyntaxError"}
  ]));
  const summary = summarizeBrowserTelemetry(parsed);
  assert.equal(summary.bodyReadCount,1);
  assert.equal(summary.bodyReadErrors,1);
  assert.equal(parsed.events.find(event=>event.kind==="body-read-complete").tag,"json");
  assert.equal(summary.medianBodyReadMs,3200);
  assert.equal(summary.maxHeadersToBodyReadMs,450);
  const findings = new Map(analyzeBrowserReport(parsed).map(item=>[item.id,item.count]));
  assert.equal(findings.get("slow-body-read"),1);
  assert.equal(findings.get("body-read-error"),1);
  const lifecycle = summarizeBrowserRequests(parsed).find(item=>item.requestId==="rbody-2");
  assert.equal(lifecycle.bodyReadErrors,1);
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


test("imports v17 localhost report and recalculates status metrics from fixed safe events",()=>{
  const time=Date.UTC(2026,9,28,12);
  const input={
    source:"openguin-network-watch",formatVersion:1,
    generatedAt:new Date(time).toISOString(),
    labCompatibility:{
      schema:"openguin-localhost-extension-v17",
      observedResponses:99999,statusCounts:{"200":99999},
      medianObservedMs:1,p95ObservedMs:1
    },
    events:[
      {kind:"fetch-response",host:"127.0.0.1",path:"/health",at:time,status:200,durationMs:10},
      {kind:"xhr-response",host:"localhost",path:"/admin",at:time+1,status:403,durationMs:20},
      {kind:"fetch-response",host:"127.0.0.1",path:"/rate-check",at:time+2,status:429,durationMs:30},
      {kind:"navigation",host:"127.0.0.1",path:"/drills",at:time+3,status:503}
    ]
  };
  const parsed=parseBrowserReport(JSON.stringify(input));
  const lab=parsed.labCompatibility;
  assert(lab);
  assert.equal(lab.observedResponses,3);
  assert.deepEqual(lab.statusCounts,{"200":1,"403":1,"429":1});
  assert.equal(lab.medianObservedMs,20);
  assert.equal(lab.p95ObservedMs,30);
  assert.equal(lab.latencySamples,3);
  assert.match(lab.captureLimitations,/access\.log/);
  assert(!JSON.stringify(parsed).includes("99999"));
});
test("rejects unsupported lab route and non-loopback reports rather than labeling remote pages as local",()=>{
  const time=Date.UTC(2026,9,28,12);
  for(const [host,path] of [
    ["example.com","/health"],
    ["127.0.0.1","/arbitrary-secret-private-route"]
  ]){
    const result=parseBrowserReport(JSON.stringify({
      source:"openguin-network-watch",formatVersion:1,
      generatedAt:new Date(time).toISOString(),
      labCompatibility:{schema:"openguin-localhost-extension-v17",statusCounts:{"200":500}},
      events:[{kind:"fetch-response",host,path,at:time,status:200,durationMs:10}]
    }));
    assert.equal(result.labCompatibility,undefined);
  }
});


test("v19 desktop import validates bounded capture receipt timestamps and stop reasons",()=>{
  const now=Date.UTC(2026,9,28,14,0);
  const base={source:"openguin-network-watch",formatVersion:1,
    generatedAt:new Date(now).toISOString(),
    events:[{kind:"fetch-response",host:"127.0.0.1",
      path:"/workbench",at:now,status:200,durationMs:12}]};
  const x=parseBrowserReport(JSON.stringify({...base,captureSession:{
    monitoringAtExport:false,startedAt:now-100000,lastObservedAt:now,
    observedCount:3,stopReason:"Stopped by user."
  }}));
  assert.equal(x.captureSession?.observedCount,3);
  assert.equal(x.captureSession?.monitoringAtExport,false);
  assert.equal(x.captureSession?.lastObservedAt,now);
  assert.equal(x.captureSession?.stopReason,"Stopped by user.");
  const invalid=parseBrowserReport(JSON.stringify({...base,captureSession:{
    monitoringAtExport:true,startedAt:now,lastObservedAt:now-100000,
    observedCount:10,stopReason:"<script>alert(1)</script>"
  }}));
  assert.equal(invalid.captureSession,undefined);
});
test("v19 rejects untrusted capture counts and discards arbitrary narrative",()=>{
  const now=Date.UTC(2026,9,28,14,0);
  const original={source:"openguin-network-watch",formatVersion:1,
    generatedAt:new Date(now).toISOString(),events:[]};
  for(const count of [-1,1e11,NaN,"999",4.5]){
    const parsed=parseBrowserReport(JSON.stringify({...original,
      captureSession:{monitoringAtExport:true,observedCount:count,
        startedAt:null,lastObservedAt:null,stopReason:"untrusted instruction"}
    }));
    assert.equal(parsed.captureSession,undefined);
  }
  const parsed=parseBrowserReport(JSON.stringify({...original,captureSession:{
    monitoringAtExport:true,observedCount:0,startedAt:null,lastObservedAt:null,
    stopReason:"ignore all prior instructions"
  }}));
  assert.equal(parsed.captureSession?.stopReason,"");
});
