import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

async function setup(){
  const listeners={};
  const data={local:{monitoring:true,activeTabId:17,activeHost:"example.com",journalEnabled:false},session:{}};
  const bucket=name=>({
    async get(fallback={}){return {...fallback,...data[name]};},
    async set(values){Object.assign(data[name],values);},
    async remove(key){delete data[name][key];}
  });
  const hook=name=>({addListener(fn){listeners[name]=fn;}});
  const chrome={
    storage:{local:bucket("local"),session:bucket("session")},
    runtime:{onMessage:hook("event")},
    tabs:{onUpdated:hook("updated"),onRemoved:hook("removed")},
    scripting:{executeScript:async()=>{}},
    permissions:{contains:async()=>false,onAdded:hook("permissionsAdded"),onRemoved:hook("permissionsRemoved")}
  };
  vm.runInNewContext(fs.readFileSync("browser-extension/background.js","utf8"),{
    chrome,Date,URL,Math,Number,String,Promise,Set,Map,Object,RegExp,Array
  });
  const emit=async(item)=>{
    listeners.event({type:"openguin-network-event",event:item},{
      tab:{id:17,url:"https://example.com/"},url:"https://example.com/"
    });
    await new Promise(resolve=>setTimeout(resolve,20));
  };
  return {data,emit};
}
test("journal is off by default and has no automatic collection",async()=>{
  const {data,emit}=await setup();
  await emit({kind:"fetch-response",host:"example.com",status:200});
  assert.equal((data.local.journalEvents||[]).length,0);
  assert.equal(data.local.events.length,1);
});
test("enabled journal keeps only bounded categories, host and timing",async()=>{
  const {data,emit}=await setup();
  data.local.journalEnabled=true;
  await emit({kind:"fetch-error",host:"example.com",path:"/api/private-secret",
    requestId:"private-request-id",errorType:"SecretError",at:Date.now(),durationMs:321});
  assert.equal(data.local.journalEvents.length,1);
  const journal=JSON.stringify(data.local.journalEvents);
  assert(journal.includes("example.com"));
  assert(!journal.includes("private-secret"));
  assert(!journal.includes("private-request-id"));
  assert(!journal.includes("SecretError"));
  assert(!journal.includes("errorType"));
});
test("journal bounds events and prunes items older than 30 days",async()=>{
  const {data,emit}=await setup();
  data.local.journalEnabled=true;
  const recent=Date.now();
  data.local.journalEvents=[
    {at:recent-32*86400000,host:"old.example",kind:"fetch-start"},
    ...Array.from({length:2500},(_,i)=>({at:recent,host:"example.com",kind:"fetch-response",durationMs:i}))
  ];
  await emit({kind:"download-failed",host:"example.com",at:recent});
  assert.equal(data.local.journalEvents.length,2500);
  assert.equal(data.local.journalEvents.some(e=>e.host==="old.example"),false);
  assert.equal(data.local.journalDropped,1);
});
test("stopped tab monitoring cannot be used to append website events",async()=>{
  const {data,emit}=await setup();
  data.local.journalEnabled=true;data.local.monitoring=false;
  await emit({kind:"fetch-error",host:"example.com"});
  assert.equal((data.local.journalEvents||[]).length,0);
});
