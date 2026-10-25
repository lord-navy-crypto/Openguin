import test from "node:test";
import assert from "node:assert/strict";
import {diagnoseOneClick} from "../.network-test/network-one-click.mjs";

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
  assert(result.issues.some(x=>x.code==="http-rejection"));
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
