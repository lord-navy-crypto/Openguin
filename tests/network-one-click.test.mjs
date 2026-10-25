import test from "node:test";
import assert from "node:assert/strict";
import {diagnoseOneClick,summarizeHttpProbes,summarizeTargets} from "../.network-test/network-one-click.mjs";

const baseline = () => ({
  capturedAtMs:1792900000000,
  dns:[{host:"chatgpt.com",resolved:true,elapsedMs:22},{host:"github.com",resolved:true,elapsedMs:34}],
  endpoints:[
    {name:"ChatGPT",host:"chatgpt.com",reachable:true,status:200,elapsedMs:80},
    {name:"GitHub",host:"github.com",reachable:true,status:200,elapsedMs:120}
  ],
  route:{vpnLikely:false,vpnInterfaces:[],defaultInterface:"en0"},
  proxy:{environmentConfigured:false,systemConfigured:false},
  hints:[]
});
const speed = () => ({
  capturedAtMs:1792900000000,provider:"Cloudflare",
  latencyMs:54,jitterMs:12,probeFailures:0,probeCount:5,
  downloadMbps:80,uploadMbps:25
});
test("one-click healthy sample avoids unfounded failure claims",()=>{
  const result=diagnoseOneClick(baseline(),speed());
  assert.equal(result.verdict,"no-clear-problem");
  assert.equal(result.issues.length,0);
  assert.equal(result.checked.httpsResponded,2);
  assert.equal(result.checked.dnsPassed,2);
});
test("DNS and HTTPS global failure gets high priority and skips speed",()=>{
  const snap=baseline();
  snap.dns.forEach(row=>{row.resolved=false});
  snap.endpoints.forEach(row=>{row.reachable=false;row.status=null});
  const result=diagnoseOneClick(snap,null,["已跳过大流量测速"]);
  assert.equal(result.verdict,"network-failure");
  assert(result.issues.some(x=>x.code==="dns-outage"&&x.severity==="critical"));
  assert(result.issues.some(x=>x.code==="https-outage"));
  assert.equal(result.checked.speedAttempted,false);
});
test("HTTP 403 is a response, not an outage",()=>{
  const snap=baseline();
  snap.endpoints[0].status=403;
  const result=diagnoseOneClick(snap,speed());
  assert.equal(result.verdict,"service-response");
  assert.equal(result.checked.httpsResponded,2);
  assert(!result.issues.some(x=>x.code==="https-outage"||x.code==="https-partial"));
  assert(result.issues.some(x=>x.code==="http-access-policy"&&x.severity==="info"));
});
test("isolated endpoint transport failure is separately classified",()=>{
  const snap=baseline();
  snap.endpoints[0].reachable=false;snap.endpoints[0].status=null;
  const result=diagnoseOneClick(snap,speed());
  assert.equal(result.verdict,"connection-problem");
  assert(result.issues.some(x=>x.code==="https-partial"));
});
test("unreliable provider and poor speed are clues, not proof of VPN failure",()=>{
  const s=speed();
  s.latencyMs=1100;s.jitterMs=270;s.downloadMbps=2;s.probeFailures=2;
  const r=diagnoseOneClick(baseline(),s);
  assert.equal(r.verdict,"slow-or-unstable");
  for(const id of ["high-http-latency","high-http-jitter","slow-download","speed-probes-intermittent"]){
    assert(r.issues.some(x=>x.code===id),id);
  }
});
test("VPN/proxy hints remain noncausal informational evidence",()=>{
  const snap=baseline();
  snap.proxy.systemConfigured=true;snap.route.vpnLikely=true;
  const r=diagnoseOneClick(snap,speed());
  assert.equal(r.verdict,"no-clear-problem");
  assert(r.issues.every(x=>x.severity==="info"));
});
test("missing diagnostic snapshot returns incomplete report",()=>{
  const r=diagnoseOneClick(null,null,["诊断指令失败"]);
  assert.equal(r.verdict,"incomplete");
  assert.equal(r.checked.https,0);
});

test("probe distribution median and spread are derived from success samples only",()=>{
  const data=[
    {elapsedMs:100,success:true,status:200},
    {elapsedMs:200,success:true,status:200},
    {elapsedMs:400,success:true,status:200},
    {elapsedMs:900,success:true,status:200},
    {elapsedMs:2000,success:false,status:429,failureKind:"http-status"}
  ];
  const r=summarizeHttpProbes(data);
  assert.equal(r.passed,4);
  assert.equal(r.httpRejected,1);
  assert.equal(r.transportFailed,0);
  assert.equal(r.medianMs,300);
  assert.equal(r.spreadMs,800);
});
test("intermittent HTTP probes can be separated into status and transport failures",()=>{
  const s=speed();
  s.probeCount=5;s.probeFailures=2;
  s.probeSamples=[
    {elapsedMs:100,success:true,status:200},
    {elapsedMs:120,success:true,status:200},
    {elapsedMs:140,success:true,status:200},
    {elapsedMs:500,success:false,status:429,failureKind:"http-status"},
    {elapsedMs:1000,success:false,status:null,failureKind:"timeout"}
  ];
  const result=diagnoseOneClick(baseline(),s);
  assert(result.issues.some(x=>x.code==="probe-http-status"));
  assert(result.issues.some(x=>x.code==="probe-transport"));
  assert.equal(result.stability.httpRejected,1);
  assert.equal(result.stability.transportFailed,1);
});
test("repeat HTTP probes with large spread produce instability clue",()=>{
  const s=speed();
  s.probeSamples=[
    {elapsedMs:65,success:true,status:200},
    {elapsedMs:75,success:true,status:200},
    {elapsedMs:82,success:true,status:200},
    {elapsedMs:750,success:true,status:200},
    {elapsedMs:980,success:true,status:200}
  ];
  const r=diagnoseOneClick(baseline(),s);
  assert(r.issues.some(x=>x.code==="probe-spread"));
  assert.equal(r.stability.medianMs,82);
  assert.equal(r.stability.maxMs,980);
});
test("backward compatible older speed payloads omit new stability rather than fail",()=>{
  assert.equal(diagnoseOneClick(baseline(),speed()).stability,null);
  assert.equal(summarizeHttpProbes([]),null);
});

test("per-host target diagnosis keeps DNS, HTTPS transport and HTTP rejection distinct",()=>{
  const snap=baseline();
  snap.dns[0].resolved=false;
  snap.endpoints[0].reachable=false;
  snap.endpoints[0].status=null;
  const targets=summarizeTargets(snap);
  assert.equal(targets.find(t=>t.host==="chatgpt.com").symptom,"dns");
  assert.equal(targets.find(t=>t.host==="github.com").symptom,"ok");
  assert.equal(targets.find(t=>t.host==="chatgpt.com").https,"failed");
});
test("when control is healthy but ChatGPT has HTTP denial, flag site-specific issue",()=>{
  const snap=baseline();
  snap.endpoints[0].status=403;
  const r=diagnoseOneClick(snap,speed());
  assert(r.issues.some(x=>x.code==="target-specific"));
  assert.equal(r.targets.find(x=>x.host==="chatgpt.com").symptom,"rejection");
  assert.equal(r.targets.find(x=>x.host==="github.com").symptom,"ok");
});
test("control comparison does not imply broad internet outage",()=>{
  const snap=baseline();
  snap.endpoints[0].reachable=false;snap.endpoints[0].status=null;
  const r=diagnoseOneClick(snap,speed());
  assert(r.issues.some(x=>x.code==="target-specific"));
  assert(r.verdict!=="network-failure");
});
test("domain with only DNS check is not called a successful HTTPS connection",()=>{
  const snap=baseline();
  snap.dns.push({host:"speed.cloudflare.com",resolved:true,elapsedMs:22});
  const targets=summarizeTargets(snap);
  const sample=targets.find(x=>x.host==="speed.cloudflare.com");
  assert.equal(sample.symptom,"dns-only");
  assert.equal(sample.https,"not-tested");
});


test("anonymous 401/403 probe responses do not imply an account ban or broken browser session",()=>{
  const snap=baseline();
  snap.endpoints[0].status=403;
  snap.endpoints[1].status=401;
  const result=diagnoseOneClick(snap,speed());
  const policy=result.issues.find(x=>x.code==="http-access-policy");
  assert(policy);
  assert.equal(policy.severity,"info");
  assert(policy.evidence.includes("不携带浏览器登录 Cookie"));
  assert(policy.evidence.includes("不能判断账号被封"));
  assert(!result.issues.some(x=>x.code==="https-outage"||x.code==="https-partial"));
  assert.equal(result.checked.httpsResponded,2);
});

test("slow speed and high HTTP latency take priority over anonymous 403 policy response",()=>{
  const snap=baseline();
  snap.endpoints[0].status=403;
  const s=speed();
  s.latencyMs=495.1;
  s.jitterMs=305.3;
  s.downloadMbps=3.6;
  s.probeSamples=[
    {elapsedMs:1469,success:true,status:200},
    {elapsedMs:251,success:true,status:200},
    {elapsedMs:251,success:true,status:200},
    {elapsedMs:252,success:true,status:200},
    {elapsedMs:250,success:true,status:200}
  ];
  const result=diagnoseOneClick(snap,s);
  assert.equal(result.verdict,"slow-or-unstable");
  assert(result.issues.some(x=>x.code==="http-access-policy"));
  assert(result.issues.some(x=>x.code==="high-http-latency"));
  assert(result.issues.some(x=>x.code==="high-http-jitter"));
  assert(result.issues.some(x=>x.code==="slow-download"));
  assert(result.issues.some(x=>x.code==="probe-spread"));
});

test("HTTP 429 remains a rate-limit warning rather than a transport failure",()=>{
  const snap=baseline();
  snap.endpoints[0].status=429;
  const result=diagnoseOneClick(snap,speed());
  assert(result.issues.some(x=>x.code==="http-rate-limited"&&x.severity==="warning"));
  assert(!result.issues.some(x=>x.code==="https-outage"||x.code==="https-partial"));
});
