import test from "node:test";
import assert from "node:assert/strict";
import {
 createManualDrills,DRILL_TRACKS,DRILL_MODES,exportManualDrills
} from "../scripts/manual-drills-v14.mjs";

const a="a".repeat(48),b="b".repeat(48);
test("three categories and two fixed policy modes are available",()=>{
 assert.deepEqual(DRILL_TRACKS,["identity","ownership","capacity"]);
 assert.deepEqual(DRILL_MODES,["protected","teaching"]);
});
test("fictional identity failure gives 401 then 429 only for protective policy",()=>{
 let clock=100000;
 const engine=createManualDrills({now:()=>clock});
 for(let n=0;n<3;n++)assert.equal(engine.step(a,"identity").status,401);
 assert.equal(engine.step(a,"identity").status,429);
 assert.equal(engine.snapshot(a).counts.identity,3);
 engine.selectMode(a,"identity","teaching");
 for(let n=0;n<24;n++)assert.equal(engine.step(a,"identity").status,401);
 assert.equal(engine.snapshot(a).counts.identity,6);
 engine.selectMode(a,"identity","protected");
 assert.equal(engine.step(a,"identity").status,401);
 clock+=61000;
 assert.equal(engine.step(a,"identity").status,401);
});
test("fictional other-owner access is 403 protected, 200 teaching, then 403 again",()=>{
 const engine=createManualDrills();
 assert.equal(engine.step(a,"ownership").status,403);
 engine.selectMode(a,"ownership","teaching");
 assert.equal(engine.step(a,"ownership").status,200);
 engine.selectMode(a,"ownership","protected");
 assert.equal(engine.step(a,"ownership").status,403);
});
test("one-step capacity model never generates traffic or consumes queue resources",()=>{
 const engine=createManualDrills();
 for(let i=0;i<3;i++)assert.equal(engine.step(a,"capacity").status,200);
 for(let i=0;i<8;i++)assert.equal(engine.step(a,"capacity").status,429);
 assert.equal(engine.snapshot(a).counts.capacity,6);
 engine.selectMode(a,"capacity","teaching");
 for(let i=0;i<3;i++)assert.equal(engine.step(a,"capacity").status,200);
 assert.equal(engine.step(a,"capacity").status,503);
 assert.equal(engine.snapshot(a).generatedNetworkEvents,0);
});
test("all per-session controls are separate and reset is track-specific",()=>{
 const engine=createManualDrills();
 engine.selectMode(a,"ownership","teaching");
 engine.step(a,"ownership");
 engine.step(a,"capacity");
 assert.equal(engine.snapshot(b).modes.ownership,"protected");
 assert.equal(engine.snapshot(b).counts.ownership,0);
 engine.reset(a,"ownership");
 assert.equal(engine.snapshot(a).counts.ownership,0);
 assert.equal(engine.snapshot(a).counts.capacity,1);
 assert.equal(engine.snapshot(a).modes.ownership,"teaching");
});
test("invalid inputs and unrecognized host strings cannot be used as drill keys",()=>{
 const engine=createManualDrills();
 for(const bad of ["http://127.0.0.1:19090", "other.com", "", "a".repeat(49)])
  assert.throws(()=>engine.step(bad,"capacity"),/identity/);
 assert.throws(()=>engine.step(a,"payload"),/Unknown/);
 assert.throws(()=>engine.selectMode(a,"capacity","attack"),/Unknown/);
 assert.throws(()=>createManualDrills({now:"clock"}),/clock/);
});
test("bounded history and aggregate export avoid all cookies, secrets and inputs",()=>{
 const engine=createManualDrills();
 for(let i=0;i<90;i++)engine.step(a,"ownership");
 const s=engine.snapshot(a);
 assert.equal(s.history.length,30);
 assert.equal(s.counts.ownership,6);
 const result=exportManualDrills(s);
 assert.equal(result.generatedNetworkEvents,0);
 assert.equal(result.privacy.noPasswords,true);
 assert.equal(result.history.length,30);
 assert.equal(result.history[0].order,61);
 const json=JSON.stringify(result);
 assert(!json.includes(a));
 assert(!json.includes("Cookie"));
 assert(!json.includes("127.0.0.1"));
 assert(!json.includes("http://"));
 assert(!json.includes("passwordCandidate"));
 assert.throws(()=>exportManualDrills({schema:"other",history:[]}),/Invalid/);
});
