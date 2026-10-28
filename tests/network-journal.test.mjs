import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBrowserJournal,reviewBrowserJournal,exportJournalSummary,
  journalEventSignal,JOURNAL_MAX_BYTES
} from "../.network-test/network-journal.mjs";

const now=1793200000000;
const basic=(events=[],extra={})=>({
  schema:"openguin-browser-journal-v1",
  createdAt:new Date(now).toISOString(),
  retentionDays:30,capacity:2500,
  recordCount:events.length,capacityDropped:0,recordingEnabled:false,
  events,...extra
});
const e=(kind,at,host="example.com",more={})=>({kind,at,host,status:null,durationMs:null,...more});

test("valid journal imports in event time order without trusting unexpected fields",()=>{
  const doc=basic([
    e("fetch-response",now-3000,"EXAMPLE.COM",{status:200,durationMs:89,
      path:"/my-account",requestId:"secret-id",cookie:"private-token",body:"private-prompt"}),
    e("fetch-start",now-6000)
  ]);
  const journal=parseBrowserJournal(JSON.stringify(doc));
  assert.equal(journal.events[0].kind,"fetch-start");
  assert.equal(journal.events[1].host,"example.com");
  const serialized=JSON.stringify(journal);
  for(const secret of ["my-account","secret-id","private-token","private-prompt"])
    assert.equal(serialized.includes(secret),false);
});

test("empty journal shows unknown latency rather than invented zeros",()=>{
  const j=parseBrowserJournal(JSON.stringify(basic()));
  const review=reviewBrowserJournal(j,now);
  assert.equal(review.count,0);
  assert.equal(review.p95ResponseMs,null);
  assert.equal(review.firstAt,null);
  assert.equal(review.hostCount,0);
});

test("timeline differentiates HTTP responses from transport/stream failures",()=>{
  const journal=parseBrowserJournal(JSON.stringify(basic([
    e("fetch-start",now-16000,"a.example"),
    e("fetch-response",now-15000,"a.example",{status:200,durationMs:100}),
    e("fetch-response",now-14000,"a.example",{status:503,durationMs:3000}),
    e("xhr-response",now-13000,"b.example",{status:403,durationMs:1200}),
    e("xhr-error",now-12000,"b.example"),
    e("stream-gap",now-11000,"a.example"),
    e("download-failed",now-10000,"b.example"),
    e("javascript-error",now-9000,"a.example")
  ])));
  const r=reviewBrowserJournal(journal,now);
  assert.equal(r.httpResponses,3);
  assert.equal(r.serverResponses,1);
  assert.equal(r.clientResponses,1);
  assert.equal(r.transportErrors,1);
  assert.equal(r.stalls,1);
  assert.equal(r.downloadErrors,1);
  assert.equal(r.renderErrors,1);
  assert.equal(r.medianResponseMs,1200);
  assert.equal(r.p95ResponseMs,3000);
  assert.equal(r.hosts.find(x=>x.host==="a.example").responseCount,2);
  assert.equal(r.hosts.find(x=>x.host==="b.example").responseCount,1);
  assert.equal(journalEventSignal(journal.events.find(x=>x.status===403)),"client");
});

test("retention and capacity metadata disclose incomplete coverage",()=>{
  const journal=parseBrowserJournal(JSON.stringify(basic([e("fetch-error",now-2000)],{
    capacityDropped:19,recordingEnabled:true
  })));
  const review=reviewBrowserJournal(journal,now);
  assert.equal(review.capacityDropped,19);
  assert.equal(review.coverageLimited,true);
});

test("host, timestamp, status and kind validation drop malicious events",()=>{
  const journal=parseBrowserJournal(JSON.stringify(basic([
    e("fetch-error",now-2000,"good.example"),
    e("fetch-response",now-1800,"https://bad.example?secret=a"),
    e("fetch-response",now-1500,"..broken"),
    e("unknown-private-kind",now-1400),
    e("xhr-response",now+86400000),
    e("fetch-error",now-1200,"valid.example",{status:3000,durationMs:-5})
  ])));
  assert.equal(journal.events.length,2);
  assert.equal(journal.events[1].status,null);
  assert.equal(journal.events[1].durationMs,null);
});

test("oversized, mismatched, and unbounded logs are rejected",()=>{
  assert.throws(()=>parseBrowserJournal("x".repeat(JOURNAL_MAX_BYTES+1)),/过大/);
  assert.throws(()=>parseBrowserJournal("{broken"),/JSON/);
  assert.throws(()=>parseBrowserJournal(JSON.stringify({...basic(),schema:"other"})),/只接受/);
  assert.throws(()=>parseBrowserJournal(JSON.stringify(basic(new Array(2501).fill(e("fetch-response",now))))),/2500/);
});

test("summary export has no raw event timeline or resource identifiers",()=>{
  const journal=parseBrowserJournal(JSON.stringify(basic([
    e("fetch-response",now-2000,"safe.example",{status:200,durationMs:88,path:"/private"}),
  ])));
  const report=JSON.stringify(exportJournalSummary(reviewBrowserJournal(journal,now)));
  assert.equal(report.includes("private"),false);
  assert.equal(report.includes("requestId"),false);
  assert.equal(report.includes('"events"'),false);
  assert.equal(report.includes("safe.example"),true);
});
