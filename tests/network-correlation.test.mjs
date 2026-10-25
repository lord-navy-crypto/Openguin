import test from "node:test";
import assert from "node:assert/strict";
import {correlateBrowserWithOneClick} from "../.network-test/network-correlation.mjs";
const baseTime=Date.parse("2026-10-25T10:00:00.000Z");
const desktop=(verdict="no-clear-problem")=>({
  at:new Date(baseTime).toISOString(),verdict,headline:"test",issues:[],
  checked:{dns:2,dnsPassed:2,https:2,httpsResponded:2,httpFailures:0,speedAttempted:true},
  context:{vpnInterfaceSignal:false,proxySignal:false},notes:[]
});
const browser=(entries,offset=0)=>({
  source:"openguin-network-watch",formatVersion:1,
  generatedAt:new Date(baseTime+offset).toISOString(),
  events:entries.map((e,i)=>({at:baseTime+offset+i*1000,host:"chatgpt.com",...e}))
});
test("same-time transport errors and desktop outage jointly raise connectivity",()=>{
  const result=correlateBrowserWithOneClick(
    browser([{kind:"fetch-stall"},{kind:"fetch-error"}]),desktop("network-failure"));
  assert.equal(result.timing,"aligned");
  assert(result.findings.some(x=>x.code==="consistent-connectivity"&&x.priority==="high"));
});
test("normal sampled connectivity and browser JavaScript long tasks are separate",()=>{
  const result=correlateBrowserWithOneClick(
    browser([{kind:"long-task",durationMs:180},{kind:"javascript-error"}]),desktop());
  assert.equal(result.timing,"aligned");
  assert(result.findings.some(x=>x.code==="page-render"));
  assert(!result.findings.some(x=>x.code==="consistent-connectivity"));
});
test("old browser issues do not get matched to later healthy network check",()=>{
  const result=correlateBrowserWithOneClick(
    browser([{kind:"fetch-error"},{kind:"long-task"}],-100*60_000),desktop());
  assert.equal(result.timing,"outdated");
  assert.equal(result.comparedBrowserEvents,0);
  assert(!result.findings.some(x=>x.code==="page-render"));
  assert(result.findings.some(x=>x.code==="browser-requests"));
});
test("download failures preserve distinct FILE NETWORK and SERVER categories",()=>{
  const result=correlateBrowserWithOneClick(browser([
    {kind:"download-failed",errorType:"FILE_ACCESS_DENIED"},
    {kind:"download-failed",errorType:"NETWORK_TIMEOUT"},
    {kind:"download-failed",errorType:"SERVER_UNAUTHORIZED"}
  ]),desktop());
  for(const code of ["file-download","network-download","server-download"]){
    assert(result.findings.some(x=>x.code===code),code);
  }
});
test("browser-only evidence never invents DNS or VPN diagnosis",()=>{
  const result=correlateBrowserWithOneClick(browser([
    {kind:"stream-gap",gapMs:15000}
  ]),null);
  assert.equal(result.timing,"browser-only");
  assert(result.findings.some(x=>x.code==="stream-only"));
  assert(!result.findings.some(x=>x.code==="consistent-connectivity"));
});
test("mixed historical report correlates only 10-minute window",()=>{
  const b=browser([
    {kind:"fetch-error"},
    {kind:"stream-gap",gapMs:15000}
  ]);
  b.events[0].at=baseTime-100*60_000;
  const result=correlateBrowserWithOneClick(b,desktop());
  assert.equal(result.timing,"aligned");
  assert.equal(result.comparedBrowserEvents,1);
  assert(!result.findings.some(x=>x.code==="consistent-connectivity"));
  assert(result.findings.some(x=>x.code==="application-stream"));
});
test("empty browser report asks for actual capture",()=>{
  const result=correlateBrowserWithOneClick(browser([]),desktop());
  assert.equal(result.timing,"no-events");
  assert.equal(result.findings.length,0);
});
