/**
 * Offline Apache/Nginx common/combined access-log aggregation.
 * Source lines often contain personal IPs, private URLs, referrers and agents.
 * We intentionally discard all of those. Do not retain or export raw lines.
 */
export const ACCESS_LOG_MAX_BYTES=1024*1024;
export type AccessBucket={minute:number;requests:number;http4xx:number;http5xx:number;http429:number};
export type AccessAudit={
  schema:"openguin-offline-access-log-review-v1";
  analyzedAt:string;
  linesRead:number;parsedLines:number;ignoredLines:number;
  successfulResponses:number;clientResponses:number;serverResponses:number;
  rateLimitedResponses:number;bytesTransferred:number;
  statusCounts:Array<{status:number;count:number}>;
  buckets:AccessBucket[];
  busiestMinute:AccessBucket|null;
  elevatedMinutes:number;
  warnings:string[];
};
const monthNames=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PATTERN=/^\S+\s+\S+\s+\S+\s+\[(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})\]\s+"([A-Z]+)\s+\S+\s+HTTP\/[0-9.]+"\s+(\d{3})\s+(\d+|-)(?:\s|$)/;
function apacheTime(day:string,month:string,year:string,hh:string,mm:string,ss:string,zone:string):number|null{
  const index=monthNames.findIndex(x=>x.toLowerCase()===month.toLowerCase());
  if(index<0)return null;
  const [d,y,h,m,s]=[Number(day),Number(year),Number(hh),Number(mm),Number(ss)];
  const tzHours=Number(zone.slice(1,3)),tzMinutes=Number(zone.slice(3,5));
  if(y<2000||y>2100||d<1||d>31||h>23||m>59||s>59||tzHours>14||tzMinutes>59)return null;
  const utc=Date.UTC(y,index,d,h,m,s);
  const verify=new Date(utc);
  if(verify.getUTCFullYear()!==y||verify.getUTCMonth()!==index||verify.getUTCDate()!==d)return null;
  const sign=zone[0]==="+"?1:-1;
  return utc-sign*(tzHours*60+tzMinutes)*60000;
}
function parseLine(line:string):{at:number;status:number;bytes:number}|null{
  // Strict, bounded parser. Never return a request URL, IP address or user agent.
  if(line.length>8192)return null;
  const m=PATTERN.exec(line);
  if(!m)return null;
  const at=apacheTime(...(m.slice(1,8) as [string,string,string,string,string,string,string]));
  const status=Number(m[9]);
  const bytes=m[10]==="-"?0:Number(m[10]);
  if(at===null||!Number.isInteger(status)||status<100||status>599||
    !Number.isSafeInteger(bytes)||bytes<0||bytes>10_000_000_000)return null;
  return {at,status,bytes};
}
export function analyzeAccessLog(raw:string):AccessAudit{
  if(raw.length>ACCESS_LOG_MAX_BYTES)throw new Error("访问日志超过 1 MiB 限制。请先拆分文件。");
  const lines=raw.split(/\r?\n/).filter(x=>x.trim().length>0);
  if(lines.length>6000)throw new Error("日志超过 6,000 行限制，请先拆分。");
  const counts=new Map<number,number>(),minutes=new Map<number,AccessBucket>();
  let parsed=0,success=0,client=0,server=0,limited=0,bytesTransferred=0;
  for(const line of lines){
    const v=parseLine(line);if(!v)continue;
    parsed++;bytesTransferred+=v.bytes;
    counts.set(v.status,(counts.get(v.status)||0)+1);
    if(v.status>=500)server++;
    else if(v.status>=400)client++;
    else if(v.status>=200 && v.status<400)success++;
    if(v.status===429)limited++;
    const minute=Math.floor(v.at/60000)*60000;
    let b=minutes.get(minute);
    if(!b){b={minute,requests:0,http4xx:0,http5xx:0,http429:0};minutes.set(minute,b);}
    b.requests++;
    if(v.status>=400&&v.status<500)b.http4xx++;
    if(v.status>=500)b.http5xx++;
    if(v.status===429)b.http429++;
  }
  const buckets=Array.from(minutes.values()).sort((a,b)=>a.minute-b.minute);
  const busiestMinute=buckets.length?buckets.reduce((a,b)=>a.requests>=b.requests?a:b):null;
  const volumeSorted=buckets.map(b=>b.requests).sort((a,b)=>a-b);
  const median=volumeSorted.length?volumeSorted[Math.floor((volumeSorted.length-1)/2)]:0;
  // Only meaningful as a preliminary observation; gaps and incomplete samples bias it.
  const elevatedMinutes=buckets.filter(b=>b.requests>=25 && b.requests>=Math.max(2,median*3)).length;
  const warnings:string[]=[];
  if(!parsed)warnings.push("没有识别出 Apache/Nginx Common 或 Combined 访问日志行。");
  if(lines.length>parsed)warnings.push("部分行不是受支持的日志格式或时间无效，未纳入统计。");
  if(elevatedMinutes)warnings.push("部分分钟的记录量明显高于本文件其他有记录的分钟，但这不证明攻击或实际服务器负载。");
  if(server)warnings.push("检测到服务器 5xx 响应；应结合应用错误日志与发布时间定位原因。");
  if(limited)warnings.push("检测到 HTTP 429 限流响应；不能据此断言恶意访问。");
  return {
    schema:"openguin-offline-access-log-review-v1",
    analyzedAt:new Date().toISOString(),
    linesRead:lines.length,parsedLines:parsed,ignoredLines:lines.length-parsed,
    successfulResponses:success,clientResponses:client,serverResponses:server,
    rateLimitedResponses:limited,bytesTransferred,
    statusCounts:[...counts.entries()].map(([status,count])=>({status,count})).sort((a,b)=>b.count-a.count||a.status-b.status),
    buckets,busiestMinute,elevatedMinutes,warnings
  };
}
export function exportAccessAudit(audit:AccessAudit){
  return {...audit,privacy:{
    offline:true,rawLinesIncluded:false,visitorIpIncluded:false,
    requestUrlsIncluded:false,referersIncluded:false,userAgentsIncluded:false,
    note:"Aggregate output can still reveal activity time windows; review before sharing."
  }};
}
