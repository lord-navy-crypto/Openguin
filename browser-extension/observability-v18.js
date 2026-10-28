/* OpenPenguin Network Watch v18 — privacy-preserving read-only observation.
 * Interprets *already captured* bounded event metadata. No new listeners,
 * permissions, network activity, page contents or background monitoring.
 */
(()=>{
"use strict";
const RESPONSE=new Set(["fetch-response","xhr-response"]);
const START=new Set(["fetch-start","xhr-start"]);
const TERMINAL=new Set(["fetch-response","xhr-response","fetch-error","xhr-error"]);
const STALL=new Set(["fetch-stall","xhr-stall","stream-gap","download-stall"]);
const MAX_EVENTS=300;
function validEvent(e){
  return e&&typeof e==="object"&&typeof e.kind==="string"&&
    Number.isFinite(e.at)&&e.at>=1_000_000_000_000&&e.at<=9_000_000_000_000;
}
function duration(e){
  return Number.isFinite(e.durationMs)&&e.durationMs>=0&&e.durationMs<=60000?
    Math.round(e.durationMs):null;
}
function pctl(xs,p){
  if(!xs.length)return null;
  const a=[...xs].sort((x,y)=>x-y);
  return a[Math.max(0,Math.ceil(a.length*p)-1)];
}
function summarize(raw,options={}){
  const now=Number.isFinite(options.now)?options.now:Date.now();
  const tabOnly=Number.isInteger(options.tabId)?options.tabId:null;
  const events=(Array.isArray(raw?.events)?raw.events:[]).slice(0,MAX_EVENTS)
    .filter(e=>validEvent(e)&&(tabOnly===null||e.tabId===tabOnly));
  const counts={"2xx":0,"3xx":0,"4xx":0,"5xx":0};
  let unauthorized=0,forbidden=0,throttled=0,transportErrors=0,stalls=0,
    scriptErrors=0,slowResponses=0,resourceTimingLimited=0;
  const times=[];
  const starts=new Map();
  const completed=new Set();
  for(const e of events){
    const kind=e.kind;
    if(RESPONSE.has(kind)){
      const status=Number(e.status);
      if(Number.isInteger(status)&&status>=200&&status<=599){
        counts[Math.floor(status/100)+"xx"]++;
        if(status===401)unauthorized++;
        if(status===403)forbidden++;
        if(status===429)throttled++;
      }
      const ms=duration(e);
      if(ms!==null){times.push(ms);if(ms>=3000)slowResponses++;}
    }
    if(kind==="resource-timing-limited")resourceTimingLimited++;
    if(kind==="fetch-error"||kind==="xhr-error")transportErrors++;
    if(STALL.has(kind))stalls++;
    if(kind==="javascript-error"||kind==="unhandled-rejection")scriptErrors++;
    if(typeof e.requestId==="string"&&/^[a-z0-9_-]{1,64}$/i.test(e.requestId)){
      const id=e.requestId;
      if(START.has(kind))starts.set(id,e.at);
      if(TERMINAL.has(kind))completed.add(id);
    }
  }
  let unfinished=0,youngInFlight=0;
  for(const [id,at] of starts){
    if(completed.has(id))continue;
    if(now-at>=15000)unfinished++;else youngInFlight++;
  }
  const dropped=Math.max(0,Math.min(1e9,Math.floor(Number(raw?.quality?.droppedEvents)||0)));
  const duplicate=Math.max(0,Math.min(1e9,Math.floor(Number(raw?.quality?.duplicateEventsSuppressed)||0)));
  const limit=(raw?.quality?.eventCapReached===true)||dropped>0||events.length>=MAX_EVENTS;
  const measuredTimes=times.length;
  const symptoms={
    authenticationDenials:unauthorized+forbidden,
    unauthorized,forbidden,throttled,serverErrors:counts["5xx"],
    transportErrors,stalls,scriptErrors,slowResponses,resourceTimingLimited,unfinished,youngInFlight
  };
  const issues=[];
  if(limit)issues.push("事件缓存可能截断，统计只覆盖保留下来的事件");
  if(unfinished)issues.push("存在超过15秒仍未见终态的请求：也可能因为停止采集、跳转或缓存截断");
  if(!measuredTimes)issues.push("没有可用的 Fetch/XHR 响应计时");
  if(resourceTimingLimited)issues.push("部分跨源资源的 Performance Timing 字段被浏览器限制；这不是 HTTP 失败");
  if(!events.length)issues.push("尚无手动启用监测后记录的事件");
  return {
    schema:"openguin-observability-summary-v18",
    evidenceOnly:true,source:"bounded-browser-events",
    scope:tabOnly===null?"all-manually-recorded-events":"selected-active-tab",
    eventCount:events.length,responseCount:Object.values(counts).reduce((a,b)=>a+b,0),
    statusFamilies:counts,symptoms,
    medianResponseMs:pctl(times,0.5),
    p95ResponseMs:measuredTimes>=3?pctl(times,0.95):null,
    timingSamples:measuredTimes,
    capture:{droppedEvents:dropped,duplicateEventsSuppressed:duplicate,
      possibleTruncation:limit,notices:issues},
    limits:"Source events are page instrumentation, not independently authenticated packets. "+
      "A 401/403/429 or 5xx does not prove an intrusion or network outage. "+
      "Reload/permissions/page navigation can cause incomplete capture."
  };
}
const api=Object.freeze({summarize});
Object.defineProperty(globalThis,"OpenguinObservability",{
  value:api,writable:false,configurable:false
});
})();