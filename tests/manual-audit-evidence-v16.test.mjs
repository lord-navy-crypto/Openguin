import test from "node:test";
import assert from "node:assert/strict";
import {
  OBSERVED_HEADERS,inspectDefensiveHeaders,summarizeManualEvidence,
  exportManualEvidence
} from "../scripts/manual-audit-evidence-v16.mjs";

const healthy=()=>new Headers({
  "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Referrer-Policy":"no-referrer",
  "Cache-Control":"no-store",
  "Cross-Origin-Resource-Policy":"same-origin"
});
test("read-only policy checklist detects six common hardening observations",()=>{
 const h=inspectDefensiveHeaders(healthy(),200);
 assert.equal(h.observed,6);assert.equal(h.total,6);
 assert(h.checks.every(x=>x.observed));
 assert.equal(OBSERVED_HEADERS.length,7);
 assert(h.caveat.includes("观察性"));
});
test("absent headers are review indicators, never a declared exploit",()=>{
 const h=inspectDefensiveHeaders(new Headers(),401);
 assert.equal(h.observed,0);assert.equal(h.total,6);
 assert(h.checks.every(x=>x.note.length>0));
 assert(!JSON.stringify(h).includes("vulnerable:true"));
});
test("429 checks optional bounded retry guidance",()=>{
 const yes=new Headers(healthy());yes.set("Retry-After","60");
 const a=inspectDefensiveHeaders(yes,429);
 const b=inspectDefensiveHeaders(new Headers(),429);
 assert.equal(a.total,7);assert.equal(a.observed,7);
 assert.equal(b.total,7);assert.equal(b.checks.at(-1).observed,false);
});
test("only human-click outcomes count for quantile analysis, no synthetic load",()=>{
 const values=[10,20,40,90];
 const rows=values.map((durationMs,i)=>({check:"health",status:200,
    durationMs,method:"GET",path:"/health",evidence:inspectDefensiveHeaders(healthy())}));
 const x=summarizeManualEvidence(rows);
 assert.equal(x.observations,4);assert.equal(x.medianMs,20);
 assert.equal(x.p95Ms,90);assert.equal(x.counts["200"],4);
 assert.equal(summarizeManualEvidence(rows.slice(0,2)).p95Ms,null);
 assert.equal(summarizeManualEvidence([]).medianMs,null);
});
test("export contains only response decision metadata and safe header flags",()=>{
 const headers=healthy();headers.set("Set-Cookie","secret_token=do_not_export");
 const rows=[{check:"health",path:"/health",method:"GET",status:200,durationMs:8,
   explanation:"ok",evidence:inspectDefensiveHeaders(headers)}];
 const data=exportManualEvidence(rows);
 assert.equal(data.privacy.noCookies,true);
 assert.equal(data.results[0].evidence.observed,6);
 assert.equal(data.networkRequestsGeneratedByModel,0);
 assert(!Object.hasOwn(data.results[0],"explanation"));
 const serialized=JSON.stringify(data);
 for(const secret of ["secret_token","do_not_export","Set-Cookie","Content-Security-Policy","no-referrer","127.0.0.1","http://"])
  assert(!serialized.includes(secret));
});
test("bounds and malformed rows never generate percentile from bad durations",()=>{
 assert.throws(()=>summarizeManualEvidence(new Array(31).fill({})),/bounded/);
 assert.throws(()=>summarizeManualEvidence(null),/bounded/);
 const report=summarizeManualEvidence([
   {check:"health",status:200,durationMs:-1},
   {check:"health",status:800,durationMs:4},
   {check:"health",status:200,durationMs:60001},
   {check:"health",status:200,durationMs:2}
 ]);
 assert.equal(report.observations,1);
 assert.equal(report.medianMs,2);
});
