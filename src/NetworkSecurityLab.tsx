import {useMemo,useState} from "react";
import type {BrowserReport} from "./browser-diagnostics";
import {buildNetworkSecurityReview,buildSecurityReviewExport,securityReviewCsv,type ReviewLevel} from "./network-security-analysis";
import "./network-security-lab.css";

type VpnSample={label:"on"|"off";at?:string;vpnLikely?:boolean;avgResponseMs:number|null;downloadMbps:number|null;uploadMbps:number|null};
type NetworkSnapshot={dns:Array<{resolved:boolean}>;endpoints:Array<{reachable:boolean}>;route?:{defaultInterface?:string|null;vpnLikely?:boolean;vpnInterfaces?:string[]}};
type Props={report:BrowserReport;vpnSamples:VpnSample[];networkSnapshot:NetworkSnapshot|null};

const date=(n:number|null)=>n===null?"—":new Date(n).toLocaleString();
const ms=(n:number|null)=>n===null?"—":n.toLocaleString()+" ms";
const labels:Record<ReviewLevel,string>={warning:"异常",notice:"注意",info:"信息"};
function downloadFile(filename:string,text:string,mime:string){
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const a=document.createElement("a");a.href=url;a.download=filename;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function NetworkSecurityLab({report,vpnSamples,networkSnapshot}:Props){
  const review=useMemo(()=>buildNetworkSecurityReview(report),[report]);
  const [hostFilter,setHostFilter]=useState("all");
  const [levelFilter,setLevelFilter]=useState<"all"|ReviewLevel>("all");
  const [category,setCategory]=useState("all");
  const [showLimit,setShowLimit]=useState(40);
  const [notice,setNotice]=useState("");
  const matches=useMemo(()=>review.timeline.filter(e=>
    (hostFilter==="all"||e.host===hostFilter) &&
    (levelFilter==="all"||e.level===levelFilter) &&
    (category==="all"||e.category===category)
  ).reverse(),[review,hostFilter,levelFilter,category]);
  const vmax=Math.max(1,...review.buckets.map(x=>x.events));
  const categories=["all","http","connectivity","rendering","download","activity"];
  const vpnOn=vpnSamples.find(s=>s.label==="on"),vpnOff=vpnSamples.find(s=>s.label==="off");
  async function copyShareReport(){
    try{
      await navigator.clipboard.writeText(JSON.stringify(buildSecurityReviewExport(review),null,2));
      setNotice("已复制不含 URL 路径和请求 ID 的本地安全分析报告。");
    }catch{setNotice("无法访问剪贴板，请使用 JSON 下载。");}
  }
  function exportReport(format:"json"|"csv"){
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    if(format==="json"){
      downloadFile("openguin-security-review-"+stamp+".json",JSON.stringify(buildSecurityReviewExport(review),null,2),"application/json;charset=utf-8");
    }else{
      downloadFile("openguin-security-review-"+stamp+".csv",securityReviewCsv(review),"text/csv;charset=utf-8");
    }
    setNotice("报告已发起本地下载；没有自动上传。");
  }
  return <section className="network-security-lab" aria-label="Network and security analysis">
    <header className="nsl-heading">
      <div><span className="nsl-eyebrow">NETWORK & SECURITY LAB / PASSIVE FORENSICS</span>
        <h4>网络安全实验室 · 网站事件审计</h4>
        <p>只分析你主动采集并导入的事件。按网站、异常类型和分钟时间线关联，适合排查网页故障及保存诊断证据。</p>
      </div>
      <span className="nsl-local">本地分析 · 无后台上传</span>
    </header>
    <div className="nsl-metrics">
      <div><span>事件总数</span><strong>{review.totalEvents}</strong><small>{review.hostCount} 个域名</small></div>
      <div><span>需要排查</span><strong>{review.warningCount}</strong><small>{review.notices} 条注意信号</small></div>
      <div><span>HTTP 响应</span><strong>{review.responseCount}</strong><small>{review.httpErrorCount} 个 4xx/5xx</small></div>
      <div><span>响应 P95</span><strong>{ms(review.p95ResponseMs)}</strong><small>中位数 {ms(review.medianResponseMs)}</small></div>
      <div><span>传输异常</span><strong>{review.transportErrorCount}</strong><small>{review.requestStallCount} 个停滞信号</small></div>
      <div><span>下载 / 页面问题</span><strong>{review.downloadIssueCount} / {review.renderIssueCount}</strong><small>分别统计，不等于攻击</small></div>
    </div>
    <div className="nsl-meta">
      <span>采集开始：{date(review.firstAt)}</span>
      <span>采集结束：{date(review.lastAt)}</span>
      <span>保留状态：{review.captureLimited?"存在容量截断":"未报告容量截断"}</span>
    </div>
    <div className="nsl-columns">
      <section className="nsl-subpanel">
        <h5>分钟级事件分布</h5>
        {review.buckets.length===0?<p>无有效事件。</p>:<div className="nsl-bars" aria-label="Number of events by minute">
          {review.buckets.slice(-24).map(x=><div key={x.minute} className="nsl-barrow">
            <time>{new Date(x.minute).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</time>
            <div className="nsl-track"><i style={{width:Math.max(2,x.events/vmax*100)+"%"}}/></div>
            <b>{x.events}</b><small>{x.warnings} 异常</small>
          </div>)}
        </div>}
        {review.buckets.length>24&&<small>图中显示最后 24 个有事件的分钟段，完整数据包含在报告中。</small>}
      </section>
      <section className="nsl-subpanel">
        <h5>DNS · HTTPS · VPN 对照</h5>
        <div className="nsl-netgrid">
          <span>DNS 解析成功</span><b>{networkSnapshot?networkSnapshot.dns.filter(x=>x.resolved).length+"/"+networkSnapshot.dns.length:"未测试"}</b>
          <span>HTTPS 检查成功</span><b>{networkSnapshot?networkSnapshot.endpoints.filter(x=>x.reachable).length+"/"+networkSnapshot.endpoints.length:"未测试"}</b>
          <span>默认接口</span><b>{networkSnapshot?.route?.defaultInterface||"未知"}</b>
          <span>VPN 信号</span><b>{networkSnapshot?.route?.vpnLikely?"可能存在隧道":"未确认隧道"}</b>
          <span>VPN-on 样本</span><b>{vpnOn?.avgResponseMs==null?"未记录":ms(vpnOn.avgResponseMs)}</b>
          <span>VPN-off 样本</span><b>{vpnOff?.avgResponseMs==null?"未记录":ms(vpnOff.avgResponseMs)}</b>
        </div>
        <p className="nsl-caution">VPN 状态是路径信号与手动标签，无法证明某个网页请求经过 VPN。不同时间的样本不可直接归因为 VPN 效果。</p>
      </section>
    </div>
    <section className="nsl-subpanel">
      <h5>网站健康与请求端点概览</h5>
      <div className="nsl-tablewrap"><table><thead><tr><th>域名</th><th>请求开始</th><th>响应</th><th>HTTP 错误</th><th>传输错误</th><th>停滞</th><th>P95</th></tr></thead>
        <tbody>{review.hosts.map(h=><tr key={h.host}><td>{h.host}</td><td>{h.requestsStarted}</td><td>{h.responses}</td>
          <td>{h.httpErrors}</td><td>{h.transportErrors}</td><td>{h.stalls}</td><td>{ms(h.p95Ms)}</td></tr>)}</tbody></table></div>
      <p className="nsl-caution">开始、响应、错误可能来自同一请求的多个事件，不能简单相加当作总请求数。</p>
    </section>
    <section className="nsl-subpanel">
      <div className="nsl-heading nsl-eventhead"><div><h5>完整已采集事件日志</h5><p>支持筛选、逐条查看与导出；不是浏览器全部流量或网络数据包。</p></div><b>{matches.length} 条匹配</b></div>
      <div className="nsl-filters">
        <label>域名<select value={hostFilter} onChange={e=>{setHostFilter(e.target.value);setShowLimit(40);}}>
          <option value="all">全部域名</option>{review.hosts.map(h=><option key={h.host} value={h.host}>{h.host}</option>)}
        </select></label>
        <label>严重程度<select value={levelFilter} onChange={e=>{setLevelFilter(e.target.value as typeof levelFilter);setShowLimit(40);}}>
          <option value="all">全部</option><option value="warning">异常</option><option value="notice">注意</option><option value="info">信息</option>
        </select></label>
        <label>事件类别<select value={category} onChange={e=>{setCategory(e.target.value);setShowLimit(40);}}>
          {categories.map(x=><option key={x} value={x}>{x==="all"?"全部":x}</option>)}
        </select></label>
      </div>
      <div className="nsl-events" role="log" aria-label="Captured network event timeline">
        {matches.slice(0,showLimit).map((e,i)=><article className={"nsl-event "+e.level} key={e.at+"-"+e.kind+"-"+i}>
          <time>{new Date(e.at).toLocaleString()}</time><b>{labels[e.level]} · {e.kind}</b>
          <span>{e.host}{e.status!==null?" · HTTP "+e.status:""}{e.durationMs!==null?" · "+ms(e.durationMs):""}</span>
          <small>{e.explanation}</small>
        </article>)}
        {matches.length===0&&<p className="nsl-caution">没有匹配的事件，请调整筛选条件。</p>}
      </div>
      {showLimit<matches.length&&<button onClick={()=>setShowLimit(x=>x+40)}>加载更多（还剩 {matches.length-showLimit} 条）</button>}
    </section>
    <div className="nsl-actions">
      <button onClick={()=>void copyShareReport()}>复制安全分析 JSON</button>
      <button onClick={()=>exportReport("json")}>下载完整安全分析 JSON</button>
      <button onClick={()=>exportReport("csv")}>下载事件 CSV 日志</button>
    </div>
    {notice&&<p className="nsl-status" role="status">{notice}</p>}
    <p className="nsl-caution">报告会包含访问过的域名和访问时间，分享前仍需检查。CSV/JSON 不包含页面内容、Cookie、认证令牌、完整 URL、下载文件名或请求正文；HTTP 403/429 和错误事件并不代表发现攻击。</p>
  </section>;
}
