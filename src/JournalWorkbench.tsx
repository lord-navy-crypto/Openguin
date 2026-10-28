import {useMemo,useState} from "react";
import {
  parseBrowserJournal,reviewBrowserJournal,exportJournalSummary,journalEventSignal,
  type BrowserJournal,type EventSignal,JOURNAL_MAX_BYTES
} from "./network-journal";
import {downloadDiagnosticText} from "./diagnostic-export";
import "./journal-workbench.css";

const signalName:Record<EventSignal,string>={
  server:"服务端 5xx",client:"应用层 4xx",transport:"传输异常",
  stall:"停滞事件",render:"页面异常",download:"下载异常",other:"普通事件"
};
const fmtDate=(at:number|null)=>at===null?"—":new Date(at).toLocaleString();
const fmtMs=(ms:number|null)=>ms===null?"—":ms.toFixed(0)+" ms";
export default function JournalWorkbench({onJournalChange}:{onJournalChange?:(journal:BrowserJournal|null)=>void}){
  const [journal,setJournal]=useState<BrowserJournal|null>(null);
  const [raw,setRaw]=useState("");
  const [error,setError]=useState("");
  const [host,setHost]=useState("all");
  const [kind,setKind]=useState("all");
  const [term,setTerm]=useState("");
  const [limit,setLimit]=useState(50);
  const [showData,setShowData]=useState(false);
  const [copyStatus,setCopyStatus]=useState("");
  const review=useMemo(()=>journal?reviewBrowserJournal(journal):null,[journal]);
  const matches=useMemo(()=>journal?journal.events.filter(e=>{
    const signal=journalEventSignal(e);
    return (host==="all"||e.host===host)&&(kind==="all"||signal===kind)&&
      (!term.trim()||(e.host+" "+e.kind).toLowerCase().includes(term.trim().toLowerCase()));
  }).reverse():[],[journal,host,kind,term]);
  function accept(text:string){
    try{
      const parsed=parseBrowserJournal(text);
      setJournal(parsed);onJournalChange?.(parsed);setRaw("");setError("");setHost("all");setKind("all");setTerm("");setLimit(50);setCopyStatus("");
    }catch(e){setError(e instanceof Error?e.message:"无法读取日志");}
  }
  async function importFile(file:File|undefined){
    if(!file)return;
    if(file.size>JOURNAL_MAX_BYTES){setError("文件大于 1 MiB，未读取。");return;}
    try{accept(await file.text())}catch{setError("无法读取文件，请确认是 JSON 文本。");}
  }
  function getReport(){
    if(!review)return null;
    return exportJournalSummary(review);
  }
  async function copySummary(){
    const report=getReport();
    if(!report)return;
    try{await navigator.clipboard.writeText(JSON.stringify(report,null,2));setCopyStatus("已复制聚合报告；域名与时间段仍属于私密信息。");}
    catch{setCopyStatus("复制失败，可以选择下载 JSON。");}
  }
  function downloadSummary(){
    const report=getReport();if(!report)return;
    downloadDiagnosticText(JSON.stringify(report,null,2),
      "openguin-journal-analysis-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",
      "application/json;charset=utf-8");
    setCopyStatus("已请求保存聚合 JSON 报告。");
  }
  const maxDay=Math.max(1,...(review?.days||[]).map(d=>d.total));
  return <section className="v07-card journal-workbench">
    <div className="journal-intro">
      <div><span className="eyebrow">LOCAL-FIRST · BROWSER JOURNAL ANALYZER</span>
        <h3>长期网站日志分析 · Browser Journal Analyzer</h3>
        <p>导入浏览器扩展的 <b>openguin-browser-journal-v1</b> JSON，按日期、域名与事件类别分析。不读取其他浏览器数据，也不上传内容。</p>
      </div>
      <span className="journal-local">仅本次会话 · 本地分析</span>
    </div>
    <label className="journal-file-label">导入本地 JSON 文件（≤ 1 MiB）
      <input type="file" accept=".json,application/json" onChange={e=>{
        const file=e.currentTarget.files?.[0];void importFile(file);
        e.currentTarget.value="";
      }}/>
    </label>
    <label className="journal-paste-label">或者粘贴扩展导出的日志 JSON
      <textarea rows={3} maxLength={JOURNAL_MAX_BYTES} placeholder="在此粘贴长周期日志……"
        value={raw} onChange={e=>setRaw(e.target.value)}/>
    </label>
    <div className="journal-buttons">
      <button disabled={!raw.trim()} onClick={()=>accept(raw)}>解析粘贴内容</button>
      <button disabled={!journal} onClick={()=>{setJournal(null);onJournalChange?.(null);setRaw("");setError("");setCopyStatus("");}}>卸载当前日志</button>
    </div>
    {error&&<p className="journal-error" role="alert">{error}</p>}
    {!review&&<p className="journal-note">导入后会显示日志完整性、异常事件分布和网站性能分组。它与旧的 300 条 Browser Incident Report 是两种不同格式。</p>}
    {review&&journal&&<>
      <div className="journal-status">
        <div><span>已导入事件</span><b>{review.count}</b></div>
        <div><span>涉及域名</span><b>{review.hostCount}</b></div>
        <div><span>HTTP 5xx</span><b>{review.serverResponses}</b></div>
        <div><span>传输异常</span><b>{review.transportErrors}</b></div>
        <div><span>请求停滞</span><b>{review.stalls}</b></div>
        <div><span>响应 P95</span><b>{fmtMs(review.p95ResponseMs)}</b></div>
      </div>
      <div className="journal-meta">
        <span>首条：{fmtDate(review.firstAt)}</span>
        <span>末条：{fmtDate(review.lastAt)}</span>
        <span>生成：{new Date(journal.createdAt).toLocaleString()}</span>
        <span>采集状态：{journal.recordingEnabled?"导出时启用":"导出时暂停"}</span>
      </div>
      {review.coverageLimited&&<p className="journal-warning" role="status">日志可能不完整：有 {review.capacityDropped} 条被容量限制替换，或已达到 {journal.capacity} 条存储上限。不能据此推断监测期间没有其他活动。</p>}
      <div className="journal-panels">
        <div className="journal-panel">
          <h4>按日期的事件分布（UTC）</h4>
          <div className="journal-day-list">{review.days.map(d=><div key={d.day} className="journal-day">
            <time>{d.day}</time><span className="journal-bar"><i style={{width:(d.total/maxDay*100)+"%"}}/></span><b>{d.total}</b><small>{d.issues} 类故障信号</small>
          </div>)}</div>
          <small>一条请求可能产生多条事件。时间图不是流量字节计数。</small>
        </div>
        <div className="journal-panel">
          <h4>采集质量与分析限制</h4>
          <p>事件数 {review.count} · HTTP 响应 {review.httpResponses} · 4xx {review.clientResponses} · 下载异常 {review.downloadErrors} · 页面异常 {review.renderErrors}</p>
          <p>响应耗时中位数 {fmtMs(review.medianResponseMs)}。HTTP 4xx 常见于认证、权限或限流，不一定代表网络错误。</p>
          <p>仅包含明确授权范围内的采样。VPN 状态、应用进程与域名事件之间没有自动的因果映射。</p>
        </div>
      </div>
      <div className="journal-panel">
        <h4>按网站汇总的连接质量</h4>
        <div className="journal-tablewrap"><table><thead><tr><th>域名</th><th>事件</th><th>HTTP 响应</th><th>5xx</th><th>传输错误</th><th>停滞</th><th>响应 P95</th></tr></thead><tbody>
          {review.hosts.map(h=><tr key={h.host}><td>{h.host}</td><td>{h.events}</td><td>{h.responseCount}</td>
            <td>{h.serverResponses}</td><td>{h.transportErrors}</td><td>{h.stalls}</td><td>{fmtMs(h.p95ResponseMs)}</td></tr>)}
        </tbody></table></div>
      </div>
      <div className="journal-panel">
        <div className="journal-intro"><div><h4>可搜索的日志事件</h4><p>筛选在浏览器扩展实际记录到的事件，不会自动访问或探测任何网站。</p></div><b>{matches.length} 条</b></div>
        <div className="journal-filters">
          <label>域名<select value={host} onChange={e=>{setHost(e.target.value);setLimit(50);}}>
            <option value="all">全部域名</option>
            {review.hosts.map(h=><option key={h.host} value={h.host}>{h.host}</option>)}
          </select></label>
          <label>类别<select value={kind} onChange={e=>{setKind(e.target.value);setLimit(50);}}>
            <option value="all">全部事件</option>
            {Object.entries(signalName).map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select></label>
          <label>筛选关键词<input value={term} onChange={e=>{setTerm(e.target.value);setLimit(50);}} placeholder="域名或事件类型"/></label>
        </div>
        <button onClick={()=>setShowData(x=>!x)}>{showData?"折叠事件记录":"展开事件记录"}</button>
        {showData&&<div className="journal-event-list">
          {matches.slice(0,limit).map((e,i)=><article key={e.at+"-"+e.host+"-"+e.kind+"-"+i}>
            <time>{new Date(e.at).toLocaleString()}</time>
            <strong>{e.host}</strong><span>{e.kind} · {signalName[journalEventSignal(e)]}</span>
            <small>{e.status===null?"":("HTTP "+e.status+" · ")}{fmtMs(e.durationMs)}</small>
          </article>)}
          {!matches.length&&<p>没有匹配事件。</p>}
        </div>}
        {showData&&matches.length>limit&&<button onClick={()=>setLimit(x=>x+50)}>加载更多（剩余 {matches.length-limit} 条）</button>}
      </div>
      <div className="journal-buttons">
        <button onClick={()=>void copySummary()}>复制聚合报告供 ChatGPT 分析</button>
        <button onClick={downloadSummary}>下载聚合 JSON</button>
      </div>
      {copyStatus&&<p role="status" className="journal-note">{copyStatus}</p>}
      <small>分享说明：聚合报告不包含逐条浏览事件、路径或请求 ID，但包含访问域名与汇总时间，请先检查。原始导入日志只保留在当前页面内存中，卸载后清除。</small>
    </>}
  </section>;
}
