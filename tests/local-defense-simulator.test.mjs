import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,LEARNING_BASELINE,SCENARIOS,generateVirtualRequests,simulateDefense,
  validatePolicy,compareDefensePolicies,exportSimulationSummary
} from "../.network-test/local-defense-simulator.mjs";

test("all available scenarios create bounded deterministic synthetic-only events",()=>{
  for(const scenario of SCENARIOS){
    const a=generateVirtualRequests(scenario.id);
    const b=generateVirtualRequests(scenario.id);
    assert.deepEqual(a,b);
    assert(a.length>0&&a.length<=60);
    assert(a.every(x=>Number.isFinite(x.atMs)&&x.atMs>=0&&
      ["visitor","member","admin"].includes(x.role)&&
      ["allow","block"].includes(x.expected)));
    assert(a.every(x=>!Object.hasOwn(x,"url")&&!Object.hasOwn(x,"password")&&!Object.hasOwn(x,"ip")));
  }
});
test("strict policy protects role, CSRF and session expiration",()=>{
  for(const [scenario,reason] of [
    ["role-boundary","role-denied"],["csrf-review","csrf-missing"],
    ["expired-session","session-expired"]
  ]){
    const x=simulateDefense(scenario,DEFAULT_POLICY);
    assert.equal(x.summary.missedProtections,0,scenario);
    assert(x.summary.byReason[reason]>=4,scenario);
    assert.equal(x.rows.filter(r=>r.expected==="allow"&&r.actual==="allow").length>=1,true);
  }
});
test("synthetic volume scenario demonstrates rate limiter without sending requests",()=>{
  const strict=simulateDefense("login-volume",DEFAULT_POLICY);
  assert.equal(strict.summary.total,24);
  assert.equal(strict.summary.byReason["rate-limit"],18);
  assert.equal(strict.summary.missedProtections,0);
  assert.equal(strict.rows[5].responseStatus,200);
  assert.equal(strict.rows[6].responseStatus,429);
  const baseline=simulateDefense("login-volume",LEARNING_BASELINE);
  assert.equal(baseline.summary.blocked,0);
  assert.equal(baseline.summary.missedProtections,18);
});
test("stricter rules can cause false positives among expected normal events",()=>{
  const policy={...DEFAULT_POLICY,maxEventsPerWindow:2};
  const r=simulateDefense("login-volume",policy);
  assert(r.summary.falsePositives>0);
  assert.equal(r.summary.correctDecisions+r.summary.falsePositives+
    r.summary.missedProtections,r.summary.total);
  const cmp=compareDefensePolicies("login-volume",LEARNING_BASELINE,policy);
  assert(cmp.deltaMissedProtections<0);
  assert(cmp.deltaFalsePositives>0);
});
test("defense toggles change outcomes only in conceptual mock rules",()=>{
  const noRole=simulateDefense("role-boundary",{...DEFAULT_POLICY,enforceRoles:false});
  assert.equal(noRole.summary.byReason["role-denied"],0);
  assert(noRole.summary.missedProtections>=4);
  const noCsrf=simulateDefense("csrf-review",{...DEFAULT_POLICY,requireCsrf:false});
  assert(noCsrf.summary.missedProtections>=4);
  const oldTtl=simulateDefense("expired-session",{...DEFAULT_POLICY,sessionLifetimeMinutes:240});
  assert(oldTtl.summary.missedProtections>=4);
  const headers=simulateDefense("normal",{...DEFAULT_POLICY,securityHeaders:false});
  assert.equal(headers.summary.securityHeaderSignal,"disabled");
});
test("regular access should remain usable with the default policy",()=>{
  const result=simulateDefense("normal",DEFAULT_POLICY);
  assert.equal(result.summary.missedProtections,0);
  assert.equal(result.summary.falsePositives,0);
  assert.equal(result.summary.correctDecisions,result.summary.total);
});
test("simulator rejects unknown scenario and invalid policy parameters",()=>{
  assert.throws(()=>generateVirtualRequests("unknown"),/未知/);
  for(const field of ["maxEventsPerWindow","rateWindowSeconds","sessionLifetimeMinutes"]){
    const input={...DEFAULT_POLICY,[field]:10000000};
    assert.throws(()=>validatePolicy(input),/超出/);
  }
  assert.throws(()=>validatePolicy({...DEFAULT_POLICY,requireCsrf:"yes"}),/超出/);
});
test("exports have aggregate counts and explicit no-network/no-credentials declarations",()=>{
  const result=simulateDefense("mixed",DEFAULT_POLICY);
  const out=exportSimulationSummary(result);
  const txt=JSON.stringify(out);
  assert.equal(out.networkRequestsSent,0);
  assert.equal(out.simulated,true);
  assert.equal(out.privacy.noCredentials,true);
  assert(!Object.hasOwn(out,"rows"));
  assert(!txt.includes("password"));
  assert(!txt.includes("http://"));
  assert(!txt.includes("https://"));
  assert(result.summary.total<=60);
});
