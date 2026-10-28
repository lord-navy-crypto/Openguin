/**
 * Correlates two *explicitly imported* defensive evidence sources.
 * It does not imply a common request, a malicious visitor, or an attack.
 * Browser-domain scope is always explicit because a server log has no hostname.
 */
import type {BrowserJournal} from "./network-journal";
import {journalEventSignal} from "./network-journal";
import type {AccessAudit} from "./server-access-log";
export type MinuteEvidence={
  minute:number;
  browserEvents:number;
  browserHttp5xx:number;
  browserTransportErrors:number;
  browserStalls:number;
  serverRequests:number;
  serverHttp5xx:number;
  serverHttp429:number;
  browserIssue:boolean;
  serverIssue:boolean;
  overlap:boolean;
};
export type DailyEvidence={
  day:string;
  browserEvents:number;
  browserIssues:number;
  serverRequests:number;
  serverIssues:number;
  coObservedMinutes:number;
};
export type EvidenceCorrelation={
  selectedHost:string;
  sourceBrowserEvents:number;
  sourceServerRequests:number;
  totalMinutes:number;
  jointlyObservedMinutes:number;
  bothIssueMinutes:number;
  browserOnlyIssueMinutes:number;
  serverOnlyIssueMinutes:number;
  browserIssueMinutes:number;
  serverIssueMinutes:number;
  firstMinute:number|null;
  lastMinute:number|null;
  days:DailyEvidence[];
  minutes:MinuteEvidence[];
  caveats:string[];
};
export const minuteBucket=(at:number)=>Math.floor(at/60000)*60000;
export function correlateSiteEvidence(
  browser:BrowserJournal,
  server:AccessAudit,
  selectedHost:string
):EvidenceCorrelation{
  const host=selectedHost.trim().toLowerCase();
  if(!host || !browser.events.some(e=>e.host===host)){
    throw new Error("必须先选择浏览器日志中实际存在的网站域名。");
  }
  if(server.schema!=="openguin-offline-access-log-review-v1")
    throw new Error("服务器日志摘要格式不支持关联。");
  const map=new Map<number,MinuteEvidence>();
  function get(minute:number):MinuteEvidence {
    let row=map.get(minute);
    if(!row){
      row={minute,browserEvents:0,browserHttp5xx:0,browserTransportErrors:0,
        browserStalls:0,serverRequests:0,serverHttp5xx:0,serverHttp429:0,
        browserIssue:false,serverIssue:false,overlap:false};
      map.set(minute,row);
    }
    return row;
  }
  for(const e of browser.events){
    if(e.host!==host)continue;
    const row=get(minuteBucket(e.at));
    row.browserEvents++;
    if((e.kind==="xhr-response"||e.kind==="fetch-response") && e.status!==null&&e.status>=500)row.browserHttp5xx++;
    const s=journalEventSignal(e);
    if(s==="transport")row.browserTransportErrors++;
    if(s==="stall")row.browserStalls++;
  }
  for(const b of server.buckets){
    if(!Number.isSafeInteger(b.minute)||b.minute<0||
      !Number.isSafeInteger(b.requests)||b.requests<0)continue;
    const row=get(minuteBucket(b.minute));
    row.serverRequests+=b.requests;
    row.serverHttp5xx+=Math.max(0,b.http5xx);
    row.serverHttp429+=Math.max(0,b.http429);
  }
  const minutes=[...map.values()].sort((a,b)=>a.minute-b.minute);
  let bothIssue=0,clientOnly=0,serverOnly=0,browserIssues=0,serverIssues=0,joint=0;
  const daysMap=new Map<string,DailyEvidence>();
  for(const row of minutes){
    row.browserIssue=row.browserHttp5xx>0||row.browserTransportErrors>0||row.browserStalls>0;
    row.serverIssue=row.serverHttp5xx>0||row.serverHttp429>0;
    row.overlap=row.browserEvents>0&&row.serverRequests>0;
    if(row.overlap)joint++;
    if(row.browserIssue)browserIssues++;
    if(row.serverIssue)serverIssues++;
    if(row.browserIssue&&row.serverIssue)bothIssue++;
    else if(row.browserIssue)clientOnly++;
    else if(row.serverIssue)serverOnly++;
    const day=new Date(row.minute).toISOString().slice(0,10);
    let d=daysMap.get(day);
    if(!d){d={day,browserEvents:0,browserIssues:0,serverRequests:0,serverIssues:0,coObservedMinutes:0};daysMap.set(day,d);}
    d.browserEvents+=row.browserEvents;
    d.browserIssues+=Number(row.browserIssue);
    d.serverRequests+=row.serverRequests;
    d.serverIssues+=Number(row.serverIssue);
    d.coObservedMinutes+=Number(row.overlap);
  }
  return {
    selectedHost:host,
    sourceBrowserEvents:minutes.reduce((sum,x)=>sum+x.browserEvents,0),
    sourceServerRequests:server.parsedLines,
    totalMinutes:minutes.length,
    jointlyObservedMinutes:joint,
    bothIssueMinutes:bothIssue,browserOnlyIssueMinutes:clientOnly,
    serverOnlyIssueMinutes:serverOnly,
    browserIssueMinutes:browserIssues,serverIssueMinutes:serverIssues,
    firstMinute:minutes.length?minutes[0].minute:null,
    lastMinute:minutes.length?minutes[minutes.length-1].minute:null,
    days:[...daysMap.values()].sort((a,b)=>a.day.localeCompare(b.day)),
    minutes,
    caveats:[
      "只根据时间窗口关联，不能证明浏览器和服务器记录属于同一请求，也不能证明攻击。",
      "服务器访问日志没有可靠的站点域名字段；对应关系由用户明确选择并确认。",
      "浏览器记录可能包含第三方资源；此报告只统计所选域名的记录。",
      "日志采样范围、时区、服务器时钟偏差、缓存/CDN、缺失记录都会影响对应关系。",
      "4xx、429、5xx 或短暂请求量增加可能由正常操作导致，不代表入侵或恶意流量。",
      "报告不包含访客 IP、路径、原始请求、浏览器请求 ID、Cookie 或页面内容。"
    ]
  };
}
export function exportCorrelationSummary(review:EvidenceCorrelation){
  const {minutes,...summary}=review;
  return {
    schema:"openguin-offline-evidence-correlation-v1",
    generatedAt:new Date().toISOString(),
    ...summary,
    privacy:{rawBrowserEvents:false,rawServerEntries:false,minuteTimelineExported:false,
      containsSiteHost:true,containsUtcDates:true},
  };
}
