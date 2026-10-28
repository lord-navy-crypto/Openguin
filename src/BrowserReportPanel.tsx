import {useMemo,useState} from "react";
import NetworkSecurityLab from "./NetworkSecurityLab";
import {buildNetworkSecurityReview,buildSecurityReviewExport} from "./network-security-analysis";
import {analyzeBrowserReport,eventCounts,parseBrowserReport,summarizeBrowserEndpoints,summarizeBrowserRequests,summarizeBrowserTelemetry,type BrowserReport} from "./browser-diagnostics";
import {correlateBrowserWithOneClick} from "./network-correlation";
import {diagnosticBundleToCsv,downloadDiagnosticText} from "./diagnostic-export";
import type {NetworkHistoryEntry} from "./network-history";
import type {OneClickResult} from "./network-one-click";
import "./browser-report.css";

type Connection={
  capturedAtMs?:number;os?:string;
  dns:Array<{host?:string;resolved:boolean;elapsedMs?:number;addressCount?:number;error?:string|null}>;
  endpoints:Array<{name?:string;host?:string;reachable:boolean;status?:number|null;elapsedMs?:number|null;error?:string|null}>;
  route?:{defaultInterface?:string|null;vpnLikely?:boolean;vpnInterfaces?:string[]};
  proxy?:{environmentConfigured?:boolean;systemConfigured?:boolean};
  hints:string[];
};
type Speed={
  capturedAtMs?:number;provider?:string;downloadBytes?:number;uploadBytes?:number;
  downloadMs?:number|null;uploadMs?:number|null;downloadError?:string|null;uploadError?:string|null;
  downloadMbps?:number|null;uploadMbps?:number|null;latencyMs?:number|null;jitterMs?:number|null;
  probeFailures:number;probeCount:number;
  probeSamples?:Array<{elapsedMs:number;status?:number|null;success:boolean;failureKind?:string|null}>;
};
type Sample={
  id?:string;label:"on"|"off";at?:string;reachable?:number;avgResponseMs:number|null;
  latencyMs?:number|null;jitterMs?:number|null;probeFailures?:number|null;probeCount?:number|null;
  downloadMbps:number|null;uploadMbps:number|null;vpnLikely?:boolean;defaultInterface?:string|null;proxyConfigured?:boolean;
};
type DeviceProfile={os:string;arch:string;chip:string;memoryBytes:number;logicalCores:number;freeStorageBytes:number};
type Props={networkSnapshot:Connection|null;speedTest:Speed|null;vpnSamples:Sample[];oneClickReport:OneClickResult|null;networkHistory:NetworkHistoryEntry[];deviceProfile:DeviceProfile|null};
const labels:Record<string,string>={
  "fetch-response":"请求响应","fetch-error":"请求失败","fetch-stall":"等待响应超时",
  "xhr-error":"XHR 请求失败","xhr-stall":"XHR 等待超时","stream-gap":"响应流卡顿",
  "stream-gap-resolved":"响应流停顿后恢复","stream-error":"响应流异常",
  "body-read-complete":"响应正文读取完成","body-read-error":"响应正文读取失败","resource-error":"资源加载失败",
  "javascript-error":"脚本异常","long-task":"页面卡顿",
  "download-failed":"下载失败","download-stall":"下载停滞",
  "download-progress":"下载进度","download-complete":"下载完成"
};
function metric(value:number|null|undefined,unit:string):string{
  return value===null||value===undefined?"—":value.toFixed(1)+" "+unit;
}
export default function BrowserReportPanel({networkSnapshot,speedTest,vpnSamples,oneClickReport,networkHistory,deviceProfile}:Props){
  const [raw,setRaw]=useState("");
  const [report,setReport]=useState<BrowserReport|null>(null);
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  const findings=useMemo(()=>report?analyzeBrowserReport(report):[],[report]);
  const securityReview=useMemo(()=>report?buildNetworkSecurityReview(report):null,[report]);
  const counts=useMemo(()=>report?eventCounts(report):[],[report]);
  const restrictedResourceTiming=useMemo(()=>report?
    report.events.filter(e=>e.kind==="resource-timing-limited").length:0,[report]);
  const telemetry=useMemo(()=>report?summarizeBrowserTelemetry(report):null,[report]);
  const endpoints=useMemo(()=>report?summarizeBrowserEndpoints(report):[],[report]);
  const requestLifecycles=useMemo(()=>report?summarizeBrowserRequests(report):[],[report]);
  const correlation=useMemo(()=>report?correlateBrowserWithOneClick(report,oneClickReport):null,[report,oneClickReport]);
  const dnsFailed=networkSnapshot?.dns.filter(x=>!x.resolved).length??0;
  const httpsFailed=networkSnapshot?.endpoints.filter(x=>!x.reachable).length??0;
  const vpnOn=vpnSamples.find(x=>x.label==="on");
  const vpnOff=vpnSamples.find(x=>x.label==="off");
  function importReport(){
    try{setReport(parseBrowserReport(raw));setRaw("");setError("");setCopied(false)}
    catch(e){setError(e instanceof Error?e.message:"无法读取报告")}
  }
  async function importFromClipboard(){
    try {
      const content=await navigator.clipboard.readText();
      if(!content) throw new Error("剪贴板为空，请先从扩展复制诊断报告。");
      setReport(parseBrowserReport(content));setRaw("");setError("");setCopied(false);
    }catch(e){setError(e instanceof Error?e.message:"读取剪贴板失败，请手动粘贴报告。")}
  }
  function buildCombinedBundle(){
    return {
      schema:{name:"Openguin Network Doctor combined diagnostic bundle",formatVersion:1},
      generatedAt:new Date().toISOString(),
      device:deviceProfile?{
        os:deviceProfile.os,architecture:deviceProfile.arch,chip:deviceProfile.chip,
        memoryBytes:deviceProfile.memoryBytes,logicalCores:deviceProfile.logicalCores,
        freeStorageBytes:deviceProfile.freeStorageBytes
      }:null,
      oneClickDiagnosis:oneClickReport,
      networkSnapshot,
      speedTest,
      vpnComparisonSamples:vpnSamples.slice(0,10),
      networkHistory:networkHistory.slice(0,12),
      browser:report?{
        source:report.source,formatVersion:report.formatVersion,generatedAt:report.generatedAt,
        eventCount:report.events.length,quality:report.quality??null,
        labCompatibility:report.labCompatibility??null,
        captureSession:report.captureSession??null,findings,eventCounts:counts,requestLifecycles,events:report.events
      }:null,
      crossLayer:correlation,
      networkSecurityReview:securityReview?buildSecurityReviewExport(securityReview):null,
      privacy:{
        localOnly:true,
        excludes:["page text","prompts and model answers","cookies and headers","request/response bodies","proxy addresses and credentials","full URLs and query strings","download filenames","local file paths"],
        browserEvents:"Only sanitized event metadata is included: category, host, status, duration, and coarse error signals.",
        caution:"Review the exported report before sharing it."
      },
      limitations:[
        "HTTP 401/403/429 are server responses, not proof of a network outage.",
        "VPN interface indicators do not prove that a particular request used the tunnel.",
        "HTTP request timing is not ICMP ping or a packet-loss measurement.",
        "Browser instrumentation may miss browser-internal failures and is not a packet capture."
      ]
    };
  }
  async function copyCombined(){
    const result=buildCombinedBundle();
    try{await navigator.clipboard.writeText(JSON.stringify(result,null,2));setCopied(true);setError("")}
    catch{setError("复制失败。请检查剪贴板访问权限。")}
  }
  function downloadCombined(format:"json"|"csv"){
    try{
      const result=buildCombinedBundle();
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      if(format==="json"){
        downloadDiagnosticText(JSON.stringify(result,null,2),"openguin-combined-diagnostic-"+stamp+".json","application/json;charset=utf-8");
      }else{
        downloadDiagnosticText("\uFEFF"+diagnosticBundleToCsv(result),"openguin-combined-diagnostic-"+stamp+".csv","text/csv;charset=utf-8");
      }
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"导出报告失败")}
  }
  const hasExportData=Boolean(report||networkSnapshot||speedTest||oneClickReport||vpnSamples.length||networkHistory.length);

  return <section className="v07-card browser-report-panel">
    <div className="diag-head"><div>
      <h3>Browser incident report · 浏览器故障诊断</h3>
      <p>关联网页加载、请求/响应、下载故障与 DNS、测速、VPN 结果。每条判断都附带证据和建议。</p>
    </div><span className="browser-report-pill">{report?report.events.length+" events":"Awaiting report"}</span></div>
    <p className="browser-report-howto">先在扩展点击「Copy diagnostic report」或下载 JSON，然后使用「从剪贴板分析」或粘贴报告。导入后可一次复制/下载包含网页事件、DNS/HTTPS、测速、VPN 对比和故障分析的完整诊断包；不会上传或后台共享。</p>
    <label htmlFor="browser-report-import">浏览器诊断报告 JSON</label>
    <textarea id="browser-report-import" value={raw} onChange={e=>setRaw(e.target.value)}
      placeholder="在这里粘贴浏览器扩展复制的诊断报告…" rows={3} maxLength={300000}/>
    <div className="network-actions">
      <button onClick={()=>void importFromClipboard()}>从剪贴板分析</button>
      <button disabled={!raw.trim()} onClick={importReport}>分析粘贴报告</button>
      <button disabled={!hasExportData} onClick={()=>void copyCombined()}>{copied?"已复制诊断包":report?"复制完整诊断包":"复制桌面诊断包"}</button>
      <button disabled={!hasExportData} onClick={()=>downloadCombined("json")}>{report?"下载综合 JSON":"下载桌面 JSON"}</button>
      <button disabled={!hasExportData} onClick={()=>downloadCombined("csv")}>{report?"下载综合 CSV 表格":"下载桌面 CSV 表格"}</button>
      <button disabled={!report} onClick={()=>{setReport(null);setCopied(false);setError("")}}>清除浏览器报告</button>
    </div>
    {error&&<p className="browser-report-error" role="alert">{error}</p>}
    {report&&<>
      {correlation&&<div className="browser-correlation">
        <div className="browser-correlation-head">
          <h4>跨层故障定位 · 自动关联浏览器与一键检测</h4>
          <span>{correlation.timing==="aligned"?"时间匹配":correlation.timing==="outdated"?"数据不同期":correlation.timing==="browser-only"?"仅浏览器证据":"无浏览器事件"}</span>
        </div>
        <p>{correlation.summary}</p>
        {correlation.findings.map(item=><article key={item.code} className={"browser-correlation-row "+item.priority}>
          <strong>{item.title}</strong>
          <p><b>依据：</b>{item.why}</p>
          <p><b>建议：</b>{item.nextStep}</p>
        </article>)}
      </div>}
      {restrictedResourceTiming>0&&<section className="browser-correlation"
          aria-label="Resource Timing limited visibility">
        <div className="browser-correlation-head">
          <h4>跨源性能数据可见性</h4><span>需人工核对</span>
        </div>
        <p>扩展在本次监测中报告了跨源 Resource Timing 字段受限的情况。
          观察提示数量：{restrictedResourceTiming}。状态码或详细计时缺失不能作为 HTTP 失败、服务器故障或遭受攻击的证据。</p>
        <p className="muted">部分跨源指标需要服务端允许 Timing-Allow-Origin，
          且浏览器支持范围不完全一致。此提示仅基于页面脚本提供的观察结果。</p>
      </section>}
      {report.captureSession&&<section className="browser-correlation" aria-label="Browser capture session evidence">
        <div className="browser-correlation-head">
          <h4>采集完整性 · v19</h4>
          <span>{report.captureSession.monitoringAtExport?"导出时标记为正在监测":"导出时已停止"}</span>
        </div>
        <p>扩展声明的本次会话收件数为 <strong>{report.captureSession.observedCount}</strong>；
          本次报告实际包含 <strong>{report.events.length}</strong> 条事件。
          两者可能因 300 条缓存上限、清理记录及可选下载事件而不同，不代表流量丢包。</p>
        <p>开始时间：{report.captureSession.startedAt===null?"不可用":
          new Date(report.captureSession.startedAt).toLocaleString()} ·
          最近一次接收：{report.captureSession.lastObservedAt===null?"无确认事件":
          new Date(report.captureSession.lastObservedAt).toLocaleString()}</p>
        {report.captureSession.stopReason&&<p>采集终止原因：{report.captureSession.stopReason}</p>}
        <p className="muted">这些是扩展本地元数据，未独立验证网页真实性；
          页面事件可能被遗漏或伪造，不应单独用来认定网站遭受攻击。</p>
      </section>}
      {report.labCompatibility&&<section className="browser-correlation" aria-label="OpenPenguin localhost extension v17 lab summary">
        <div className="browser-correlation-head"><h4>Localhost Lab · 浏览器监测与防御实验室</h4>
          <span>v17 匹配</span></div>
        <p>仅汇总固定本机实验路由，状态码由导入的浏览器事件重新计算，不直接信任扩展报告自带的统计字段。</p>
        <div className="browser-report-stats">
          <div><span>观察到的响应</span><strong>{report.labCompatibility.observedResponses}</strong></div>
          <div><span>响应时间中位数</span><strong>{report.labCompatibility.medianObservedMs===null?"—":report.labCompatibility.medianObservedMs+" ms"}</strong></div>
          <div><span>浏览器观察 P95</span><strong>{report.labCompatibility.p95ObservedMs===null?"样本不足":report.labCompatibility.p95ObservedMs+" ms"}</strong></div>
          <div><span>可能丢失事件</span><strong>{report.labCompatibility.lostEvents}</strong></div>
        </div>
        <p>状态码分布：{Object.entries(report.labCompatibility.statusCounts).length?
          Object.entries(report.labCompatibility.statusCounts).sort(([a],[b])=>Number(a)-Number(b)).map(([code,count])=>"HTTP "+code+" · "+count).join(" / "):
          "未观察到 Fetch/XHR 响应"}</p>
        <p className="muted">{report.labCompatibility.captureLimitations}</p>
      </section>}
      {report.quality&&<div className="browser-report-stats">
        <div><span>已抑制重复事件</span><strong>{report.quality.duplicateEventsSuppressed}</strong></div>
        <div><span>已丢弃的旧事件</span><strong>{report.quality.droppedEvents}</strong></div>
        <div><span>事件缓存状态</span><strong>{report.quality.eventCapReached?"达到上限":"未满"}</strong></div>
        <div><span>采集完整性</span><strong>{report.quality.droppedEvents>0?"确认有截断":report.quality.eventCapReached?"可能已截断":"未发现溢出"}</strong></div>
      </div>}
      <div className="browser-report-stats">
        <div><span>事件数量</span><strong>{report.events.length}</strong></div>
        <div><span>发现的故障类别</span><strong>{findings.length}</strong></div>
        <div><span>DNS 失败</span><strong>{networkSnapshot?dnsFailed:"—"}</strong></div>
        <div><span>HTTPS 建连失败</span><strong>{networkSnapshot?httpsFailed:"—"}</strong></div>
      </div>
      {telemetry&&<div className="browser-telemetry">
        <h4>请求性能与采集质量 · 自动汇总</h4>
        <div className="browser-report-stats">
          <div><span>已收到的 HTTP 响应</span><strong>{telemetry.responseCount}</strong></div>
          <div><span>响应耗时中位数</span><strong>{metric(telemetry.medianResponseMs,"ms")}</strong></div>
          <div><span>响应耗时 P95</span><strong>{metric(telemetry.p95ResponseMs,"ms")}</strong></div>
          <div><span>慢响应（≥ 2.5 秒）</span><strong>{telemetry.slowResponses}</strong></div>
          <div><span>请求传输错误</span><strong>{telemetry.transportErrors}</strong></div>
          <div><span>请求停滞事件</span><strong>{telemetry.requestStalls}</strong></div>
          <div><span>4xx / 5xx 响应</span><strong>{telemetry.http4xx} / {telemetry.http5xx}</strong></div>
          <div><span>最长已记录流停顿</span><strong>{metric(telemetry.maxStreamGapMs,"ms")}</strong></div>
          <div><span>正文读取完成</span><strong>{telemetry.bodyReadCount}</strong></div>
          <div><span>正文读取错误</span><strong>{telemetry.bodyReadErrors}</strong></div>
          <div><span>正文读取耗时中位数</span><strong>{metric(telemetry.medianBodyReadMs,"ms")}</strong></div>
          <div><span>响应后等待开始读取</span><strong>{metric(telemetry.maxHeadersToBodyReadMs,"ms")}</strong></div>
        </div>
        <p className="browser-report-howto">P95 表示本次已记录响应中 95% 不超过的耗时，不是网络延迟保证值。响应耗时包含浏览器可观测的请求等待时间，不能单独分离服务器处理时间与网络传输时间。正文读取耗时还可能包含 JSON 解析和页面消费速度，不等于纯网络传输耗时。</p>
      </div>}
      {requestLifecycles.length>0&&<div className="browser-request-lifecycles">
        <h4>逐请求生命周期 · 同一请求 ID 关联</h4>
        <p className="browser-report-howto">同一 request ID 将请求开始、响应/错误、15 秒停滞事件及响应流停顿关联起来。若报告没有 request ID 的旧版事件，将不会出现在此列表。</p>
        {requestLifecycles.slice(0,10).map(item=><article key={item.requestId} className={"browser-request-row "+item.outcome}>
          <div className="browser-endpoint-head"><b>{item.method} {item.host}{item.path}</b><span>{({
            response:"已响应","http-error":"HTTP 错误","transport-error":"传输错误",
            timeout:"请求超时",cancelled:"请求取消",stalled:"未完成/停滞",incomplete:"未观察到结束"
          } as Record<string,string>)[item.outcome]}</span></div>
          <p>HTTP {item.status??"—"} · 耗时 {metric(item.durationMs,"ms")} · 请求停滞 {item.stallEvents} · 流停顿 {item.streamPauseEvents} · 正文读取错误 {item.bodyReadErrors}</p>
          <small>请求 ID：{item.requestId} · 关联事件 {item.eventCount}{item.startedAt?" · 开始 "+new Date(item.startedAt).toLocaleTimeString():""}</small>
        </article>)}
      </div>}
      {endpoints.length>0&&<div className="browser-endpoints">
        <h4>问题最集中的请求端点 · 按异常和耗时排序</h4>
        <p className="browser-report-howto">端点按脱敏后的域名、路径和方法聚合；并发请求没有唯一请求 ID，因此这些是分组统计，不是逐请求配对追踪。</p>
        {endpoints.slice(0,8).map((item,index)=><article key={item.host+"|"+item.method+"|"+item.path} className="browser-endpoint-row">
          <div className="browser-endpoint-head"><b>{index+1}. {item.method} {item.host}{item.path}</b><span>{item.responseCount} 响应</span></div>
          <p>中位数 {metric(item.medianResponseMs,"ms")} · P95 {metric(item.p95ResponseMs,"ms")} · 最慢 {metric(item.maxResponseMs,"ms")}</p>
          <small>开始 {item.requestStarts} · 错误 {item.errorCount} · 停滞 {item.stallCount} · 4xx {item.http4xx} · 5xx {item.http5xx} · 慢响应 {item.slowResponses}</small>
        </article>)}
      </div>}
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
          <time>{new Date(e.at).toLocaleTimeString()}{e.sourceAt&&e.sourceAt!==e.at?" · page event "+new Date(e.sourceAt).toLocaleTimeString():""}</time><b>{labels[e.kind]||e.kind}</b>
          <span>{e.host}{e.path||""}{e.method?" · "+e.method:""}{e.requestId?" · req "+e.requestId:""}</span><small>{e.status?"HTTP "+e.status:e.errorType||(e.bodyReadDurationMs!==undefined?"body "+metric(e.bodyReadDurationMs,"ms"):metric(e.durationMs,"ms"))}{e.headersToBodyReadMs!==undefined?" · before read "+metric(e.headersToBodyReadMs,"ms"):""}{e.bridgeDelayMs!==undefined?" · capture delay "+metric(e.bridgeDelayMs,"ms"):""}</small>
        </div>)}
      </div>
      <NetworkSecurityLab report={report} vpnSamples={vpnSamples} networkSnapshot={networkSnapshot}/>
      <p className="browser-report-note">隐私与可信度：导出包含事件类别、时间、域名、脱敏路径/方法、HTTP 状态、耗时和粗粒度下载/渲染指标；不含提示词、回答正文、Cookie、请求/响应正文、完整网址、查询参数或文件名。网页注入得到的事件可能不完整或被网页脚本影响，不能独立证明某个服务器或 VPN 出错。分享前请检查报告内容。</p>
    </>}
  </section>;
}
