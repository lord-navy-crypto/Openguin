import test from "node:test";
import assert from "node:assert/strict";
import {correlateSiteEvidence,exportCorrelationSummary,minuteBucket} from "../.network-test/security-evidence-correlation.mjs";
import {parseBrowserJournal} from "../.network-test/network-journal.mjs";
import {analyzeAccessLog} from "../.network-test/server-access-log.mjs";

const base=1793200000000;
const minute=minuteBucket(base);
const stamp=(ms)=>new Date(ms).toISOString();
const journal=(events)=>parseBrowserJournal(JSON.stringify({
  schema:"openguin-browser-journal-v1",createdAt:stamp(base+600000),
  retentionDays:30,capacity:2500,capacityDropped:0,recordingEnabled:false,events
}));
const browserEvent=(kind,at,host="owned.example",status=null)=>({kind,at,host,status,durationMs:50});
function accessAt(at,status=200){
  const d=new Date(at);
  const dd=String(d.getUTCDate()).padStart(2,"0"),y=d.getUTCFullYear(),hh=String(d.getUTCHours()).padStart(2,"0"),
    mm=String(d.getUTCMinutes()).padStart(2,"0"),ss=String(d.getUTCSeconds()).padStart(2,"0");
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return "192.0.2.70 - - ["+dd+"/"+months[d.getUTCMonth()]+"/"+y+":"+hh+":"+mm+":"+ss+" +0000] \"GET /private?token=never-export HTTP/1.1\" "+status+" 90 \"-\" \"Browser\"";
}
test("matches both sources only in a time bucket with observed events",()=>{
  const j=journal([
    browserEvent("fetch-response",minute+500,"owned.example",503),
    browserEvent("fetch-stall",minute+1000,"owned.example"),
    browserEvent("xhr-error",minute+60000+500,"owned.example"),
    browserEvent("xhr-error",minute+500,"unrelated.example")
  ]);
  const a=analyzeAccessLog([
    accessAt(minute+1500,500),
    accessAt(minute+1800,200),
    accessAt(minute+60000+1500,200),
    accessAt(minute+120000,429)
  ].join("\n"));
  const result=correlateSiteEvidence(j,a,"owned.example");
  assert.equal(result.sourceBrowserEvents,3);
  assert.equal(result.sourceServerRequests,4);
  assert.equal(result.jointlyObservedMinutes,2);
  assert.equal(result.bothIssueMinutes,1);
  assert.equal(result.browserOnlyIssueMinutes,1);
  assert.equal(result.serverOnlyIssueMinutes,1);
  assert.equal(result.days.reduce((n,x)=>n+x.serverRequests,0),4);
  assert.equal(result.minutes[0].browserHttp5xx,1);
  assert.equal(result.minutes[0].serverHttp5xx,1);
  assert.equal(result.minutes[0].browserStalls,1);
});
test("will not correlate absent domain or an unconfirmed arbitrary label",()=>{
  const j=journal([browserEvent("fetch-response",minute+50)]);
  const a=analyzeAccessLog(accessAt(minute+80));
  assert.throws(()=>correlateSiteEvidence(j,a,"other.example"),/必须先选择/);
  assert.throws(()=>correlateSiteEvidence(j,a,""),/必须先选择/);
});
test("empty server log does not fabricate a match",()=>{
  const j=journal([browserEvent("fetch-error",minute+20)]);
  const a=analyzeAccessLog("garbled log line");
  const r=correlateSiteEvidence(j,a,"owned.example");
  assert.equal(r.jointlyObservedMinutes,0);
  assert.equal(r.sourceServerRequests,0);
  assert.equal(r.browserOnlyIssueMinutes,1);
});
test("summary exports omit minutes and source PII",()=>{
  const j=journal([browserEvent("xhr-error",minute+200)]);
  const a=analyzeAccessLog(accessAt(minute+500,503));
  const r=correlateSiteEvidence(j,a,"owned.example");
  const report=exportCorrelationSummary(r);
  const serialized=JSON.stringify(report);
  assert.equal(Object.hasOwn(report,"minutes"),false);
  for(const blocked of ["never-export","192.0.2.70","/private","requestId","userAgent"])
    assert.equal(serialized.includes(blocked),false);
  assert.equal(report.selectedHost,"owned.example");
  assert.equal(report.privacy.minuteTimelineExported,false);
});
