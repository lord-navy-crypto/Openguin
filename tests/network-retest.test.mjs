import test from "node:test";
import assert from "node:assert/strict";
import {runLightRetest} from "../.network-test/network-retest.mjs";

const snapshot=()=>({
  capturedAtMs:1792900000000,os:"darwin",
  dns:[{host:"chatgpt.com",resolved:true,elapsedMs:20}],
  endpoints:[{name:"ChatGPT",host:"chatgpt.com",reachable:true,status:200,elapsedMs:60}],
  proxy:{environmentConfigured:false,systemConfigured:false},
  route:{defaultInterface:"en0",vpnInterfaces:[],vpnLikely:false},hints:[]
});
test("bounded quick retest performs exactly three connection probes without throughput calls",async()=>{
  let called=0;
  const seen=[];
  const outcome=await runLightRetest(async()=>{called++;return snapshot()},(r,i)=>seen.push([r,i]),()=>false);
  assert.equal(called,3);
  assert.equal(outcome.attempts,3);
  assert.equal(outcome.successes,3);
  assert.equal(seen.length,3);
  assert(seen.every(([r])=>r.checked.speedAttempted===false));
});
test("retest can stop without starting another request",async()=>{
  let called=0,stop=false;
  const outcome=await runLightRetest(async()=>{called++;return snapshot()},()=>{stop=true},()=>stop);
  assert.equal(outcome.cancelled,true);
  assert.equal(outcome.attempts,1);
  assert.equal(called,1);
});
test("one diagnostic command error becomes incomplete report, subsequent checks still work",async()=>{
  let called=0;
  const reports=[];
  const outcome=await runLightRetest(async()=>{
    called++;
    if(called===2)throw Error("private full URL and credentials must not leak");
    return snapshot();
  },(r)=>reports.push(r),()=>false);
  assert.equal(outcome.attempts,3);
  assert.equal(outcome.successes,2);
  assert.equal(reports[1].verdict,"incomplete");
  assert.equal(reports[2].verdict,"no-clear-problem");
  assert(!JSON.stringify(reports).includes("credentials"));
});
test("cannot execute more than three rounds even when passed a larger count",async()=>{
  let called=0;
  const outcome=await runLightRetest(async()=>{called++;return snapshot()},()=>{},()=>false,999);
  assert.equal(called,3);
  assert.equal(outcome.attempts,3);
});
test("already-cancelled scans do not issue requests",async()=>{
  const outcome=await runLightRetest(async()=>{throw Error("should not run")},()=>{},()=>true);
  assert.equal(outcome.attempts,0);
  assert.equal(outcome.cancelled,true);
  assert.equal(outcome.last,null);
});
