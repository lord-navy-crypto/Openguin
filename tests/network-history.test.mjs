import test from "node:test";
import assert from "node:assert/strict";
import {
  historyFromReport,sanitizeHistory,appendNetworkHistory,analyzeNetworkHistory
} from "../.network-test/network-history.mjs";

const base=Date.parse("2026-10-25T10:00:00Z");
const mins=(n)=>new Date(base+n*60_000).toISOString();
function report(at,hostOutcome="ok",vpnSignal=false,extraTargets=[]){
  return {
    at,verdict:hostOutcome==="ok"?"no-clear-problem":"connection-problem",
    checked:{dns:4,dnsPassed:3,https:3,httpsResponded:2,httpFailures:0,speedAttempted:true},
    context:{vpnInterfaceSignal:vpnSignal,proxySignal:false},notes:["Don't persist this secret free text"],
    issues:[{title:"do not persist",evidence:"private",action:"not persisted"}],
    targets:[
      {host:"chatgpt.com",label:"ChatGPT",dns:"ok",https:"responded",
       status:200,elapsedMs:50,symptom:hostOutcome},
      {host:"github.com",label:"GitHub",dns:"ok",https:"responded",
       status:200,elapsedMs:50,symptom:"ok"},
      ...extraTargets
    ]
  };
}
test("history persists summary only; no errors, notes, URLs, or browser page text",()=>{
  const sample=report(mins(0),"transport");
  const entry=historyFromReport(sample);
  const serialized=JSON.stringify(entry);
  assert(!serialized.includes("private")&&!serialized.includes("do not persist"));
  assert.deepEqual(entry.targets.map(t=>t.host),["chatgpt.com","github.com"]);
  assert.equal(entry.targets[0].outcome,"transport");
});
test("a recovered domain is recognized from three same-window manual scans",()=>{
  let entries=[];
  for(const [minute,outcome] of [[0,"transport"],[2,"transport"],[4,"ok"]]){
    entries=appendNetworkHistory(entries,report(mins(minute),outcome),base+5*60_000);
  }
  const result=analyzeNetworkHistory(entries,base+5*60_000);
  assert.equal(result.eligible,3);
  assert.equal(result.trends.find(t=>t.host==="chatgpt.com").state,"recovered");
  assert.equal(result.trends.find(t=>t.host==="github.com").state,"healthy");
});
test("nonterminal alternation is labelled intermittent, not permanent failure",()=>{
  const entries=[
    historyFromReport(report(mins(4),"transport")),
    historyFromReport(report(mins(2),"ok")),
    historyFromReport(report(mins(0),"transport"))
  ];
  const result=analyzeNetworkHistory(entries,base+5*60_000);
  assert.equal(result.trends.find(t=>t.host==="chatgpt.com").state,"intermittent");
});
test("repeated failures are labelled persistent only within a comparable window",()=>{
  const entries=[0,5,9].map(m=>historyFromReport(report(mins(m),"dns")));
  const result=analyzeNetworkHistory(entries,base+10*60_000);
  assert.equal(result.trends.find(t=>t.host==="chatgpt.com").state,"persistent");
  assert.equal(result.trends.find(t=>t.host==="chatgpt.com").failed,3);
});
test("a change in VPN interface signals prevents unfair cross-state inference",()=>{
  const entries=[
    historyFromReport(report(mins(4),"transport",true)),
    historyFromReport(report(mins(2),"ok",false)),
    historyFromReport(report(mins(0),"transport",false))
  ];
  const r=analyzeNetworkHistory(entries,base+5*60_000);
  assert.equal(r.eligible,1);
  assert.equal(r.trends.length,0);
});
test("older scans cannot falsely prove current instability",()=>{
  const entries=[
    historyFromReport(report(mins(40),"transport")),
    historyFromReport(report(mins(2),"ok")),
    historyFromReport(report(mins(0),"transport"))
  ];
  const r=analyzeNetworkHistory(entries,base+41*60_000);
  assert.equal(r.eligible,1);
  assert.equal(r.trends.length,0);
});
test("local record hygiene drops unknown domains, stale entries and private keys",()=>{
  const old=historyFromReport(report(mins(-1500),"ok"));
  const current=historyFromReport(report(mins(0),"ok",false,[
    {host:"secret.invalid",label:"secret",dns:"ok",https:"responded",status:200,symptom:"ok"}
  ]));
  const data=sanitizeHistory([{...current,cookie:"SECRET",targets:[
    ...current.targets,{host:"other.example",outcome:"ok"}
  ]},old],base+60_000);
  assert.equal(data.length,1);
  assert(!JSON.stringify(data).includes("SECRET"));
  assert.equal(data[0].targets.length,2);
});
test("storage limits snapshots to twelve and rejects malformed records",()=>{
  const entries=new Array(15).fill(0).map((_,i)=>historyFromReport(report(mins(i),"ok")));
  const result=sanitizeHistory([{},...entries],base+20*60_000);
  assert.equal(result.length,12);
  assert.equal(result[0].at,mins(14));
  assert.deepEqual(sanitizeHistory({something:"else"},base),[]);
});
