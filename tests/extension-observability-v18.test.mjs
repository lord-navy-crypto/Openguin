import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const file=new URL("../browser-extension/observability-v18.js",import.meta.url);
const script=readFileSync(file,"utf8");
const jsContext={};
runInNewContext(script,jsContext);
const summarize=jsContext.OpenguinObservability.summarize;
const now=Date.UTC(2026,9,28,10,10);
const mk=(kind,extra={},at=now)=>({kind,at,...extra});

test("v18 counts observed HTTP families, denied requests and response timing only",()=>{
 const events=[
  mk("fetch-response",{status:200,durationMs:10}),
  mk("xhr-response",{status:401,durationMs:15}),
  mk("fetch-response",{status:403,durationMs:25}),
  mk("xhr-response",{status:429,durationMs:30}),
  mk("fetch-response",{status:503,durationMs:4000})
 ];
 const x=summarize({events},{now});
 assert.equal(x.responseCount,5);
 assert.deepEqual(JSON.parse(JSON.stringify(x.statusFamilies)),{"2xx":1,"3xx":0,"4xx":3,"5xx":1});
 assert.equal(x.symptoms.authenticationDenials,2);
 assert.equal(x.symptoms.throttled,1);
 assert.equal(x.symptoms.serverErrors,1);
 assert.equal(x.symptoms.slowResponses,1);
 assert.equal(x.medianResponseMs,25);
 assert.equal(x.p95ResponseMs,4000);
 assert.equal(x.timingSamples,5);
 assert.equal(x.evidenceOnly,true);
});
test("v18 correlates manual request start/terminal IDs without inventing attacks",()=>{
 const events=[
   mk("fetch-start",{requestId:"r-old-1"},now-17000),
   mk("fetch-start",{requestId:"r-fresh-1"},now-2000),
   mk("xhr-start",{requestId:"r-done-1"},now-15000),
   mk("xhr-response",{requestId:"r-done-1",status:200,durationMs:10},now-10000),
   mk("fetch-error",{requestId:"r-failed-1"},now-4000),
   mk("fetch-stall",{},now-4000),
   mk("javascript-error",{},now-4000)
 ];
 const x=summarize({events},{now});
 assert.equal(x.symptoms.unfinished,1);
 assert.equal(x.symptoms.youngInFlight,1);
 assert.equal(x.symptoms.transportErrors,1);
 assert.equal(x.symptoms.stalls,1);
 assert.equal(x.symptoms.scriptErrors,1);
 assert(x.capture.notices.some(s=>s.includes("15秒")));
});
test("quality accurately communicates missing or truncated evidence",()=>{
 const r=summarize({events:[mk("navigation")],quality:{
  droppedEvents:23,duplicateEventsSuppressed:5,eventCapReached:true
 }},{now});
 assert.equal(r.capture.possibleTruncation,true);
 assert.equal(r.capture.droppedEvents,23);
 assert.equal(r.capture.duplicateEventsSuppressed,5);
 assert.equal(r.responseCount,0);
 assert.equal(r.p95ResponseMs,null);
 assert(r.capture.notices.some(s=>s.includes("截断")));
});
test("small response samples do not claim confident P95",()=>{
 const x=summarize({events:[
   mk("fetch-response",{status:200,durationMs:7}),
   mk("fetch-response",{status:200,durationMs:9})
 ]},{now});
 assert.equal(x.medianResponseMs,7);
 assert.equal(x.p95ResponseMs,null);
});
test("v18 exports no site identifiers, URLs, page content or secrets",()=>{
 const row=mk("fetch-response",{
   host:"private.example",path:"/account/secret-user-token",
   status:403,durationMs:15,body:"secret response",
   cookies:"secret cookie",headers:{"Authorization":"Bearer secret"}
 });
 const s=JSON.stringify(summarize({events:[row]},{now}));
 for(const term of ["private.example","/account","secret","Bearer","cookies","Authorization","path"])
   assert.equal(s.includes(term),false,term);
 assert.equal(summarize({events:[row]},{now}).statusFamilies["4xx"],1);
});
test("cap and out-of-range duration/time rules keep report bounded",()=>{
 const events=Array.from({length:500},(_,i)=>mk("fetch-response",{
   status:200,durationMs:i===0?1e9:5
 }));
 const x=summarize({events},{now});
 assert.equal(x.eventCount,300);
 assert.equal(x.responseCount,300);
 assert.equal(x.timingSamples,299);
 assert.equal(x.capture.possibleTruncation,true);
 assert.equal(summarize({events:[{kind:"xhr-response",at:10,status:200}]},{now}).eventCount,0);
});
test("v18 defaults to the chosen tab and never mixes another tab into its summary",()=>{
 const rows=[
   {...mk("fetch-response",{status:200,durationMs:12}),tabId:7},
   {...mk("fetch-response",{status:503,durationMs:2400}),tabId:11},
   {...mk("fetch-response",{status:401,durationMs:8}),tabId:7}
 ];
 const selected=summarize({events:rows},{now,tabId:7});
 const all=summarize({events:rows},{now});
 assert.equal(selected.scope,"selected-active-tab");
 assert.equal(selected.responseCount,2);
 assert.equal(selected.statusFamilies["5xx"],0);
 assert.equal(selected.statusFamilies["4xx"],1);
 assert.equal(all.responseCount,3);
 assert.equal(all.statusFamilies["5xx"],1);
 assert.equal(summarize({events:rows},{now,tabId:-1}).responseCount,0);
 assert(!JSON.stringify(selected).includes("tabId"));
});

test("v18 popup, manifest and CI package reference the exact local analyzer",()=>{
 const html=readFileSync(new URL("../browser-extension/popup.html",import.meta.url),"utf8");
 const popup=readFileSync(new URL("../browser-extension/popup.js",import.meta.url),"utf8");
 const manifest=JSON.parse(readFileSync(new URL("../browser-extension/manifest.json",import.meta.url),"utf8"));
 assert(html.includes('<script src="observability-v18.js"></script>'));
 for(const id of ["observedResponses","observedErrors","observedP95","observedPending",
   "observabilityQuality","observabilityNotes","observabilityJson","observabilityScope"]){
   assert(html.includes('id="'+id+'"'),id);
 }
 assert(popup.includes("OpenguinObservability.summarize"));
 assert(popup.includes("openguin-observability-v18-"));
 assert.equal(manifest.manifest_version,3);
 assert.deepEqual(manifest.permissions,["activeTab","scripting","storage"]);
 assert(!JSON.stringify(manifest).includes("<all_urls>"));
});
