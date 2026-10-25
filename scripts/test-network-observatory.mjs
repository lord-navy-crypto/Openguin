// Local deterministic smoke tests for the extension event pipeline and report parser.
// No external network access, browser profile, or real download is required.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";

const reportSource = fs.readFileSync("src/browser-diagnostics.ts","utf8");
const transpiled = transformSync(reportSource,{
  loader:"ts",format:"cjs",target:"es2022"
}).code;
const exported = {};
vm.runInNewContext(transpiled,{exports:exported,Date,Map,Set,JSON,Error});
const {parseBrowserReport,analyzeBrowserReport} = exported;

const epoch = 1792900000000;
const sample = {
  source:"openguin-network-watch",formatVersion:1,generatedAt:new Date(epoch).toISOString(),
  events:[
    {at:epoch,host:"chatgpt.com",kind:"fetch-stall",durationMs:15000},
    {at:epoch+1000,host:"chatgpt.com",kind:"fetch-response",status:403},
    {at:epoch+2000,host:"chatgpt.com",kind:"stream-gap",gapMs:15000},
    {at:epoch+3000,host:"example.com",kind:"download-failed",errorType:"NETWORK_TIMEOUT"},
    {at:epoch+4000,host:"evil.example",kind:"unexpected",sensitive:"should not survive"}
  ]
};
const report=parseBrowserReport(JSON.stringify(sample));
assert.equal(report.events.length,4,"Unrecognized event kinds must not be imported");
assert.deepEqual(Array.from(analyzeBrowserReport(report),x=>x.id).slice(0,2),["downloads","no-headers"]);
assert.equal(JSON.stringify(report).includes("sensitive"),false);
assert.throws(()=>parseBrowserReport('{"source":"unknown"}'));
assert.throws(()=>parseBrowserReport("x".repeat(300001)));
assert.throws(()=>parseBrowserReport(JSON.stringify({...sample,events:new Array(301).fill(sample.events[0])})));

let currentTime=epoch;
const Clock = class extends Date { static now(){return currentTime} };
const handlers={};
function hook(name){return {addListener(fn){handlers[name]=fn}}}
const data={local:{},session:{}};
function storageBucket(name){
 return {
  async get(defaults={}){return {...defaults,...data[name]}},
  async set(values){Object.assign(data[name],values)},
  async remove(key){delete data[name][key]}
 };
}
const download={
  id:7,url:"https://downloads.example.com/archive?private=token",
  filename:"/Users/secret/private.txt",totalBytes:1000,bytesReceived:0,
  paused:false,incognito:false,state:"in_progress"
};
const chrome={
  storage:{local:storageBucket("local"),session:storageBucket("session")},
  runtime:{onMessage:hook("message")},
  tabs:{onUpdated:hook("tabUpdated"),onRemoved:hook("tabRemoved")},
  scripting:{executeScript:async()=>{}},
  permissions:{
    contains:async()=>true,onAdded:hook("permAdded"),onRemoved:hook("permRemoved")
  },
  alarms:{
    onAlarm:hook("alarm"),create:()=>{},clear:()=>{}
  },
  downloads:{
    onCreated:hook("created"),onChanged:hook("changed"),
    search:async()=>[download]
  }
};
vm.runInNewContext(fs.readFileSync("browser-extension/background.js","utf8"),{
  chrome,Date:Clock,URL,Math,Number,String,Promise,Set,Map,Object,RegExp,Array
});
const flush=()=>new Promise(resolve=>setTimeout(resolve,10));
handlers.created(download);
await flush();
assert.equal(data.local.events[0].kind,"download-start");
currentTime+=30000;
download.bytesReceived=350;
handlers.alarm({name:"openguin-download-stall-watch"});
await flush();
assert(data.local.events.some(e=>e.kind==="download-progress"),"Alarm sampling should capture byte changes");
currentTime+=65000;
handlers.alarm({name:"openguin-download-stall-watch"});
await flush();
assert(data.local.events.some(e=>e.kind==="download-stall"),"No-progress alarm should record a stall");
currentTime+=200;
handlers.changed({id:7,state:{current:"interrupted"},error:{current:"NETWORK_TIMEOUT"}});
await flush();
assert.equal(data.local.events[0].kind,"download-failed");
assert.equal(data.local.events[0].errorType,"NETWORK_TIMEOUT");
const stored=JSON.stringify(data.local.events);
assert(!stored.includes("private.txt")&&!stored.includes("token"),"Secrets from URLs and filenames must not enter telemetry");

const countBefore=data.local.events.length;
handlers.message({type:"openguin-network-event",event:{kind:"fetch-stall",host:"chatgpt.com"}},{
  tab:{id:23,url:"https://chatgpt.com/"},url:"https://chatgpt.com/"
});
await flush();
assert.equal(data.local.events.length,countBefore,"Inactive tab events must be rejected");
data.local.monitoring=true;data.local.activeTabId=23;data.local.activeHost="chatgpt.com";
handlers.message({type:"openguin-network-event",event:{kind:"fetch-stall",host:"chatgpt.com",durationMs:15000}},{
  tab:{id:23,url:"https://chatgpt.com/"},url:"https://chatgpt.com/"
});
await flush();
assert.equal(data.local.events.length,countBefore+1,"Authorized events should be stored");
console.log("Network Observatory: report parser, download progress/stall, redaction and active-tab checks passed.");
