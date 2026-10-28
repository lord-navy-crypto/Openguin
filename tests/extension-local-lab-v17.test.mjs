import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const adapterSource=readFileSync(new URL("../browser-extension/lab-compat.js",import.meta.url),"utf8");
const backgroundSource=readFileSync(new URL("../browser-extension/background.js",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../browser-extension/manifest.json",import.meta.url),"utf8"));
const compatibility=(()=>{
  const context={URL,Date,Number,Object,Set,Math,Array,JSON,String,RegExp};
  runInNewContext(adapterSource,context);
  return context.OpenguinLabCompat;
})();
test("v17 manifest asks only for optional loopback and ChatGPT origins",()=>{
  assert.equal(manifest.manifest_version,3);
  assert.deepEqual(manifest.permissions,["activeTab","scripting","storage"]);
  assert.deepEqual(manifest.optional_host_permissions,[
    "https://chatgpt.com/*","https://chat.openai.com/*",
    "http://127.0.0.1/*","http://localhost/*"
  ]);
  assert(!JSON.stringify(manifest).includes("<all_urls>"));
  assert(!JSON.stringify(manifest).includes("webRequestBlocking"));
});
test("lab report counts real observed 200/401/403/429/503 local Fetch/XHR only",()=>{
  const now=Date.now();
  const events=[
    {host:"127.0.0.1",path:"/health",kind:"fetch-response",method:"GET",at:now,status:200,durationMs:8},
    {host:"localhost",path:"/member",kind:"xhr-response",method:"GET",at:now+1,status:401,durationMs:12},
    {host:"127.0.0.1",path:"/admin",kind:"fetch-response",method:"GET",at:now+2,status:403,durationMs:15},
    {host:"127.0.0.1",path:"/rate-check",kind:"fetch-response",method:"GET",at:now+3,status:429,durationMs:20},
    {host:"127.0.0.1",path:"/drill-step",kind:"xhr-response",method:"POST",at:now+4,status:503,durationMs:30}
  ];
  const {summary,report}=compatibility.toLabEvidence({events,quality:{}});
  assert.deepEqual(JSON.parse(JSON.stringify(summary.statusCounts)),{"200":1,"401":1,"403":1,"429":1,"503":1});
  assert.equal(summary.observedResponses,5);
  assert.equal(summary.medianObservedMs,15);
  assert.equal(summary.p95ObservedMs,30);
  assert.equal(report.source,"openguin-network-watch");
  assert.equal(report.formatVersion,1);
  assert.equal(report.labCompatibility.schema,"openguin-localhost-extension-v17");
});
test("v17 redacts other domains, paths, URL secrets, tokens, payloads and bodies",()=>{
  const now=Date.now();
  const events=[
    {host:"example.com",kind:"fetch-response",path:"/health",status:200,at:now,
      cookie:"secret_cookie"},
    {host:"127.0.0.1",kind:"fetch-response",path:"/private/sensitive-user-token",status:200,at:now},
    {host:"localhost",kind:"fetch-response",path:"/form?token=private",status:403,at:now},
    {host:"127.0.0.1",kind:"fetch-response",path:"/form",status:422,at:now,
      body:"secret_body",headers:{"Set-Cookie":"private"},url:"http://127.0.0.1/?secret"},
    {host:"127.0.0.1",kind:"navigation",path:"/workbench",at:now},
    {host:"127.0.0.1",kind:"fetch-start",path:"/health",at:now}
  ];
  const {summary,report}=compatibility.toLabEvidence({events,quality:{droppedEvents:3}});
  assert.equal(summary.observedResponses,1);
  assert.equal(report.events.length,3);
  assert.equal(summary.lostEvents,3);
  const text=JSON.stringify(report);
  for(const term of ["example.com","private","secret","token","Set-Cookie","http://","/private/"])
    assert(!text.includes(term),term);
});
test("adapter caps evidence at 300 events and does not invent missing navigation status",()=>{
  const events=Array.from({length:500},(_,i)=>({
    host:"127.0.0.1",path:"/health",kind:"navigation",at:100+i,status:503
  }));
  const {summary,report}=compatibility.toLabEvidence({events});
  assert.equal(report.events.length,300);
  assert.equal(summary.observedResponses,0);
  assert.equal(summary.p95ObservedMs,null);
  assert(!report.events[0].status);
});
test("extension reload hooks attach only on explicitly permissioned same-origin loopback",async()=>{
  const listeners={},calls=[],state={monitoring:true,activeTabId:71,activeHost:"127.0.0.1",monitorMode:"site-persistent",events:[]};
  const hook=name=>({addListener(fn){listeners[name]=fn;}});
  const chrome={
    storage:{local:{async get(fallback={}){return {...fallback,...state};},async set(v){Object.assign(state,v);}},
      session:{async get(fallback={}){return {...fallback};},async set(){},async remove(){}}},
    runtime:{onMessage:hook("message")},
    tabs:{onUpdated:hook("updated"),onRemoved:hook("removed")},
    scripting:{async executeScript(v){calls.push(v);}},
    permissions:{async contains(arg){return arg.origins?.[0]==="http://127.0.0.1/*";},
      onAdded:hook("permissionAdded"),onRemoved:hook("permissionRemoved")}
  };
  runInNewContext(backgroundSource,{chrome,URL,Date,Math,Number,String,Object,Promise,Set,Map,JSON,Array,RegExp});
  await listeners.updated(71,{status:"loading"},{url:"http://127.0.0.1:19090/health"});
  assert.equal(calls.length,0);
  assert.equal(state.monitoring,true);
  await listeners.updated(71,{status:"complete"},{url:"http://127.0.0.1:19090/health"});
  assert.equal(calls.length,2);
  assert.equal(state.monitoring,true);
  await listeners.updated(71,{status:"loading"},{url:"https://other.example/"});
  assert.equal(state.monitoring,false);
  assert.equal(calls.length,2);
});
test("unapproved HTTPS loopback reattachment is refused rather than injected",async()=>{
  const callbacks={};const state={monitoring:true,activeTabId:5,activeHost:"localhost",monitorMode:"site-persistent"};
  let injected=0;
  const hook=name=>({addListener(f){callbacks[name]=f;}});
  const chrome={
    storage:{local:{async get(f={}){return {...f,...state};},async set(v){Object.assign(state,v);}},
      session:{async get(f={}){return f;},async set(){},async remove(){}}},
    runtime:{onMessage:hook("message")},
    tabs:{onUpdated:hook("updated"),onRemoved:hook("removed")},
    scripting:{async executeScript(){injected++;}},
    permissions:{async contains(){return true;},onAdded:hook("added"),onRemoved:hook("removedPermission")}
  };
  runInNewContext(backgroundSource,{chrome,URL,Date,Math,Number,String,Object,Promise,Set,Map,JSON,Array,RegExp});
  await callbacks.updated(5,{status:"complete"},{url:"https://localhost:19090/"});
  assert.equal(injected,0);
  assert.equal(state.monitoring,false);
});
