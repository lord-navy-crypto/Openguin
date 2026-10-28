import test from "node:test";
import assert from "node:assert/strict";
import {analyzeAccessLog,exportAccessAudit,ACCESS_LOG_MAX_BYTES} from "../.network-test/server-access-log.mjs";

const ts=(time,status,path="/safe",ip="192.0.2.11",bytes=123)=>ip+" - - ["+time+
  '] "GET '+path+' HTTP/1.1" '+status+" "+bytes+' "-" "SimpleAgent"';
const t="28/Oct/2026:12:34:56 +0800";

test("Apache and Nginx combined entries count HTTP outcomes and bytes",()=>{
  const raw=[
    ts(t,200,"/a"),
    ts(t,404,"/not-found"),
    ts(t,503,"/down"),
    ts(t,429,"/rate-limit", "192.0.2.22",0)
  ].join("\n");
  const result=analyzeAccessLog(raw);
  assert.equal(result.parsedLines,4);
  assert.equal(result.successfulResponses,1);
  assert.equal(result.clientResponses,2);
  assert.equal(result.serverResponses,1);
  assert.equal(result.rateLimitedResponses,1);
  assert.equal(result.bytesTransferred,369);
  assert.equal(result.buckets[0].requests,4);
  assert.equal(result.buckets[0].http5xx,1);
  assert.equal(result.buckets[0].http429,1);
});

test("parser accepts common logging without referer or user agent",()=>{
  const raw='127.0.0.1 - - ['+t+'] "GET / HTTP/1.0" 200 15';
  const r=analyzeAccessLog(raw);
  assert.equal(r.parsedLines,1);
  assert.equal(r.ignoredLines,0);
});

test("source secrets never survive into analysis or export",()=>{
  const privateIp="203.0.113.77", privateRoute="/account/private_token?token=VERY_SECRET";
  const r=analyzeAccessLog(ts(t,500,privateRoute,privateIp));
  const exported=JSON.stringify(exportAccessAudit(r));
  for(const secret of [privateIp,privateRoute,"VERY_SECRET","SimpleAgent"]){
    assert.equal(exported.includes(secret),false);
  }
  assert.equal(r.serverResponses,1);
});

test("invalid timestamps, malformed response, and unrelated content are skipped",()=>{
  const lines=[
    ts("31/Feb/2026:12:00:00 +0800",200),
    ts("28/Oct/2026:25:00:00 +0800",200),
    ts(t,999),
    "random line",
    ts(t,200)
  ];
  const a=analyzeAccessLog(lines.join("\n"));
  assert.equal(a.parsedLines,1);
  assert.equal(a.ignoredLines,4);
  assert(a.warnings.some(x=>x.includes("部分")));
});

test("busiest minute captures the right aggregation without interpreting as an attack",()=>{
  const high=Array.from({length:36},(_,i)=>ts("28/Oct/2026:12:35:00 +0800",200,"/page/"+i));
  const ordinary=Array.from({length:3},()=>ts(t,200));
  const result=analyzeAccessLog([...ordinary,...high].join("\n"));
  assert.equal(result.busiestMinute.requests,36);
  assert.equal(result.elevatedMinutes,1);
  assert(!JSON.stringify(result).includes("检测到攻击"));
});

test("large files and too many lines are rejected",()=>{
  assert.throws(()=>analyzeAccessLog("x".repeat(ACCESS_LOG_MAX_BYTES+1)),/1 MiB/);
  assert.throws(()=>analyzeAccessLog(("short\n").repeat(6001)),/6,000/);
});

test("export is only aggregate and has no raw line entries",()=>{
  const raw=ts(t,200,"/private-route?password=abc");
  const result=exportAccessAudit(analyzeAccessLog(raw));
  assert.equal(Object.prototype.hasOwnProperty.call(result,"rawLines"),false);
  assert.equal(result.privacy.requestUrlsIncluded,false);
  assert.equal(JSON.stringify(result).includes("password=abc"),false);
});
