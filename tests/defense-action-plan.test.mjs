import test from "node:test";
import assert from "node:assert/strict";
import {buildDefenseActionPlan,exportDefenseActionPlan} from "../.network-test/defense-action-plan.mjs";
import {auditHttpResponseHeaders} from "../.network-test/defensive-header-audit.mjs";
import {analyzeAccessLog} from "../.network-test/server-access-log.mjs";
import {parseBrowserJournal} from "../.network-test/network-journal.mjs";
const at=1793200000000;
const browser=(events)=>parseBrowserJournal(JSON.stringify({
 schema:"openguin-browser-journal-v1",
 createdAt:new Date(at+1000).toISOString(),retentionDays:30,capacity:2500,
 recordingEnabled:false,capacityDropped:0,events
}));
const e=(kind,status)=>({at:at-2000,host:"my-site.example",kind,status,durationMs:100,
 requestId:"never-export-identifier",path:"/private?secret=foobar"});
const access='192.0.2.7 - - [28/Oct/2026:12:01:00 +0800] "GET /secret-token HTTP/1.1" 503 22 "-" "Agent"';
test("no supplied evidence yields no invented vulnerabilities",()=>{
 assert.deepEqual(buildDefenseActionPlan(null,null,null),[]);
});
test("configuration and incident evidence produce actionable non-invasive recommendations",()=>{
 const header=auditHttpResponseHeaders("Content-Type: text/html");
 const server=analyzeAccessLog(access);
 const journal=browser([e("fetch-error",null),e("fetch-stall",null)]);
 const tasks=buildDefenseActionPlan(header,server,journal);
 assert(tasks.some(x=>x.id==="server-5xx"));
 assert(tasks.some(x=>x.id==="browser-transport"));
 assert(tasks.some(x=>x.id==="browser-stall"));
 assert(tasks.some(x=>x.id==="header-csp"));
 assert(tasks.every(x=>x.caveat.length>12 && x.nextStep.length>12));
 assert.equal(tasks[0].priority,"investigate");
 const data=JSON.stringify(exportDefenseActionPlan(tasks));
 for(const privateData of ["192.0.2.7","/secret-token","never-export-identifier","secret=foobar"])
   assert.equal(data.includes(privateData),false);
});
test("passing configuration observations are not an automatic certification",()=>{
 const header=auditHttpResponseHeaders([
 "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'",
 "Strict-Transport-Security: max-age=31536000",
 "X-Content-Type-Options: nosniff",
 "Referrer-Policy: strict-origin-when-cross-origin",
 "Permissions-Policy: camera=()"
 ].join("\n"));
 const tasks=buildDefenseActionPlan(header,null,null);
 assert.equal(tasks.length,0);
 assert(!JSON.stringify(exportDefenseActionPlan(tasks)).includes("certified"));
});
test("429 and parsing omissions are treated as monitoring leads, not evidence of an attack",()=>{
 const server=analyzeAccessLog(access.replace(" 503 "," 429 ")+"\nnot a supported log");
 const tasks=buildDefenseActionPlan(null,server,null);
 assert(tasks.some(x=>x.id==="server-429"));
 assert(tasks.some(x=>x.id==="server-log-format"));
 assert(!JSON.stringify(tasks).includes("攻击已发生"));
});
