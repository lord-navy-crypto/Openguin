import type { OneClickResult, TargetResult } from "./network-one-click";

/**
 * Small and local-only history: no requests, URLs, browser content, errors,
 * interface names, secrets or diagnostic free text are persisted.
 */
export type NetworkHistoryTarget = {
  host:string;
  outcome:"ok"|"dns"|"transport"|"rejection"|"server"|"untested";
};
export type NetworkHistoryEntry = {
  at:string;
  verdict:OneClickResult["verdict"];
  dnsPassed:number;dnsTotal:number;httpsResponded:number;httpsTotal:number;
  vpnSignal:boolean;proxySignal:boolean;
  targets:NetworkHistoryTarget[];
};
export type TargetTrend = {
  host:string;count:number;passed:number;failed:number;
  state:"intermittent"|"persistent"|"recovered"|"new-issue"|"healthy";
  caption:string;details:string;
};
export type NetworkHistoryAnalysis = {
  samples:number;windowMinutes:number;eligible:number;
  trendCount:number;trends:TargetTrend[];
  note:string;
};
const MAX_RECORDS=12;
const WINDOW_MS=30*60*1000;
const MAX_AGE_MS=24*60*60*1000;
const HOSTS=new Set(["chatgpt.com","auth.openai.com","github.com","speed.cloudflare.com"]);
const VERDICTS=new Set(["network-failure","connection-problem","service-response","slow-or-unstable","no-clear-problem","incomplete"]);
const OUTCOMES=new Set(["ok","dns","transport","rejection","server","untested"]);
const isObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const int=(v:unknown):number=>typeof v==="number"&&Number.isFinite(v)?Math.max(0,Math.min(100,Math.floor(v))):0;
const reportOutcome=(target:TargetResult):NetworkHistoryTarget["outcome"]=>{
  if(target.symptom==="dns"||target.symptom==="transport"||target.symptom==="rejection"||target.symptom==="server") return target.symptom;
  if(target.symptom==="ok") return "ok";
  return "untested";
};
export function historyFromReport(r:OneClickResult):NetworkHistoryEntry {
  return {
    at:r.at,verdict:r.verdict,
    dnsPassed:int(r.checked.dnsPassed),dnsTotal:int(r.checked.dns),
    httpsResponded:int(r.checked.httpsResponded),httpsTotal:int(r.checked.https),
    vpnSignal:!!r.context.vpnInterfaceSignal,proxySignal:!!r.context.proxySignal,
    targets:r.targets.slice(0,8)
      .filter(t=>HOSTS.has(t.host))
      .map(t=>({host:t.host,outcome:reportOutcome(t)}))
  };
}
export function sanitizeHistory(raw:unknown,now=Date.now()):NetworkHistoryEntry[] {
  if(!Array.isArray(raw)) return [];
  return raw.slice(0,MAX_RECORDS*3).flatMap((item):NetworkHistoryEntry[]=>{
    if(!isObj(item)||typeof item.at!=="string")return [];
    const at=Date.parse(item.at);
    if(!Number.isFinite(at)||at>now+60_000||now-at>MAX_AGE_MS) return [];
    if(typeof item.verdict!=="string"||!VERDICTS.has(item.verdict))return [];
    if(!Array.isArray(item.targets))return [];
    const targets:NetworkHistoryTarget[]=item.targets.slice(0,10).flatMap(t=>{
      if(!isObj(t)||typeof t.host!=="string"||!HOSTS.has(t.host)
        ||typeof t.outcome!=="string"||!OUTCOMES.has(t.outcome))return [];
      return [{host:t.host,outcome:t.outcome as NetworkHistoryTarget["outcome"]}];
    });
    return [{
      at:new Date(at).toISOString(),verdict:item.verdict as NetworkHistoryEntry["verdict"],
      dnsPassed:int(item.dnsPassed),dnsTotal:int(item.dnsTotal),
      httpsResponded:int(item.httpsResponded),httpsTotal:int(item.httpsTotal),
      vpnSignal:item.vpnSignal===true,proxySignal:item.proxySignal===true,targets
    }];
  }).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,MAX_RECORDS);
}
export function appendNetworkHistory(raw:unknown,report:OneClickResult,now=Date.now()):NetworkHistoryEntry[] {
  const entry=historyFromReport(report);
  // Keep a summary only; never persist a full test or browser report.
  return sanitizeHistory([entry,...sanitizeHistory(raw,now)],now);
}
export function analyzeNetworkHistory(raw:unknown,now=Date.now()):NetworkHistoryAnalysis {
  const entries=sanitizeHistory(raw,now);
  const candidate=entries.filter(e=>now-Date.parse(e.at)<=WINDOW_MS && e.targets.some(t=>t.outcome!=="untested"));
  // Do not compare across different proxy and VPN-like interface signals.
  // Such signals aren't proof of a tunnel, but changes make the baseline unfair.
  const current=candidate[0];
  const comparable=current?candidate.filter(e=>
    e.vpnSignal===current.vpnSignal&&e.proxySignal===current.proxySignal):[];
  const hosts=[...new Set(comparable.flatMap(e=>e.targets.map(t=>t.host)))];
  const trends:TargetTrend[]=[];
  for(const host of hosts) {
    const observations=comparable.flatMap(e=>{
      const target=e.targets.find(t=>t.host===host);
      return target&&target.outcome!=="untested"?[{outcome:target.outcome,at:e.at}]:[];
    });
    if(observations.length<3)continue;
    const passed=observations.filter(e=>e.outcome==="ok").length;
    const failed=observations.length-passed;
    let state:TargetTrend["state"]="healthy",caption="连续采样正常";
    if(passed===0) {state="persistent";caption="连续采样异常";}
    else if(failed>0){
      if(observations[0].outcome==="ok") {state="recovered";caption="近期恢复线索";}
      else if(observations.slice(1).every(e=>e.outcome==="ok")) {state="new-issue";caption="最新一次异常";}
      else {state="intermittent";caption="间歇性异常";}
    }
    const kinds=[...new Set(observations.filter(e=>e.outcome!=="ok").map(e=>e.outcome))].join("、");
    trends.push({
      host,count:observations.length,passed,failed,state,caption,
      details:state==="healthy"?"当前测试窗口内没有采样异常，不代表后续一定正常。":
        state==="persistent"?"多次采样同类目标仍未达到正常状态。异常类型："+kinds+"。":
        "30 分钟内结果有变化（异常："+kinds+"）；只能说明采样波动，不保证根因已经定位。"
    });
  }
  const rank={persistent:4,intermittent:3,"new-issue":2,recovered:1,healthy:0};
  trends.sort((a,b)=>rank[b.state]-rank[a.state]||a.host.localeCompare(b.host));
  return {
    samples:entries.length,windowMinutes:30,eligible:comparable.length,
    trendCount:trends.filter(t=>t.state!=="healthy").length,trends,
    note:comparable.length<3?
      "至少完成三次手动一键检测（30 分钟内且代理/VPN 接口线索一致），才能分析同一域名的波动。":
      "仅对比最近 30 分钟同一配置线索下的手动测试；不监控后台，不会自动请求网站。"
  };
}
