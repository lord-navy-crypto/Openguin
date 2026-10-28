import test from "node:test";
import assert from "node:assert/strict";
import {
  STUDIO_PROFILES,STUDIO_LEVELS,DEFAULT_STUDIO_CONFIG,validateStudioConfig,
  evaluateDefenseStudio,compareStudioConfig,exportStudioSummary,exportStudioCsv
} from "../scripts/defense-studio-v13.mjs";

test("all fixed virtual patterns are deterministic and bounded",()=>{
 for(const profile of Object.keys(STUDIO_PROFILES)){
  for(const mode of ["protected","teaching"]){
   for(const rateLimit of STUDIO_LEVELS){
    for(const serviceCapacity of STUDIO_LEVELS){
     const c={profile,mode,rateLimit,serviceCapacity};
     const one=evaluateDefenseStudio(c),two=evaluateDefenseStudio(c);
     assert.deepEqual(one,two);
     assert(one.virtualEvents>0&&one.virtualEvents<100);
     assert.equal(one.perSlot.length,8);
     assert(one.perSlot.every(x=>x.accepted+x.throttled+x.unavailable===x.incoming));
     assert.equal(one.authentication.length,6);
     assert.equal(one.authorization.length,4);
     assert.equal(Object.values(one.statusCounts).reduce((a,b)=>a+b),one.virtualEvents);
     assert.equal(one.trafficCount,one.traffic.length);
    }
   }
  }
 }
});
test("defended virtual login blocks after three prewritten failures without passwords",()=>{
 const protectedRun=evaluateDefenseStudio(DEFAULT_STUDIO_CONFIG);
 const contrast=evaluateDefenseStudio({...DEFAULT_STUDIO_CONFIG,mode:"teaching"});
 assert.deepEqual(protectedRun.authentication.map(x=>x.status),[401,401,401,429,429,429]);
 assert(contrast.authentication.every(x=>x.status===401));
 assert(!JSON.stringify(protectedRun).includes("passwordCandidate"));
 assert(!JSON.stringify(contrast).includes("hash"));
});
test("owner boundary denies two fictional non-owner records only under protection",()=>{
 const p=evaluateDefenseStudio(DEFAULT_STUDIO_CONFIG);
 const t=evaluateDefenseStudio({...DEFAULT_STUDIO_CONFIG,mode:"teaching"});
 assert.deepEqual(p.authorization.map(x=>x.status),[200,403,200,403]);
 assert.deepEqual(t.authorization.map(x=>x.status),[200,200,200,200]);
});
test("protected virtual throttling reduces virtual unavailability for burst traffic",()=>{
 const x=compareStudioConfig(DEFAULT_STUDIO_CONFIG);
 assert(x.protected.throttled>0);
 assert(x.teaching.throttled===0);
 assert(x.protected.virtualUnavailable<x.teaching.virtualUnavailable);
 assert.equal(x.protected.accountProtected,3);
 assert.equal(x.teaching.ownershipDenied,0);
});
test("capacity lower than limit creates conceptual 503 without any real load",()=>{
 const c={profile:"burst",mode:"protected",rateLimit:6,serviceCapacity:2};
 const x=evaluateDefenseStudio(c);
 assert(x.metrics.virtualUnavailable>0);
 assert(x.metrics.throttled>0);
 assert.equal(x.traffic.length,x.trafficCount);
});
test("rejects network destinations, open-ended numbers and unsupported profiles",()=>{
 assert.throws(()=>validateStudioConfig({...DEFAULT_STUDIO_CONFIG,profile:"http://localhost:19090"}),/Invalid/);
 assert.throws(()=>validateStudioConfig({...DEFAULT_STUDIO_CONFIG,profile:"remote"}),/Invalid/);
 assert.throws(()=>validateStudioConfig({...DEFAULT_STUDIO_CONFIG,rateLimit:100000}),/Invalid/);
 assert.throws(()=>validateStudioConfig({...DEFAULT_STUDIO_CONFIG,serviceCapacity:0}),/Invalid/);
 assert.throws(()=>validateStudioConfig({...DEFAULT_STUDIO_CONFIG,mode:"execute"}),/Invalid/);
});
test("CSV and JSON export are aggregate-only without target, credentials or payload",()=>{
 const result=evaluateDefenseStudio(DEFAULT_STUDIO_CONFIG);
 const exportData=exportStudioSummary(result);
 assert.equal(exportData.networkRequestsSent,0);
 assert.equal(exportData.simulated,true);
 assert.equal(exportData.privacy.noPasswords,true);
 assert(!Object.hasOwn(exportData,"traffic"));
 assert(!Object.hasOwn(exportData,"authentication"));
 assert(!Object.hasOwn(exportData,"authorization"));
 const json=JSON.stringify(exportData);
 assert(!json.includes("localhost"));
 assert(!json.includes("127.0.0.1"));
 assert(!json.includes("http://"));
 assert(!json.includes("csrf"));
 const csv=exportStudioCsv(result);
 assert.equal(csv.trim().split("\n").length,9);
 assert(csv.startsWith("time_slot,incoming,accepted,throttled,unavailable"));
 assert(!csv.includes("Cookie"));
 assert(!csv.includes("http"));
});
