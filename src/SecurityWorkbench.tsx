import {useEffect,useRef,useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {auditHttpResponseHeaders,compareHeaderAudits,exportHeaderAudit,type HeaderAudit} from "./defensive-header-audit";
import {downloadDiagnosticText} from "./diagnostic-export";
import JournalWorkbench from "./JournalWorkbench";
import "./security-workbench.css";

type AppRow={pid:number;process:string;observedSockets:number};
type AppSnapshot={
  capturedAtMs:number;source:string;processCount:number;observedSockets:number;
  processes:AppRow[];caveats:string[];
};
function secureDownload(name:string,content:unknown){
  const date=new Date().toISOString().replace(/[:.]/g,"-");
  downloadDiagnosticText(JSON.stringify(content,null,2),"openguin-"+name+"-"+date+".json","application/json;charset=utf-8");
}
export default function SecurityWorkbench(){
  const [snapshot,setSnapshot]=useState<AppSnapshot|null>(null);
  const [appBusy,setAppBusy]=useState(false);
  const appInFlight=useRef(false);
  const [live,setLive]=useState(false);
  const [history,setHistory]=useState<Array<{at:number;processes:number;sockets:number}>>([]);
  const [appError,setAppError]=useState("");
  const [headers,setHeaders]=useState("");
  const [audit,setAudit]=useState<HeaderAudit|null>(null);
  const [baseline,setBaseline]=useState<HeaderAudit|null>(null);
  const [headerNotice,setHeaderNotice]=useState("");
  const [showAll,setShowAll]=useState(false);
  async function sampleApps(){
    if(appInFlight.current)return;
    appInFlight.current=true;setAppBusy(true);setAppError("");
    try{const next=await invoke<AppSnapshot>("sample_app_connections");setSnapshot(next);
      setHistory(prev=>[...prev,{at:next.capturedAtMs,processes:next.processCount,sockets:next.observedSockets}].slice(-120));}
    catch(e){setAppError(String(e).slice(0,300))}
    finally{appInFlight.current=false;setAppBusy(false)}
  }
  useEffect(()=>{
    if(!live)return;
    const timer=window.setInterval(()=>{if(!document.hidden)void sampleApps();},15000);
    return ()=>window.clearInterval(timer);
  },[live]);
  function analyzeHeaders(){
    const next=auditHttpResponseHeaders(headers);
    setAudit(next);
    setHeaderNotice(next.parsedHeaderCount?"已读取 "+next.parsedHeaderCount+" 条响应头；没有向网站发送请求。":"请粘贴有效的 HTTP 响应头。");
  }
  const appPreview=showAll?snapshot?.processes:snapshot?.processes.slice(0,15);
  const delta=baseline&&audit?compareHeaderAudits(baseline,audit):null;
  return <div className="security-workbench">
    <JournalWorkbench/>
    <section className="v07-card security-tool-card">
      <div className="security-tool-head"><div><span className="eyebrow">DEFENSIVE TOOLBOX · LOCAL DEVICE</span>
        <h3>应用级连接观察 · App Socket Observatory</h3>
        <p>只在点击后采样 macOS 网络套接字；按应用显示可见连接描述符的数量，不采集远端地址、通信内容或命令行参数。</p></div>
        <div className="security-actions"><button disabled={appBusy} onClick={()=>void sampleApps()}>{appBusy?"正在读取本机状态…":"采集一次快照"}</button><button onClick={()=>{if(live)setLive(false);else{setLive(true);void sampleApps();}}}>{live?"停止实时采样":"开启 15 秒间隔采样"}</button></div>
      </div>
      {appError&&<p className="security-warning" role="alert">{appError}</p>}
      {snapshot&&<><div className="security-summary"><span>应用：<b>{snapshot.processCount}</b></span><span>可见套接字：<b>{snapshot.observedSockets}</b></span><span>采样：<b>{new Date(snapshot.capturedAtMs).toLocaleString()}</b></span></div>
        <div className="security-tablewrap"><table><thead><tr><th>进程</th><th>PID</th><th>可见套接字</th></tr></thead><tbody>
          {appPreview?.map(p=><tr key={p.pid}><td>{p.process}</td><td>{p.pid}</td><td>{p.observedSockets}</td></tr>)}
        </tbody></table></div>
        {snapshot.processes.length>15&&<button onClick={()=>setShowAll(x=>!x)}>{showAll?"收起列表":"查看全部 "+snapshot.processes.length+" 个应用"}</button>}
        {history.length>1&&<div className="security-history"><b>当前会话趋势（最近 {history.length} 次）</b><div className="security-history-grid">{history.slice(-8).map(x=><span key={x.at}>{new Date(x.at).toLocaleTimeString()} · {x.sockets} sockets</span>)}</div></div>}
        <div className="security-actions"><button onClick={()=>secureDownload("app-sockets",{schema:"openguin-app-sockets-v1",...snapshot,sampleHistory:history})}>导出本机连接摘要 JSON</button><button disabled={!history.length} onClick={()=>setHistory([])}>清空本次趋势</button></div>
        <small>{snapshot.caveats.join(" ")}</small></>}
    </section>
    <section className="v07-card security-tool-card">
      <div className="security-tool-head"><div><span className="eyebrow">DEFENSIVE TOOLBOX · WEBSITE CONFIGURATION</span>
        <h3>HTTP Security Headers Audit · 网站防御配置审计</h3>
        <p>适合检查你自己的网站：从浏览器开发者工具的 Network → Headers → Response Headers 复制响应头，然后在本地分析。请不要粘贴 Cookie、令牌或其他私密数据。</p></div>
      </div>
      <label className="security-field">HTTP 响应头（本地输入，最多 24 KB）
        <textarea value={headers} onChange={e=>{setHeaders(e.target.value.slice(0,24000));setAudit(null);setHeaderNotice("");}} rows={6}
          placeholder={"HTTP/2 200\ncontent-security-policy: default-src 'self'\nstrict-transport-security: max-age=31536000\nx-content-type-options: nosniff"}
          spellCheck={false}/>
      </label>
      <div className="security-actions"><button disabled={!headers.trim()} onClick={analyzeHeaders}>离线审计响应头</button>
        <button disabled={!audit||!audit.parsedHeaderCount} onClick={()=>{if(audit)secureDownload("header-review",exportHeaderAudit(audit));}}>导出安全建议 JSON</button>
        <button disabled={!audit||!audit.parsedHeaderCount} onClick={()=>{if(audit)setBaseline(audit);}}>保存本次为比较基线</button>
        <button onClick={()=>{setHeaders("");setAudit(null);setHeaderNotice("");}}>清空输入</button>
      </div>
      {headerNotice&&<p className="security-message" role="status">{headerNotice}</p>}
      {audit&&<><div className="security-summary">
        <span>需人工复核：<b>{audit.summary.review}</b></span>
        <span>配置建议：<b>{audit.summary.recommendation}</b></span>
        <span>已有信号：<b>{audit.summary.pass}</b></span>
      </div>
      {audit.errors.map((error,i)=><p key={i} className="security-warning">{error}</p>)}
      {delta&&<div className="security-delta"><b>与之前保存的基线比较</b><p>已消除的配置提醒：{delta.resolved.length} · 新出现的配置提醒：{delta.introduced.length} · 仍需关注：{delta.remaining.length}</p><small>{delta.caution}</small></div>}
      <div className="security-findings">{audit.findings.map(f=><article className={f.severity} key={f.id}>
        <strong>{f.severity==="review"?"需复核":f.severity==="recommendation"?"建议":"已观察到"} · {f.title}</strong>
        <p>{f.reason}</p><small>下一步：{f.remedy}</small>
      </article>)}</div>
      <small>提示：只检查一份响应头，不能证明网站整体安全；不同路径、不同响应类型可能使用不同策略。导出不包含你粘贴的原始响应头。</small></>}
    </section>
    <section className="v07-card security-tool-card">
      <span className="eyebrow">WHITE-HAT LEARNING · DEFENSIVE WORKFLOWS</span>
      <h3>网站安全学习实验台</h3>
      <p>围绕自有网站建立可重复的防御实验：先记录正常状态，再检查安全响应头和应用日志，最后比较修复前后的报告。所有检测以非侵入方式进行。</p>
      <div className="security-checklist">
        <div><b>01 · 建立基线</b><span>保留网站的正常响应时间、HTTP 状态和 DNS / HTTPS 检查结果。</span></div>
        <div><b>02 · 审核配置</b><span>离线检查 CSP、HSTS、Referrer-Policy、MIME 防护和登录 Cookie 配置。</span></div>
        <div><b>03 · 观察异常</b><span>筛选浏览器传输错误、服务端 5xx、请求停滞与页面脚本异常。</span></div>
        <div><b>04 · 修复与复测</b><span>更改自有服务器配置后，在相同条件下重新观察，保存版本化证据。</span></div>
      </div>
      <small>这不是漏洞利用器、密码测试器、压力攻击器或入侵工具。是否安全仍需结合服务器端审计和授权的专业评估。</small>
    </section>
  </div>;
}
