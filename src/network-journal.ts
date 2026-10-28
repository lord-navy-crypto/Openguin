/**
 * Offline analysis of a user-exported, opt-in Openguin browser journal.
 * This parser is a trust boundary: do not persist, render, or re-export unknown
 * input fields, including any URL paths, cookies, request IDs or page contents.
 */
export type JournalEvent={
  at:number;
  host:string;
  kind:string;
  status:number|null;
  durationMs:number|null;
};
export type BrowserJournal={
  schema:"openguin-browser-journal-v1";
  createdAt:string;
  retentionDays:30;
  capacity:2500;
  recordingEnabled:boolean;
  capacityDropped:number;
  events:JournalEvent[];
};
export type JournalHost={
  host:string;events:number;responseCount:number;
  clientResponses:number;serverResponses:number;transportErrors:number;
  stalls:number;renderErrors:number;downloadErrors:number;
  medianResponseMs:number|null;p95ResponseMs:number|null;
};
export type JournalDay={day:string;total:number;issues:number};
export type JournalReview={
  reportAgeHours:number|null;
  count:number; hostCount:number;
  httpResponses:number;serverResponses:number;clientResponses:number;
  transportErrors:number;stalls:number;renderErrors:number;downloadErrors:number;
  signalCount:number;
  medianResponseMs:number|null;p95ResponseMs:number|null;
  capacityDropped:number;coverageLimited:boolean;
  firstAt:number|null;lastAt:number|null;
  hosts:JournalHost[];days:JournalDay[];
  notes:string[];
};
const kinds=new Set([
  "monitor-active","monitor-started","navigation","render-summary","render-stability",
  "fetch-start","fetch-response","fetch-error","fetch-stall","xhr-start",
  "xhr-response","xhr-error","xhr-stall","stream-gap","stream-gap-resolved",
  "stream-error","stream-end","body-read-complete","body-read-error",
  "resource-error","slow-resource","javascript-error","unhandled-rejection",
  "long-task","download-start","download-progress","download-complete",
  "download-failed","download-stall"
]);
export const JOURNAL_MAX_BYTES=1024*1024;
const RESPONSE=new Set(["fetch-response","xhr-response"]);
const TRANSPORT=new Set(["fetch-error","xhr-error","stream-error","body-read-error"]);
const STALL=new Set(["fetch-stall","xhr-stall","stream-gap","download-stall"]);
const RENDER=new Set(["resource-error","javascript-error","unhandled-rejection","long-task"]);
const DOWNLOAD=new Set(["download-failed","download-stall"]);
const pct=(a:number[],fraction:number):number|null=>{
  if(!a.length)return null;
  const v=[...a].sort((x,y)=>x-y);
  return Math.round(v[Math.max(0,Math.ceil(v.length*fraction)-1)]);
};
const plainObj=(value:unknown):value is Record<string,unknown> =>
  !!value && typeof value==="object" && !Array.isArray(value);
function validHost(host:unknown):host is string{
  return typeof host==="string" && host.length<=120 && host.length>0 &&
    /^[a-z0-9.-]+$/i.test(host) && !host.startsWith(".") && !host.includes("..");
}
function validAt(value:unknown):value is number {
  return typeof value==="number" && Number.isInteger(value) &&
    value>=1_000_000_000_000 && value<=9_000_000_000_000;
}
function validMetric(value:unknown):number|null{
  return typeof value==="number" && Number.isFinite(value) && value>=0 && value<=1e9
    ?value:null;
}
export function parseBrowserJournal(raw:string):BrowserJournal {
  if(raw.length>JOURNAL_MAX_BYTES) throw new Error("日志过大（最大 1 MiB）。");
  let data:unknown;
  try{data=JSON.parse(raw)}catch{throw new Error("日志 JSON 格式错误。")}
  if(!plainObj(data)||data.schema!=="openguin-browser-journal-v1")
    throw new Error("只接受 Openguin Browser Journal v1 格式。");
  if(data.capacity!==2500||data.retentionDays!==30)
    throw new Error("日志容量或保留策略不符合受支持的版本。");
  if(!Array.isArray(data.events)||data.events.length>2500)
    throw new Error("事件列表无效或超出 2500 条限制。");
  if(typeof data.createdAt!=="string" || !Number.isFinite(Date.parse(data.createdAt)))
    throw new Error("日志缺少有效创建日期。");
  const events:JournalEvent[]=[];
  for(const row of data.events){
    if(!plainObj(row) || !validAt(row.at) || !validHost(row.host) ||
      typeof row.kind!=="string" || !kinds.has(row.kind)) continue;
    // Reject future timestamps far beyond the export's declared time. Reject
    // unknown fields by rebuilding the record from this small allowlist.
    const created=Date.parse(data.createdAt);
    if(row.at>created+5*60_000)continue;
    const rawStatus=validMetric(row.status);
    const status=rawStatus!==null && Number.isInteger(rawStatus) && rawStatus<=599 ? rawStatus:null;
    events.push({
      at:row.at, host:row.host.toLowerCase(),kind:row.kind,
      status,durationMs:validMetric(row.durationMs)
    });
  }
  events.sort((a,b)=>a.at-b.at);
  return {
    schema:"openguin-browser-journal-v1",
    createdAt:new Date(data.createdAt).toISOString(),
    retentionDays:30,capacity:2500,
    recordingEnabled:data.recordingEnabled===true,
    capacityDropped:Math.min(1e9,Math.max(0,Math.floor(validMetric(data.capacityDropped)??0))),
    events
  };
}
export type EventSignal="server"|"client"|"transport"|"stall"|"render"|"download"|"other";
export function journalEventSignal(e:JournalEvent):EventSignal{
  if(RESPONSE.has(e.kind) && (e.status??0)>=500)return "server";
  if(RESPONSE.has(e.kind) && (e.status??0)>=400)return "client";
  if(TRANSPORT.has(e.kind))return "transport";
  if(STALL.has(e.kind))return "stall";
  if(RENDER.has(e.kind))return "render";
  if(DOWNLOAD.has(e.kind))return "download";
  return "other";
}
export function reviewBrowserJournal(journal:BrowserJournal,now=Date.now()):JournalReview{
  const events=journal.events;
  type H={h:JournalHost;timings:number[]};
  const map=new Map<string,H>(),daily=new Map<string,JournalDay>();
  const responseTimes:number[]=[];
  let responses=0,server=0,client=0,transport=0,stalls=0,render=0,download=0;
  let signals=0;
  for(const e of events){
    let entity=map.get(e.host);
    if(!entity){
      entity={h:{host:e.host,events:0,responseCount:0,clientResponses:0,serverResponses:0,
        transportErrors:0,stalls:0,renderErrors:0,downloadErrors:0,
        medianResponseMs:null,p95ResponseMs:null},timings:[]};
      map.set(e.host,entity);
    }
    const h=entity.h;
    h.events++;
    const isResponse=RESPONSE.has(e.kind);
    if(isResponse){
      responses++;h.responseCount++;
      if(e.durationMs!==null){responseTimes.push(e.durationMs);entity.timings.push(e.durationMs);}
    }
    const signal=journalEventSignal(e);
    if(signal!=="other")signals++;
    if(signal==="server"){server++;h.serverResponses++;}
    if(signal==="client"){client++;h.clientResponses++;}
    if(signal==="transport"){transport++;h.transportErrors++;}
    if(signal==="stall"){stalls++;h.stalls++;}
    if(signal==="render"){render++;h.renderErrors++;}
    if(signal==="download"){download++;h.downloadErrors++;}
    const day=new Date(e.at).toISOString().slice(0,10);
    let d=daily.get(day);
    if(!d){d={day,total:0,issues:0};daily.set(day,d);}
    d.total++;if(signal!=="other" && signal!=="client")d.issues++;
  }
  const hosts=Array.from(map.values()).map(({h,timings})=>({
    ...h,medianResponseMs:pct(timings,.5),p95ResponseMs:pct(timings,.95)
  })).sort((a,b)=>(b.transportErrors+b.stalls+b.serverResponses+b.downloadErrors)-
    (a.transportErrors+a.stalls+a.serverResponses+a.downloadErrors)||
    b.events-a.events||a.host.localeCompare(b.host));
  return {
    reportAgeHours:Math.max(0,Math.round((now-Date.parse(journal.createdAt))/3600000)),
    count:events.length,hostCount:hosts.length,
    httpResponses:responses,serverResponses:server,clientResponses:client,
    transportErrors:transport,stalls,renderErrors:render,downloadErrors:download,
    signalCount:signals,medianResponseMs:pct(responseTimes,.5),p95ResponseMs:pct(responseTimes,.95),
    capacityDropped:journal.capacityDropped,
    coverageLimited:journal.capacityDropped>0 || events.length>=journal.capacity,
    firstAt:events.length?events[0].at:null,
    lastAt:events.length?events[events.length-1].at:null,
    hosts,days:Array.from(daily.values()).sort((a,b)=>a.day.localeCompare(b.day)),
    notes:[
      "日志只包含已授权的浏览器监测事件，并非全部网络流量或全部浏览历史。",
      "HTTP 401/403/429 是应用层响应，不代表入侵；5xx 也不能单独证明攻击。",
      "事件数不等于唯一请求数；有些请求会产生开始、状态、暂停和完成等多条记录。",
      "容量溢出、过期、监测暂停或未授权标签页都可能造成观测缺口。",
      "域名和时间戳仍可能透露敏感浏览活动，分享前务必复核。"
    ]
  };
}
/** Summary-only export excludes exact event history by default. */
export function exportJournalSummary(review:JournalReview){
  return {
    schema:"openguin-journal-analysis-summary-v1",
    generatedAt:new Date().toISOString(),
    summary:{
      count:review.count,hostCount:review.hostCount,httpResponses:review.httpResponses,
      serverResponses:review.serverResponses,clientResponses:review.clientResponses,
      transportErrors:review.transportErrors,stalls:review.stalls,
      renderErrors:review.renderErrors,downloadErrors:review.downloadErrors,
      medianResponseMs:review.medianResponseMs,p95ResponseMs:review.p95ResponseMs,
      capacityDropped:review.capacityDropped,coverageLimited:review.coverageLimited,
      firstAt:review.firstAt,lastAt:review.lastAt
    },
    hosts:review.hosts,days:review.days,limitations:review.notes,
    privacy:"Summary has domain names and time ranges; no paths, request IDs, bodies, or raw event timeline."
  };
}
