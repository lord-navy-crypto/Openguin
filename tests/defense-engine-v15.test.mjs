import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFENSE_PATTERNS,DEFENSE_CAPACITY_OPTIONS,DEFENSE_QUEUE_OPTIONS,
  DEFENSE_THROTTLE_OPTIONS,DEFENSE_LOCK_OPTIONS,DEFAULT_DEFENSE_CONFIG,
  validateDefenseV15,runDefenseV15,exportDefenseV15,exportDefenseV15Csv
} from "../scripts/defense-engine-v15.mjs";

test("all 243 fixed configurations are deterministic, bounded and conserve event counts",()=>{
 let count=0;
 for(const pattern of Object.keys(DEFENSE_PATTERNS))
  for(const capacity of DEFENSE_CAPACITY_OPTIONS)
   for(const queue of DEFENSE_QUEUE_OPTIONS)
    for(const throttle of DEFENSE_THROTTLE_OPTIONS)
     for(const lockout of DEFENSE_LOCK_OPTIONS){
      const config={pattern,capacity,queue,throttle,lockout};
      const one=runDefenseV15(config),two=runDefenseV15(config);
      assert.deepEqual(one,two);
      assert.equal(one.networkRequestsGenerated,0);
      assert.equal(one.virtualFrames,16);
      for(const type of ["protected","contrast"]){
       const x=one[type],m=x.metrics;
       assert.equal(x.history.length,16);
       assert.equal(m.arrivals,m.processed+m.throttled+m.unavailable+m.remainingQueued);
       assert(m.peakBacklog<=queue);
       assert(x.history.every(e=>e.incoming>=2&&e.incoming<=12));
       assert(x.history.every(e=>e.processed<=capacity));
       assert(x.history.every(e=>e.backlogAfter<=queue));
       assert(x.history.every(e=>e.latencyUnits>=20&&e.latencyUnits<1000));
       assert(m.processedPercent>=0&&m.processedPercent<=100);
      }
      count++;
     }
 assert.equal(count,243);
});
test("raising fictional service capacity does not increase unavailable outcomes",()=>{
 for(const pattern of Object.keys(DEFENSE_PATTERNS)){
  let last=Infinity;
  for(const capacity of DEFENSE_CAPACITY_OPTIONS){
   const x=runDefenseV15({...DEFAULT_DEFENSE_CONFIG,pattern,capacity}).contrast.metrics;
   assert(x.unavailable<=last);
   last=x.unavailable;
  }
 }
});
test("lowering throttle budget increases virtual rate-control and can affect regular events",()=>{
 const low=runDefenseV15({...DEFAULT_DEFENSE_CONFIG,throttle:3}).protected.metrics;
 const high=runDefenseV15({...DEFAULT_DEFENSE_CONFIG,throttle:8}).protected.metrics;
 assert(low.throttled>high.throttled);
 assert(low.estimatedNormalThrottled>=high.estimatedNormalThrottled);
});
test("credential-free failure timeline respects configurable guardrail and recovery",()=>{
 const a=runDefenseV15({...DEFAULT_DEFENSE_CONFIG,lockout:2});
 const b=runDefenseV15({...DEFAULT_DEFENSE_CONFIG,lockout:4});
 assert(a.protected.identity.blocked>b.protected.identity.blocked);
 assert.equal(a.contrast.identity.blocked,0);
 assert(a.protected.identity.events.every(x=>[200,401,429].includes(x.status)));
 assert(a.protected.identity.events.some(x=>x.event==="invented-recovery"&&x.status===200));
 const json=JSON.stringify(a.protected.identity);
 assert(!json.includes("passwordCandidate"));
 assert(!json.includes("username"));
});
test("non-executable fictional security checks flag missing ownership, role, origin and field controls",()=>{
 const x=runDefenseV15(DEFAULT_DEFENSE_CONFIG);
 assert.deepEqual(x.protected.validation.cases.map(r=>r.status),[200,403,403,403,422]);
 assert.deepEqual(x.contrast.validation.cases.map(r=>r.status),[200,200,200,200,200]);
 assert.equal(x.protected.validation.failedChecks,0);
 assert.equal(x.contrast.validation.failedChecks,4);
});
test("all user-controllable options reject broad/unbounded inputs or external targets",()=>{
 const invalid=[
  {...DEFAULT_DEFENSE_CONFIG,pattern:"http://localhost:19090"},
  {...DEFAULT_DEFENSE_CONFIG,pattern:"outside.example"},
  {...DEFAULT_DEFENSE_CONFIG,capacity:5000},
  {...DEFAULT_DEFENSE_CONFIG,queue:0},
  {...DEFAULT_DEFENSE_CONFIG,throttle:-1},
  {...DEFAULT_DEFENSE_CONFIG,lockout:100},
  {...DEFAULT_DEFENSE_CONFIG,lockout:"3"},
  {...DEFAULT_DEFENSE_CONFIG,pattern:"__proto__"}
 ];
 for(const item of invalid)assert.throws(()=>validateDefenseV15(item),/Invalid/);
});
test("aggregate reports and CSV contain no addresses, logins, passwords or payload data",()=>{
 const run=runDefenseV15(DEFAULT_DEFENSE_CONFIG),out=exportDefenseV15(run);
 assert.equal(out.networkRequestsGenerated,0);
 assert.equal(out.modelOnly,true);
 assert.equal(out.slots.length,16);
 assert(!Object.hasOwn(out,"identity"));
 assert(!Object.hasOwn(out,"validation"));
 const json=JSON.stringify(out),csv=exportDefenseV15Csv(run);
 for(const bad of ["127.0.0.1","Cookie","Authorization:","http://","csrf","passwordCandidate"]){
  assert(!json.includes(bad));
  assert(!csv.includes(bad));
 }
 assert.equal(csv.trim().split("\n").length,17);
 assert(csv.startsWith("slot,incoming,guardedProcessed"));
 assert.throws(()=>exportDefenseV15({schema:"wrong"}),/Expected/);
});
