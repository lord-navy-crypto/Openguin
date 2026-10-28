import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const background=readFileSync(new URL("../browser-extension/background.js",import.meta.url),"utf8");
const monitor=readFileSync(new URL("../browser-extension/monitor-main.js",import.meta.url),"utf8");
const popup=readFileSync(new URL("../browser-extension/popup.js",import.meta.url),"utf8");
const delay=()=>new Promise(resolve=>setTimeout(resolve,35));

function harness(initial={}){
 const state={monitoring:true,activeTabId:9,activeHost:"localhost",
   monitorMode:"active-tab",captureGeneration:1,captureObservedCount:0,
   events:[],...initial};
 let message;
 let gate=null,notifyGate=null;
 const listeners={};
 const hook=name=>({addListener(fn){listeners[name]=fn;}});
 const chrome={
  runtime:{id:"own-ext",onMessage:{addListener(fn){message=fn;}}},
  storage:{
    local:{
      async get(defaults={}){
        if(Object.hasOwn(defaults,"events")&&gate){
          notifyGate?.();
          await gate;
        }
        return {...defaults,...state};
      },
      async set(values){Object.assign(state,values);}
    },
    session:{async get(defaults={}){return defaults;},async set(){},async remove(){}}
  },
  permissions:{async contains(){return false;},onAdded:hook("padd"),onRemoved:hook("prem")},
  tabs:{onUpdated:hook("updated"),onRemoved:hook("removed")},
  scripting:{async executeScript(){}}
 };
 runInNewContext(background,{chrome,URL,Date,Math,Set,Map,Number,String,Object,Promise,JSON,Array});
 const sender={id:"own-ext",frameId:0,tab:{id:9,url:"http://localhost:19090/workbench"},
  url:"http://localhost:19090/workbench"};
 function send(sourceAt=Date.now()){
  message({type:"openguin-network-event",event:{
   kind:"fetch-response",host:"localhost",method:"GET",path:"/health",
   status:200,durationMs:8,requestId:"rtest-1",at:sourceAt
  }},sender);
 }
 function holdWrites(){
   let release;gate=new Promise(resolve=>{release=resolve});
   const arrived=new Promise(resolve=>{notifyGate=resolve});
   return {arrived,release(){release();gate=null;}};
 }
 return {state,send,holdWrites};
}
test("v20 queued event from old generation never enters newly started session",async()=>{
 const h=harness();
 const paused=h.holdWrites();
 h.send();
 await paused.arrived;
 h.state.captureGeneration=2;
 h.state.captureObservedCount=0;
 paused.release();
 await delay();
 assert.equal(h.state.events.length,0);
 assert.equal(h.state.captureObservedCount,0);
 h.send();
 await delay();
 assert.equal(h.state.events.length,1);
 assert.equal(h.state.captureObservedCount,1);
});
test("v20 duplicate suppression is separate across monitoring generations",async()=>{
 const h=harness();
 const sourceAt=Date.now();
 h.send(sourceAt);
 await delay();
 h.send(sourceAt);
 await delay();
 assert.equal(h.state.events.length,1);
 assert.equal(h.state.duplicateEventsSuppressed,1);
 h.state.captureGeneration=2;h.state.captureObservedCount=0;
 h.send(sourceAt);
 await delay();
 assert.equal(h.state.events.length,2);
 assert.equal(h.state.captureObservedCount,1);
});
test("v20 stop prevents queued records even if generation remains the same",async()=>{
 const h=harness();
 const paused=h.holdWrites();h.send();await paused.arrived;
 h.state.monitoring=false;
 paused.release();
 await delay();
 assert.equal(h.state.events.length,0);
});
test("v20 MAIN world stop restores browser functions synchronously",()=>{
 const listeners={};
 const fakeWindow={
  fetch(){return Promise.resolve({status:200,body:null})},
  addEventListener(kind,fn){(listeners[kind]||=[]).push(fn)},
  dispatchEvent(e){for(const fn of listeners[e.type]||[])fn(e)}
 };
 class FakeXHR{
  open(){}send(){}addEventListener(){}
 }
 const originalFetch=fakeWindow.fetch, originalOpen=FakeXHR.prototype.open,
   originalSend=FakeXHR.prototype.send;
 const env={
   window:fakeWindow,XMLHttpRequest:FakeXHR,
   location:{href:"http://localhost:19090/workbench",hostname:"localhost",pathname:"/workbench"},
   document:{readyState:"complete",body:null},
   performance:{now:()=>10,getEntriesByType:()=>[]},
   PerformanceObserver:class{observe(){throw Error("off")}},
   Date,Math,Number,String,Object,Promise,URL,Array,
   setTimeout:()=>1,clearTimeout:()=>{}
 };
 runInNewContext(monitor,env);
 assert.notEqual(fakeWindow.fetch,originalFetch);
 assert.notEqual(FakeXHR.prototype.open,originalOpen);
 assert.notEqual(FakeXHR.prototype.send,originalSend);
 const fakeMessage={type:"message",source:fakeWindow,
   data:{source:"openguin-netwatch-control",action:"stop"}};
 fakeWindow.dispatchEvent(fakeMessage);
 assert.equal(fakeWindow.fetch,originalFetch);
 assert.equal(FakeXHR.prototype.open,originalOpen);
 assert.equal(FakeXHR.prototype.send,originalSend);
 assert.equal(fakeWindow.__openguinNetWatchState.active,false);
 assert(popup.includes('window.dispatchEvent(new MessageEvent("message"'));
 assert(popup.includes("captureGeneration:generation"));
});
