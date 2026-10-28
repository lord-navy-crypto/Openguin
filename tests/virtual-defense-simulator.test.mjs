import test from "node:test";
import assert from "node:assert/strict";
import {
  scenarioDetails,defaultTrainingRules,generateVirtualTraffic,
  simulateVirtualDefense,exportVirtualDefenseReport,normalizeRules
} from "../.network-test/virtual-defense-simulator.mjs";
const scenarios=["baseline","launch","burst","sign-in","slow-service","mixed"];
test("all six scenarios remain deterministic and bounded in memory",()=>{
 for(const id of scenarios){
  const a=generateVirtualTraffic(id,2026),b=generateVirtualTraffic(id,2026);
  assert.deepEqual(a,b);
  assert(a.length>0 && a.length<=2400);
  assert(a.every(e=>e.minute>=0 && e.minute<10 && e.actor>0));
  assert(scenarioDetails[id].name.length>0);
 }
});
test("normal baseline does not fabricate anomalous visitors",()=>{
 const result=simulateVirtualDefense("baseline");
 assert.equal(result.anomalous,0);
 assert.equal(result.total,result.legitimate);
 assert.equal(result.correctlyBlocked,0);
 assert.equal(result.timeline.length,10);
 assert.equal(result.blocked+result.allowed,result.total);
});
test("virtual burst responds to rate policy without any real requests",()=>{
 const strict=simulateVirtualDefense("burst",defaultTrainingRules);
 const permissive=simulateVirtualDefense("burst",{...defaultTrainingRules,requestsPerActorMinute:60});
 assert(strict.correctlyBlocked>0);
 assert(permissive.anomaliesAllowed>strict.anomaliesAllowed);
 assert(permissive.correctlyBlocked<strict.correctlyBlocked);
 assert.equal(strict.schema,"openguin-virtual-defense-simulator-v1");
});
test("legitimate campaign traffic illustrates false-positive tradeoffs",()=>{
 const strict=simulateVirtualDefense("launch",{...defaultTrainingRules,requestsPerActorMinute:2});
 const relaxed=simulateVirtualDefense("launch",{...defaultTrainingRules,requestsPerActorMinute:30});
 assert(strict.normalBlocked>0);
 assert(strict.falsePositivePercent>relaxed.falsePositivePercent);
 assert.strictEqual(strict.anomalous,0);
 assert(relaxed.legitimateAvailabilityPercent>strict.legitimateAvailabilityPercent);
});
test("synthetic sign-in failures trigger local policy limits",()=>{
 const r=simulateVirtualDefense("sign-in");
 assert(r.records.some(e=>e.reason==="sign-in-limit"));
 assert(r.correctlyBlocked>0);
 assert(r.anomalous>0);
 assert(r.records.every(e=>e.failedSignIn===true || e.failedSignIn===false));
});
test("slow service emits alert signals but is not auto-labeled an attacker",()=>{
 const r=simulateVirtualDefense("slow-service");
 assert.equal(r.anomalous,0);
 assert(r.slowObservations>0);
 assert(r.records.some(e=>e.alerts.includes("slow-response")));
 assert(r.serverErrors>0);
});
test("every simulated event belongs to exactly one reported classification",()=>{
 for(const id of scenarios){
  const r=simulateVirtualDefense(id);
  assert.equal(r.legitimate+r.anomalous,r.total);
  assert.equal(r.correctlyBlocked+r.normalBlocked,r.blocked);
  assert.equal(r.correctlyBlocked+r.anomaliesAllowed,r.anomalous);
  assert.equal(r.allowed+r.blocked,r.total);
  assert.equal(r.timeline.reduce((sum,m)=>sum+m.seen,0),r.total);
  assert.equal(r.timeline.reduce((sum,m)=>sum+m.blocked,0),r.blocked);
  assert.equal(r.timeline.reduce((sum,m)=>sum+m.alertCount,0),r.alerts);
 }
});
test("rule normalization clamps untrusted out-of-range values",()=>{
 assert.deepEqual(normalizeRules({
   requestsPerActorMinute:-2,failedSignInsPerActorWindow:999,
   slowResponseMs:Number.POSITIVE_INFINITY,alertServerErrors:-40
 }),{
   requestsPerActorMinute:2,failedSignInsPerActorWindow:12,
   slowResponseMs:300,alertServerErrors:1
 });
});
test("export includes summary metrics but excludes per-actor virtual records",()=>{
 const r=simulateVirtualDefense("mixed");
 const exported=exportVirtualDefenseReport(r);
 assert.equal(Object.hasOwn(exported,"records"),false);
 assert.equal(exported.privacy.networkRequestsMade,false);
 assert.equal(exported.privacy.realTargetUsed,false);
 assert.equal(exported.privacy.credentialsUsed,false);
 assert.equal(exported.privacy.rawVirtualActorEventsExported,false);
 assert.equal(exported.timeline.length,10);
 assert.equal(exported.total,r.total);
 assert(!JSON.stringify(exported).includes('"actor":'));
 assert(!JSON.stringify(exported).includes('"failedSignIn":'));
});
test("unknown scenario is rejected instead of creating an external target",()=>{
 assert.throws(()=>generateVirtualTraffic("https://example.com"),/不支持/);
});
