/**
 * OpenPenguin v16 manual HTTP evidence analysis.
 * Read-only observations of a single response supplied by a human-initiated
 * localhost request. No network, credentials, probes or target inputs.
 */
export const OBSERVED_HEADERS=Object.freeze([
  "content-security-policy","x-content-type-options","x-frame-options",
  "referrer-policy","cache-control","cross-origin-resource-policy","retry-after"
]);
const get=(headers,key)=>{
  const value=typeof headers?.get==="function"?headers.get(key):headers?.[key];
  return typeof value==="string"?value.slice(0,400):"";
};
export function inspectDefensiveHeaders(headers,status=200){
  const csp=get(headers,"content-security-policy");
  const nosniff=get(headers,"x-content-type-options");
  const frame=get(headers,"x-frame-options");
  const referrer=get(headers,"referrer-policy");
  const cache=get(headers,"cache-control");
  const corp=get(headers,"cross-origin-resource-policy");
  const retry=get(headers,"retry-after");
  const checks=[
    {id:"csp",label:"CSP 基础策略",observed:!!csp,
      note:csp?"观察到 Content-Security-Policy。需人工检查具体指令。":"未观察到 CSP 响应头。"},
    {id:"nosniff",label:"MIME 嗅探防护",observed:nosniff.toLowerCase().trim()==="nosniff",
      note:nosniff.toLowerCase().trim()==="nosniff"?"已观察到 nosniff。":"未观察到标准 nosniff 值。"},
    {id:"frame",label:"框架嵌入限制",observed:["deny","sameorigin"].includes(frame.toLowerCase().trim())||
      /frame-ancestors\s+('none'|'self')/i.test(csp),
      note:"检查 X-Frame-Options 或 CSP frame-ancestors；跨浏览器行为需另行验证。"},
    {id:"referrer",label:"Referrer 泄露控制",observed:!!referrer,
      note:referrer?"观察到 Referrer-Policy。":"未观察到 Referrer-Policy。"},
    {id:"cache",label:"缓存控制",observed:/\bno-store\b/i.test(cache),
      note:/\bno-store\b/i.test(cache)?"观察到 no-store；不能据此证明服务端无持久化。":
      "未观察到 no-store；是否需要取决于响应敏感性。"},
    {id:"corp",label:"跨源资源策略",observed:["same-origin","same-site"].includes(corp.toLowerCase().trim()),
      note:corp?"观察到 Cross-Origin-Resource-Policy。":"未观察到受限的 CORP 策略。"}
  ];
  if(status===429)checks.push({
    id:"retry",label:"限流恢复提示",observed:/^[0-9]{1,5}$/.test(retry),
    note:retry?"观察到 Retry-After；仍需结合服务端限流记录判断。":"429 响应未观察到数字型 Retry-After。"
  });
  return {checks,observed:checks.filter(x=>x.observed).length,total:checks.length,
    caveat:"此结果仅为响应头的观察性清单，不是漏洞利用结果或网站安全评级。"};
}
export function summarizeManualEvidence(entries){
  if(!Array.isArray(entries)||entries.length>30)throw Error("Invalid bounded manual evidence");
  const rows=entries.filter(e=>e&&Number.isInteger(e.status)&&e.status>=100&&e.status<=599&&
    typeof e.check==="string"&&/^[a-z-]{1,32}$/.test(e.check)&&
    Number.isFinite(e.durationMs)&&e.durationMs>=0&&e.durationMs<=60000);
  const sorted=rows.map(e=>e.durationMs).sort((a,b)=>a-b);
  const percentile=p=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;
  const counts={};
  for(const entry of rows)counts[String(entry.status)]=(counts[String(entry.status)]??0)+1;
  return {observations:rows.length,counts,medianMs:percentile(0.5),
    p95Ms:sorted.length>=3?percentile(0.95):null,
    note:"仅统计用户逐次点击得到的本机浏览器测量值；样本过少或缓存/调度波动会影响结果。"};
}
export function exportManualEvidence(entries){
  const aggregate=summarizeManualEvidence(entries);
  const items=entries.map(e=>({
    check:e.check,method:e.method,path:e.path,status:e.status,
    durationMs:e.durationMs,
    evidence:e.evidence&&typeof e.evidence==="object"?
      {observed:e.evidence.observed,total:e.evidence.total,
        checks:e.evidence.checks.map(x=>({id:x.id,observed:x.observed}))}:null
  }));
  return {
    schema:"openguin-local-manual-http-v16",scope:"fixed-same-origin-loopback",
    humanClicksOnly:true,networkRequestsGeneratedByModel:0,results:items,
    statistics:aggregate,
    privacy:{noCredentials:true,noCookies:true,noRequestBodies:true,
      noResponseBodies:true,noTargetInputs:true},
    limitations:["响应时间仅是浏览器本次请求的观察值，不是压测或吞吐量证明。",
      "响应头清单只能提示人工复核项，不能判定不存在漏洞。"]
  };
}
