import {useMemo,useState} from "react";
import {analyzeBrowserReport,eventCounts,parseBrowserReport,type BrowserReport} from "./browser-diagnostics";
import "./browser-report.css";

type Connection={dns:Array<{resolved:boolean}>;endpoints:Array<{reachable:boolean}>;hints:string[]};
type Speed={downloadMbps?:number|null;uploadMbps?:number|null;latencyMs?:number|null;jitterMs?:number|null;probeFailures:number;probeCount:number};
type Sample={label:"on"|"off";avgResponseMs:number|null;downloadMbps:number|null};
type Props={networkSnapshot:Connection|null;speedTest:Speed|null;vpnSamples:Sample[]};
const labels:Record<string,string>={
  "fetch-response":"请求响应","fetch-error":"请求失败","fetch-stall":"等待响应超时",
  "xhr-error":"XHR 请求失败","xhr-stall":"XHR 等待超时","stream-gap":"响应流卡顿",
  "stream-error":"响应流异常","resource-error":"资源加载失败",
  "javascript-error":"脚本异常","long-task":"页面卡顿",
  "download-failed":"下载失败","download-stall":"下载停滞",
  "download-progress":"下载进度","download-complete":"下载完成"
};
function metric(value:number|null|undefined,unit:string):string{
  return value===null||value===undefined?"—":value.toFixed(1)+" "+unit;
}
export default function BrowserReportPanel({networkSnapshot,speedTest,vpnSamples}:Props){
  const [raw,setRaw]=useState("");
  const [report,setReport]=useState<BrowserReport|null>(null);
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  const findings=useMemo(()=>report?analyzeBrowserReport(report):[],[report]);
  const counts=useMemo(()=>report?eventCounts(report):[],[report]);
  const dnsFailed=networkSnapshot?.dns.filter(x=>!x.resolved).length??0;
  const httpsFailed=networkSnapshot?.endpoints.filter(x=>!x.reachable).length??0;
  const vpnOn=vpnSamples.find(x=>x.label==="on");
  const vpnOff=vpnSamples.find(x=>x.label==="off");
  function importReport(){
    try{setReport(parseBrowserReport(raw));setRaw("");setError("");setCopied(false)}
    catch(e){setError(e instanceof Error?e.message:"无法读取报告")}
  }
  async function copyCombined(){
    if(!report)return;
    const result={
      name:"Openguin Network Observatory — combined diagnosis",
      createdAt:new Date().toISOString(),
      browser:{at:report.generatedAt,eventCount:report.events.length,findings,events:report.events},
      network:networkSnapshot?{
        dnsFailed,httpsFailed,dnsCount:networkSnapshot.dns.length,
        httpsCount:networkSnapshot.endpoints.length,
        hints:networkSnapshot.hints.slice(0,12)
      }:null,
      speed:speedTest?{
        latencyMs:speedTest.latencyMs,jitterMs:speedTest.jitterMs,
        downloadMbps:speedTest.downloadMbps,uploadMbps:speedTest.uploadMbps,
        probeFailures:speedTest.probeFailures,probeCount:speedTest.probeCount
      }:null,
      vpnComparison:vpnOn&&vpnOff?{on:vpnOn,off:vpnOff}:null,
      note:"Symptoms and correlations are not definitive proof of a root cause."
    };
    try{await navigator.clipboard.writeText(JSON.stringify(result,null,2));setCopied(true);setError("")}
    catch{setError("复制失败。请检查剪贴板访问权限。")}
  }
  return <section className="v07-card browser-report-panel">
    <div className="diag-head"><div>
      <h3>Browser incident report · 浏览器故障诊断</h3>
      <p>关联网页加载、请求/响应、下载故障与 DNS、测速、VPN 结果。每条判断都附带证据和建议。</p>
    </div><span className="browser-report-pill">{report?report.events.length+" events":"Awaiting report"}</span></div>
    <p className="browser-report-howto">浏览器扩展点击「Copy diagnostic report」→ 在下方粘贴 → 点击「分析报告」。无上传或后台共享。</p>
    <label htmlFor="browser-report-import">浏览器诊断报告 JSON</label>
    <textarea id="browser-report-import" value={raw} onChange={e=>setRaw(e.target.value)}
      placeholder="在这里粘贴浏览器扩展复制的诊断报告…" rows={3} maxLength={300000}/>
    <div className="network-actions">
      <button disabled={!raw.trim()} onClick={importReport}>分析报告</button>
      <button disabled={!report} onClick={()=>void copyCombined()}>{copied?"已复制综合报告":"复制综合报告"}</button>
      <button disabled={!report} onClick={()=>{setReport(null);setCopied(false);setError("")}}>清除</button>
    </div>
    {error&&<p className="browser-report-error" role="alert">{error}</p>}
    {report&&<>
      <div className="browser-report-stats">
        <div><span>事件数量</span><strong>{report.events.length}</strong></div>
        <div><span>发现的故障类别</span><strong>{findings.length}</strong></div>
        <div><span>DNS 失败</span><strong>{networkSnapshot?dnsFailed:"—"}</strong></div>
        <div><span>HTTPS 建连失败</span><strong>{networkSnapshot?httpsFailed:"—"}</strong></div>
      </div>
      <div className="browser-report-grid">
        <div className="browser-findings"><h4>故障证据及下一步</h4>
          {findings.length===0&&<p>没有检测到预设的故障特征。但单次监测不能排除间歇性问题。</p>}
          {findings.map(item=><article key={item.id} className={"browser-finding "+item.severity}>
            <div><b>{item.label}</b><span>{item.count} 次</span></div>
            <p>{item.evidence}</p><small>建议：{item.nextStep}</small>
          </article>)}
        </div>
        <div className="browser-events"><h4>浏览器事件分布</h4>
          {counts.map(item=><div className="browser-event-bar" key={item.kind}>
            <span>{labels[item.kind]||item.kind}</span>
            <div aria-hidden="true"><i style={{width:Math.max(3,Math.round(item.count/(counts[0]?.count||1)*100))+"%"}}/></div>
            <b>{item.count}</b>
          </div>)}
          <div className="browser-speed-evidence"><h4>网络与 VPN 佐证</h4>
            <p>下载：{metric(speedTest?.downloadMbps,"Mbps")} · 上传：{metric(speedTest?.uploadMbps,"Mbps")}</p>
            <p>HTTP 延迟：{metric(speedTest?.latencyMs,"ms")} · 抖动：{metric(speedTest?.jitterMs,"ms")}</p>
            {vpnOn&&vpnOff&&<p>VPN On：{metric(vpnOn.avgResponseMs,"ms")} · Off：{metric(vpnOff.avgResponseMs,"ms")}</p>}
            <small>HTTP 探测失败不能当作 ICMP 丢包率；对照结果应在相同条件下重复测量。</small>
          </div>
        </div>
      </div>
      <div className="browser-timeline"><h4>最近 12 条事件</h4>
        {report.events.slice(-12).reverse().map((e,i)=><div key={e.at+"-"+i}>
          <time>{new Date(e.at).toLocaleTimeString()}</time><b>{labels[e.kind]||e.kind}</b>
          <span>{e.host}</span><small>{e.status?"HTTP "+e.status:e.errorType||metric(e.durationMs,"ms")}</small>
        </div>)}
      </div>
      <p className="browser-report-note">隐私与可信度：仅导入扩展导出的类别、域名、时间和状态值，不含提示词、回答正文、完整网址或文件名。网页注入得到的事件可能不完整或被网页脚本影响，不能独立证明某个服务器或 VPN 出错。</p>
    </>}
  </section>;
}
