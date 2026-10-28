import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const script=readFileSync(new URL("../browser-extension/background.js",import.meta.url),"utf8");
const wait=()=>new Promise(resolve=>setTimeout(resolve,35));
function setup(initial={},permission=true){
  const state={
    monitoring:true,activeTabId:7,activeHost:"127.0.0.1",
    monitorMode:"site-persistent",events:[],captureObservedCount:0,
    ...initial
  },listeners={};
  let permitted=permission;
  const register=name=>({addListener(fn){listeners[name]=fn;}});
  const chrome={
    runtime:{id:"own-extension",onMessage:register("message")},
    storage:{
      local:{async get(def={}){return {...def,...state};},
        async set(x){Object.assign(state,x);}},
      session:{async get(def={}){return def;},async set(){},async remove(){}}
    },
    tabs:{onUpdated:register("updated"),onRemoved:register("removed")},
    permissions:{
      async contains(){return permitted;},onAdded:register("permitted"),
      onRemoved:register("revoked")
    },
    scripting:{async executeScript(){}}
  };
  const start=()=>runInNewContext(script,
    {chrome,URL,Date,Math,Number,String,Object,Promise,Set,Map,JSON,Array,RegExp});
  start();
  const sender=(props={})=>({
    id:"own-extension",frameId:0,tab:{id:7,url:"http://127.0.0.1:19090/workbench"},
    url:"http://127.0.0.1:19090/workbench",...props
  });
  let seq=0;
  const emit=(props={},from=sender())=>{
    const event={kind:"fetch-response",host:"127.0.0.1",
      path:"/health",status:200,method:"GET",at:Date.now()+seq++,
      ...props};
    listeners.message({type:"openguin-network-event",event},from);
  };
  return {state,listeners,emit,sender,restart:start,block:()=>{permitted=false;}};
}
test("v19 receipt counters survive background worker restart and stay tab-scoped",async()=>{
  const h=setup();
  h.emit();
  await wait();
  assert.equal(h.state.events.length,1);
  assert.equal(h.state.captureObservedCount,1);
  assert(Number.isInteger(h.state.captureLastEventAt));
  h.restart();
  h.emit({kind:"xhr-response",status:429});
  await wait();
  assert.equal(h.state.captureObservedCount,2);
  assert.equal(h.state.events.length,2);
});
test("v19 rejects unrelated extension sender and subframe messages",async()=>{
  const h=setup();
  h.emit({},h.sender({id:"other-extension"}));
  h.emit({},h.sender({frameId:13}));
  h.emit({},h.sender({tab:{id:99,url:"http://127.0.0.1:19090/"}}));
  await wait();
  assert.equal(h.state.events.length,0);
  assert.equal(h.state.captureObservedCount,0);
  h.emit();
  await wait();
  assert.equal(h.state.events.length,1);
});
test("stopping observation blocks delayed page messages from storage queue",async()=>{
  const h=setup();
  h.emit();
  await wait();
  h.state.monitoring=false;
  h.state.activeTabId=null;
  h.emit();
  await wait();
  assert.equal(h.state.events.length,1);
  assert.equal(h.state.captureObservedCount,1);
});
test("revoke optional loopback permission ends persistent capture",async()=>{
  const h=setup();
  h.block();
  h.listeners.revoked();
  await wait();
  assert.equal(h.state.monitoring,false);
  assert.equal(h.state.activeTabId,null);
  assert.match(h.state.captureStopReason,/permission/i);
  h.emit();
  await wait();
  assert.equal(h.state.events.length,0);
});
test("navigating outside approved hostname ends the session with a reason",async()=>{
  const h=setup();
  await h.listeners.updated(7,{status:"loading"},{url:"https://outside.example/"});
  assert.equal(h.state.monitoring,false);
  assert.match(h.state.captureStopReason,/navigated/i);
});
test("closing monitored tab ends session and does not affect local journal state",async()=>{
  const h=setup({journalEnabled:true,journalEvents:[{at:Date.now(),kind:"monitor-started"}]});
  await h.listeners.removed(7);
  assert.equal(h.state.monitoring,false);
  assert.equal(h.state.captureStopReason,"Monitored tab closed.");
  assert.equal(h.state.journalEnabled,true);
  assert.equal(h.state.journalEvents.length,1);
});
test("capture UI and desktop metadata are explicitly part of diagnostic report",()=>{
  const popup=readFileSync(new URL("../browser-extension/popup.js",import.meta.url),"utf8");
  const html=readFileSync(new URL("../browser-extension/popup.html",import.meta.url),"utf8");
  for(const t of ["captureStartedAt","captureLastEventAt","captureObservedCount",
    "captureStopReason","captureSession"])assert(popup.includes(t),t);
  assert(html.includes('id="captureAudit"'));
  assert(popup.includes("本次会话已接收"));
});
