import {useMemo,useState} from "react";
import {
  analyzeAccessLog,exportAccessAudit,ACCESS_LOG_MAX_BYTES,type AccessAudit
} from "./server-access-log";
import {downloadDiagnosticText} from "./diagnostic-export";
import "./server-access-log.css";

export default function ServerAccessLogWorkbench(){
  const [raw,setRaw]=useState("");
  const [audit,setAudit]=useState<AccessAudit|null>(null);
  const [error,setError]=useState("");
  const [expanded,setExpanded]=useState(false);
  const [status,setStatus]=useState("");
  const daily=useMemo(()=>{
    if(!audit)return [];
    const byDay=new Map<string,{day:string;total:number;errors:number}>();
    for(const b of audit.buckets){
      const day=new Date(b.minute).toISOString().slice(0,10);
      const row=byDay.get(day)||{day,total:0,errors:0};
      row.total+=b.requests;row.errors+=b.http5xx;
      byDay.set(day,row);
    }
    return Array.from(byDay.values()).sort((a,b)=>a.day.localeCompare(b.day));
  },[audit]);
  function analyze(text:string){
    try{
      const result=analyzeAccessLog(text);
      setAudit(result);setRaw("");setError("");
      setStatus("已本地分析并从输入框清除原始日志。");
    }catch(e){setError(e instanceof Error?e.message:"无法解析日志。");}
  }
  async function importFile(file:File|undefined){
    if(!file)return;
    if(file.size>ACCESS_LOG_MAX_BYTES){setError("文件大于 1 MiB，未读取。");return;}
    try{analyze(await file.text())}catch{setError("无法读取日志文件。");}
  }
  function download(){
    if(!audit)return;
    downloadDiagnosticText(JSON.stringify(exportAccessAudit(audit),null,2),
      "openguin-access-audit-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",
      "application/json;charset=utf-8");
    setStatus("已请求下载不含原始访问日志的聚合分析报告。");
  }
  const peak=Math.max(1,...(audit?.buckets||[]).map(x=>x.requests));
  return <section className="v07-card access-log-workbench">
    <div className="access-heading">
      <div><span className="eyebrow">WHITE-HAT DEFENSE · OFFLINE SERVER LOG TRIAGE</span>
        <h3>服务器访问日志诊断 · Access Log Investigator</h3>
        <p>为你自己的网站导入 Apache/Nginx Common 或 Combined access.log，在本地查看 HTTP 错误、限流事件与分钟请求量。只做离线分析，不向服务器发送流量。</p>
      </div>
      <span className="access-pill">访客 IP / URL 不导出</span>
    </div>
    <label className="access-input">选择本地 access.log / 文本文件（最大 1 MiB）
      <input type="file" accept=".log,.txt,text/plain" onChange={e=>{
        const file=e.currentTarget.files?.[0];void importFile(file);e.currentTarget.value="";
      }}/>
    </label>
    <label className="access-input">或粘贴你自己服务器的访问日志
      <textarea value={raw} rows={4} maxLength={ACCESS_LOG_MAX_BYTES}
        onChange={e=>{setRaw(e.target.value);setError("");}}
        placeholder={'127.0.0.1 - - [28/Oct/2026:12:00:00 +0800] "GET / HTTP/1.1" 200 120 "-" "ExampleBrowser"'}/>
    </label>
    <div className="access-actions">
      <button disabled={!raw.trim()} onClick={()=>analyze(raw)}>本地分析日志</button>
      <button disabled={!audit} onClick={download}>导出聚合安全报告 JSON</button>
      <button disabled={!audit} onClick={()=>{setAudit(null);setStatus("");}}>清除分析结果</button>
    </div>
    {error&&<p className="access-error" role="alert">{error}</p>}
    {status&&<p className="access-status" role="status">{status}</p>}
    {audit&&<>
      <div className="access-metrics">
        <div><small>已解析</small><b>{audit.parsedLines}</b><span>{audit.ignoredLines} 行忽略</span></div>
        <div><small>成功响应 2xx–3xx</small><b>{audit.successfulResponses}</b></div>
        <div><small>客户端错误 4xx</small><b>{audit.clientResponses}</b></div>
        <div><small>服务器错误 5xx</small><b>{audit.serverResponses}</b></div>
        <div><small>429 限流</small><b>{audit.rateLimitedResponses}</b></div>
        <div><small>高于样本基线的分钟段</small><b>{audit.elevatedMinutes}</b></div>
      </div>
      {audit.warnings.map((warning,i)=><p key={i} className="access-warning">{warning}</p>)}
      <div className="access-columns">
        <div className="access-panel"><h4>HTTP 状态码分布</h4>
          {audit.statusCounts.map(x=><div key={x.status} className="access-status-row"><b>{x.status}</b><span>{x.count} 条</span></div>)}
        </div>
        <div className="access-panel"><h4>按天汇总（UTC）</h4>
          {daily.map(x=><div key={x.day} className="access-status-row"><b>{x.day}</b><span>{x.total} 条 · {x.errors} 次 5xx</span></div>)}
        </div>
      </div>
      <div className="access-panel">
        <h4>每分钟请求量</h4>
        <p>仅反映此文件中的日志行数，不是实际带宽或完整服务器访问量。</p>
        <div className="access-trend">{audit.buckets.slice(-36).map(x=><div className="access-trend-row" key={x.minute}>
          <time>{new Date(x.minute).toLocaleString()}</time>
          <span><i style={{width:Math.max(2,x.requests/peak*100)+"%"}}/></span>
          <b>{x.requests}</b><small>{x.http5xx} 次 5xx</small>
        </div>)}</div>
        {audit.buckets.length>36&&<button onClick={()=>setExpanded(v=>!v)}>{expanded?"隐藏":"显示"}全部分钟统计</button>}
        {expanded&&audit.buckets.length>36&&<div className="access-extended">{audit.buckets.map(x=><div key={x.minute}>{new Date(x.minute).toLocaleString()} · {x.requests} requests · {x.http4xx} 4xx · {x.http5xx} 5xx</div>)}</div>}
      </div>
      <small>日志中的请求路径、远程 IP、Referer 和 User-Agent 不进入分析结果或 JSON。访问高峰可能来自正常流量、部署任务、爬虫或错误配置，并不是检测到攻击的证据。对访客日志应遵守适用的隐私和保留要求。</small>
    </>}
  </section>;
}
