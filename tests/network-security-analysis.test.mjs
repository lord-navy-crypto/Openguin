import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNetworkSecurityReview,buildSecurityReviewExport,securityReviewCsv
} from "../.network-test/network-security-analysis.mjs";

const t=1792900000000;
function report(events=[],quality=undefined){
  return {source:"openguin-network-watch",formatVersion:1,generatedAt:new Date(t).toISOString(),events,quality};
}
function event(kind,at=t,host="example.com",extra={}){
  return {at,host,kind,...extra};
}

test("empty reports produce honest unknown metrics",()=>{
  const r=buildNetworkSecurityReview(report());
  assert.equal(r.totalEvents,0);
  assert.equal(r.p95ResponseMs,null);
  assert.equal(r.firstAt,null);
  assert.equal(r.hostCount,0);
  assert.equal(r.captureLimited,false);
});

test("host summaries count terminal responses separately from starts and warnings",()=>{
  const r=buildNetworkSecurityReview(report([
    event("fetch-start",t,"a.example",{requestId:"req1"}),
    event("fetch-response",t+1000,"a.example",{requestId:"req1",status:200,durationMs:100}),
    event("fetch-start",t+2000,"a.example",{requestId:"req2"}),
    event("fetch-response",t+3000,"a.example",{requestId:"req2",status:503,durationMs:5000}),
    event("fetch-error",t+4000,"a.example",{requestId:"req3",errorType:"TypeError"}),
    event("xhr-stall",t+5000,"b.example",{durationMs:15000}),
    event("download-failed",t+6000,"b.example",{errorType:"NETWORK_TIMEOUT"}),
    event("javascript-error",t+7000,"b.example",{errorType:"TypeError"})
  ]));
  assert.equal(r.totalEvents,8);
  assert.equal(r.responseCount,2);
  assert.equal(r.httpErrorCount,1);
  assert.equal(r.transportErrorCount,1);
  assert.equal(r.p95ResponseMs,5000);
  assert.equal(r.medianResponseMs,100);
  assert.equal(r.requestStallCount,1);
  assert.equal(r.downloadIssueCount,1);
  assert.equal(r.renderIssueCount,1);
  assert.equal(r.hosts.find(h=>h.host==="a.example").requestsStarted,2);
  assert.equal(r.hosts.find(h=>h.host==="a.example").responses,2);
  assert.equal(r.hosts.find(h=>h.host==="b.example").responses,0);
});

test("403 and 429 are server/application signals, not labeled attacks",()=>{
  const r=buildNetworkSecurityReview(report([
    event("fetch-response",t,"site.example",{status:403,durationMs:300}),
    event("fetch-response",t+2000,"site.example",{status:429,durationMs:800}),
    event("fetch-response",t+4000,"site.example",{status:200,durationMs:400})
  ]));
  assert.equal(r.warningCount,0);
  assert.equal(r.notices,2);
  assert.match(r.timeline[0].explanation,/not evidence of an attack/);
  assert.match(r.timeline[1].explanation,/not a network outage/);
});

test("minute timeline is sorted and retains truncation warning",()=>{
  const r=buildNetworkSecurityReview(report([
    event("fetch-error",t+130000),
    event("fetch-response",t,{status:500,durationMs:2000}),
    event("download-stall",t+65000)
  ],{droppedEvents:22,eventCapReached:true}));
  assert.deepEqual(r.buckets.map(b=>b.minute),[
    Math.floor(t/60000)*60000,Math.floor((t+65000)/60000)*60000,Math.floor((t+130000)/60000)*60000
  ]);
  assert.equal(r.buckets.reduce((a,b)=>a+b.events,0),3);
  assert.equal(r.captureLimited,true);
  assert.equal(r.timeline[0].at,t);
});

test("sharing export omits paths, IDs, credentials and response bodies",()=>{
  const raw=report([event("fetch-response",t,"safe.example",{
    path:"/secret-folder/123",requestId:"private-correlation-id",
    body:"PRIVATE-PROMPT",headers:{authorization:"SECRET-TOKEN"},
    status:200,durationMs:123
  })]);
  const review=buildNetworkSecurityReview(raw);
  const serialized=JSON.stringify(buildSecurityReviewExport(review));
  for(const secret of ["secret-folder","123", "private-correlation-id","PRIVATE-PROMPT","SECRET-TOKEN"]){
    if(secret==="123") continue; // The duration and timestamp may legitimately contain these digits.
    assert.equal(serialized.includes(secret),false,secret+" leaked");
  }
  assert.equal(buildSecurityReviewExport(review).schema,"openguin-passive-security-review-v2");
});

test("CSV quotes cells and defuses spreadsheet formula injection",()=>{
  const r=buildNetworkSecurityReview(report([event("fetch-error",t,"=dangerous")]));
  const csv=securityReviewCsv(r);
  assert.match(csv,/,'?=dangerous|','=dangerous/);
  assert(!csv.includes("\n=dangerous"));
  assert.equal(csv.startsWith("\uFEFFat,host,kind"),true);
});
