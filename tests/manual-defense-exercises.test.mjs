import test from "node:test";
import assert from "node:assert/strict";
import {createManualExerciseState} from "../scripts/manual-defense-exercises.mjs";

const keyA="a".repeat(48),keyB="b".repeat(48);
test("one-click synthetic failures lock out after three steps and expire",()=>{
  let clock=1000000;
  const lab=createManualExerciseState({now:()=>clock});
  for(let i=0;i<3;i++)assert.equal(lab.failureCheck(keyA).status,401);
  assert.equal(lab.failureCheck(keyA).status,429);
  assert.equal(lab.snapshot(keyA).failedIdentityEvents,3);
  clock+=60001;
  assert.equal(lab.failureCheck(keyA).status,401);
});
test("virtual capacity has a bounded 503 threshold with no resource load",()=>{
  const lab=createManualExerciseState();
  for(let i=0;i<3;i++)assert.equal(lab.capacityCheck(keyA).status,200);
  for(let i=0;i<15;i++)assert.equal(lab.capacityCheck(keyA).status,503);
  assert.equal(lab.snapshot(keyA).virtualQueueUnits,5);
  assert.equal(lab.snapshot(keyA).remainingSafeQueueSlots,0);
  assert.equal(lab.reset(keyA).status,200);
  assert.equal(lab.snapshot(keyA).virtualQueueUnits,0);
  assert.equal(lab.capacityCheck(keyA).status,200);
});
test("separate server-issued local identities cannot share counters",()=>{
  const lab=createManualExerciseState();
  lab.failureCheck(keyA);lab.capacityCheck(keyA);
  assert.equal(lab.snapshot(keyB).failedIdentityEvents,0);
  assert.equal(lab.snapshot(keyB).virtualQueueUnits,0);
});
test("rejects invalid exercise identity and export exposes only aggregate counters",()=>{
  const lab=createManualExerciseState();
  assert.throws(()=>lab.failureCheck("not-issued"),/identity/);
  assert.throws(()=>lab.capacityCheck("https://example.org"),/identity/);
  const text=JSON.stringify(lab.snapshot(keyA));
  assert(!text.includes(keyA));
  assert(!text.includes("password"));
  assert(!text.includes("http:"));
});
