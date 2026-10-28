import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const main=readFileSync(new URL("../browser-extension/monitor-main.js",import.meta.url),"utf8");
const analyzer=readFileSync(new URL("../browser-extension/observability-v18.js",import.meta.url),"utf8");
function browser(){
 const handlers=new Map(),posted=[],observers=[];
 const win={
  fetch(){return Promise.resolve({status:200,body:null})},
  addEventListener(name,fn){const set=handlers.get(name)||new Set();set.add(fn);handlers.set(name,set);},
  removeEventListener(name,fn){handlers.get(name)?.delete(fn);},
  postMessage(msg){posted.push(msg);},
  dispatchEvent(event){for(const listener of [...(handlers.get(event.type)||[])])listener(event);}
 };
 class FakeXHR{open(){}send(){}addEventListener(){}}
 class Observer{
  constructor(callback){this.callback=callback;this.closed=false;observers.push(this);}
  observe(){}
  disconnect(){this.closed=true;}
  fire(items){this.callback({getEntries(){return items;}});}
 }
 const ctx={
  window:win,XMLHttpRequest:FakeXHR,
  location:{href:"https://owned.example/home",origin:"https://owned.example",
    hostname:"owned.example",pathname:"/home"},
  document:{readyState:"complete",body:null},
  performance:{now:()=>3000,getEntriesByType:()=>[]},
  PerformanceObserver:Observer,
  URL,Date,Math,Number,String,Object,Promise,Set,Array,
  setTimeout(){return 1;},clearTimeout(){}
 };
 return {win,FakeXHR,handlers,posted,observers,ctx,
  start(){runInNewContext(main,ctx);},
  stop(){win.dispatchEvent({type:"message",source:win,
    data:{source:"openguin-netwatch-control",action:"stop"}});},
  events(){return posted.map(p=>p.event).filter(Boolean);}
 };
}
test("v21 Stop removes global error, rejection and control event listeners",()=>{
 const b=browser();
 const origFetch=b.win.fetch,origXhrOpen=b.FakeXHR.prototype.open,origXhrSend=b.FakeXHR.prototype.send;
 for(let i=0;i<8;i++){
  b.start();
  assert.equal(b.handlers.get("error").size,1);
  assert.equal(b.handlers.get("unhandledrejection").size,1);
  assert.equal(b.handlers.get("message").size,1);
  assert.notEqual(b.win.fetch,origFetch);
  b.stop();
  assert.equal(b.handlers.get("error").size,0);
  assert.equal(b.handlers.get("unhandledrejection").size,0);
  assert.equal(b.handlers.get("message").size,0);
  assert.equal(b.win.fetch,origFetch);
  assert.equal(b.FakeXHR.prototype.open,origXhrOpen);
  assert.equal(b.FakeXHR.prototype.send,origXhrSend);
 }
 assert(b.observers.every(o=>o.closed));
});
test("v21 duplicate injection while active never adds another window listener",()=>{
 const b=browser();b.start();b.start();
 assert.equal(b.handlers.get("error").size,1);
 assert.equal(b.handlers.get("unhandledrejection").size,1);
 assert.equal(b.handlers.get("message").size,1);
 b.stop();
});
test("v21 only flags one opaque cross-origin performance entry without leaking its URL",()=>{
 const b=browser();b.start();
 const resource=b.observers[0];
 const opaque={name:"https://other.example/secret?token=hidden",
   duration:1920,responseStatus:0,initiatorType:"fetch",
   transferSize:0,encodedBodySize:0};
 resource.fire([opaque,opaque,opaque]);
 const events=b.events();
 const limited=events.filter(e=>e.kind==="resource-timing-limited");
 assert.equal(limited.length,1);
 assert.equal(limited[0].host,"owned.example");
 assert.equal(limited[0].path,"/");
 assert.equal(limited[0].tag,"cross-origin");
 assert(!JSON.stringify(events).includes("secret"));
 assert(!JSON.stringify(events).includes("token=hidden"));
 b.stop();
});
test("v21 does not treat same-origin HTTP 0 or known cross-origin status as visibility-limited",()=>{
 const b=browser();b.start();
 const resource=b.observers[0];
 resource.fire([{name:"https://owned.example/data",duration:150,responseStatus:0}]);
 resource.fire([{name:"https://other.example/data",duration:250,responseStatus:200}]);
 assert.equal(b.events().filter(e=>e.kind==="resource-timing-limited").length,0);
 b.stop();
});
test("v21 observable dashboard warns about restricted cross-origin metadata without claiming a network failure",()=>{
 const ctx={};
 runInNewContext(analyzer,ctx);
 const now=Date.now();
 const result=ctx.OpenguinObservability.summarize({
  events:[{kind:"resource-timing-limited",at:now,host:"owned.example",path:"/"},
   {kind:"fetch-response",at:now+1,status:200,durationMs:8}]
 },{now:now+10});
 assert.equal(result.symptoms.resourceTimingLimited,1);
 assert.equal(result.symptoms.transportErrors,0);
 assert.equal(result.symptoms.serverErrors,0);
 assert(result.capture.notices.some(s=>s.includes("跨源")));
});
