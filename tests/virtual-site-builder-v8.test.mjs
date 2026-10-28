import test from "node:test";
import assert from "node:assert/strict";
import {
 makeSite,validateSite,validateSwitches,PROTECTED_SWITCHES,TRAINING_SWITCHES,
 SITE_SCENARIOS,generateSiteCases,runVirtualSite,compareVirtualSite,
 exportSiteRun,exportSiteAccessLog,exportSiteBrowserJournal
} from "../.network-test/virtual-site-builder-v8.mjs";
import {analyzeAccessLog} from "../.network-test/server-access-log.mjs";
import {parseBrowserJournal} from "../.network-test/network-journal.mjs";
const templates=["community","classroom","store"];

test("three isolated editable site templates provide realistic page roles",()=>{
 for(const id of templates){
  const site=makeSite(id);
  assert.equal(site.pages.length,6);
  assert.equal(new Set(site.pages.map(x=>x.id)).size,site.pages.length);
  assert(site.pages.some(x=>x.access==="public"));
  assert(site.pages.some(x=>x.access==="member"&&x.ownerOnly));
  assert(site.pages.some(x=>x.access==="admin"));
  assert(site.pages.some(x=>x.stateChanging&&x.validatesInput));
  assert.deepEqual(validateSite(site),site);
 }
});
test("deterministic synthetic scenario generation has no URLs or payloads",()=>{
 for(const template of templates){
  const site=makeSite(template);
  for(const {id} of SITE_SCENARIOS){
   const a=generateSiteCases(site,id);
   assert.deepEqual(a,generateSiteCases(site,id));
   assert(a.length>0&&a.length<=80,template+" / "+id);
   assert(a.every(x=>!Object.hasOwn(x,"url")&&!Object.hasOwn(x,"payload")&&
     !Object.hasOwn(x,"password")&&!Object.hasOwn(x,"ip")));
  }
 }
});
test("protected site denies unauthorized and malformed synthetic requests",()=>{
 for(const template of templates){
  const site=makeSite(template);
  const result=runVirtualSite(site,"mixed",PROTECTED_SWITCHES);
  assert(result.total>10);
  assert.equal(result.missedDenials,0);
  assert.equal(result.falseDenials,0);
  assert.equal(result.disclosedErrorDetails,0);
  assert.equal(result.correct,result.total);
  const statuses=result.cases.map(x=>x.status);
  for(const status of [200,401,403,422,500])assert(statuses.includes(status),template+" "+status);
 }
});
test("disabled role check allows synthetic member to access an admin page",()=>{
 const site=makeSite("community");
 const baseline=runVirtualSite(site,"role-boundary",TRAINING_SWITCHES);
 assert(baseline.missedDenials>=1);
 assert(baseline.cases.some(x=>x.expectedReason==="role"&&x.observed==="allow"));
 const protectedRun=runVirtualSite(site,"role-boundary",PROTECTED_SWITCHES);
 assert.equal(protectedRun.missedDenials,0);
});
test("resource ownership, session, form and input validations independently matter",()=>{
 const site=makeSite("store");
 const pairs=[
  ["resource-owner","ownershipChecks","ownership"],
  ["session-expiry","sessionChecks","expired"],
  ["form-origin","csrfChecks","origin-check"],
  ["invalid-input","inputValidation","invalid-input"],
  ["guest-access","accessControl","authentication"]
 ];
 for(const [scenario,key,reason] of pairs){
  const off=runVirtualSite(site,scenario,{...PROTECTED_SWITCHES,[key]:false});
  assert(off.missedDenials>0,scenario);
  assert(off.cases.some(x=>x.expectedReason===reason&&x.observed==="allow"),scenario);
  const on=runVirtualSite(site,scenario,PROTECTED_SWITCHES);
  assert.equal(on.missedDenials,0,scenario);
 }
});
test("internal fault training displays exposure signals without including actual secrets",()=>{
 const site=makeSite("classroom");
 const off=runVirtualSite(site,"server-fault",{...PROTECTED_SWITCHES,genericErrors:false});
 assert(off.disclosedErrorDetails>0);
 assert(off.cases.every(x=>x.status===500));
 const on=runVirtualSite(site,"server-fault",PROTECTED_SWITCHES);
 assert.equal(on.disclosedErrorDetails,0);
 assert.equal(on.correct,on.total);
 const summary=JSON.stringify(exportSiteRun(off));
 assert(!summary.includes("stacktrace"));
 assert(!summary.includes("password"));
});
test("route editing changes expected security rules, not just the UI",()=>{
 const site=makeSite("community");
 const admin=site.pages.find(x=>x.access==="admin");
 assert(admin);
 const before=generateSiteCases(site,"role-boundary");
 assert(before.some(x=>x.pageId===admin.id));
 site.pages=site.pages.map(p=>p.id===admin.id?{...p,access:"public"}:p);
 assert.equal(generateSiteCases(site,"role-boundary").length,0);
 site.pages=site.pages.map(p=>p.id===admin.id?{...p,access:"member"}:p);
 const visitor=generateSiteCases(site,"guest-access");
 assert(visitor.some(x=>x.pageId===admin.id));
});
test("training comparison reflects missed permissions and safe protected rules",()=>{
 const s=makeSite("classroom");
 const cmp=compareVirtualSite(s,"mixed",PROTECTED_SWITCHES);
 assert(cmp.baseline.missed>cmp.current.missed);
 assert(cmp.baseline.exposed>cmp.current.exposed);
 assert.equal(cmp.current.missed,0);
 assert.equal(cmp.current.exposed,0);
});
test("rejects invalid templates, duplicated pages and incorrect control types",()=>{
 assert.throws(()=>makeSite("external"),/未知/);
 const site=makeSite("store");
 site.pages.push({...site.pages[0]});
 assert.throws(()=>validateSite(site),/不符合/);
 assert.throws(()=>validateSwitches({...PROTECTED_SWITCHES,csrfChecks:"maybe"}),/无效/);
 assert.throws(()=>runVirtualSite(makeSite("store"),"unknown",PROTECTED_SWITCHES),/未知/);
});
test("aggregate export excludes user-entered website name and private labels",()=>{
 const site=makeSite("community");
 site.siteLabel="SECRET-PRIVATE-WEBSITE-ALIAS";
 site.pages[0].label="SECRET-PRIVATE-PAGE-LABEL";
 const out=exportSiteRun(runVirtualSite(site,"mixed",PROTECTED_SWITCHES));
 const text=JSON.stringify(out);
 assert.equal(out.networkRequestsSent,0);
 assert.equal(out.privacy.syntheticOnly,true);
 assert(!Object.hasOwn(out,"cases"));
 assert(!text.includes("SECRET-PRIVATE"));
 assert(!text.includes("userAgent"));
 assert(!text.includes("requestBody"));
 assert(!text.includes("http://"));
});
test("generated access.log is compatible with existing passive access log investigator",()=>{
 const run=runVirtualSite(makeSite("community"),"mixed",PROTECTED_SWITCHES);
 const text=exportSiteAccessLog(run);
 const analysis=analyzeAccessLog(text);
 assert.equal(analysis.parsedLines,run.total);
 assert.equal(analysis.ignoredLines,0);
 assert(text.includes("127.0.0.1"));
 assert(!text.includes("example.com"));
 assert(!text.includes("SECRET-PRIVATE"));
});
test("generated journal loads into existing browser forensic analyzer",()=>{
 const run=runVirtualSite(makeSite("store"),"mixed",PROTECTED_SWITCHES);
 const imported=parseBrowserJournal(JSON.stringify(exportSiteBrowserJournal(run)));
 assert.equal(imported.events.length,run.total);
 assert(imported.events.every(x=>x.host==="virtual.local"&&x.kind==="fetch-response"));
 assert(imported.events.some(x=>x.status===403));
});
