import {useMemo,useState} from "react";
import type {BrowserJournal} from "./network-journal";
import type {AccessAudit} from "./server-access-log";
import {correlateSiteEvidence,exportCorrelationSummary} from "./security-evidence-correlation";
import {downloadDiagnosticText} from "./diagnostic-export";
import "./security-correlation.css";

type Props={browser:BrowserJournal|null;server:AccessAudit|null};
const time=(ms:number|null)=>ms===null?"—":new Date(ms).toLocaleString();
export default function EvidenceCorrelationWorkbench({browser,server}:Props){
  const [selectedHost,setSelectedHost]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [message,setMessage]=useState("");
  const hosts=useMemo(()=>Array.from(new Set((browser?.events||[]).map(e=>e.host))).sort(),[browser]);
  const validHost=hosts.includes(selectedHost);
  const result=useMemo(()=>{
    if(!browser||!server||!validHost||!confirmed)return null;
    try{return correlateSiteEvidence(browser,server,selectedHost);}catch{return null;}
  },[browser,server,selectedHost,validHost,confirmed]);
  function exportResult(){
    if(!result)return;
    const summary=exportCorrelationSummary(result);
    downloadDiagnosticText(JSON.stringify(summary,null,2),
      "openguin-correlation-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",
      "application/json;charset=utf-8");
    setMessage("已请求导出。报告只包含聚合统计和按天摘要，不含原始访问日志或分钟级逐条时间线。");
  }
  const interesting=result?.minutes.filter(x=>x.browserIssue||x.serverIssue)||[];
  return <section className="v07-card security-correlation">
    <div className="correlation-head">
      <div><span className="eyebrow">WHITE-HAT DEFENSE · LOCAL EVIDENCE TRIAGE</span>
        <h3>跨来源事件关联 · Evidence Correlator</h3>
        <p>将已导入的浏览器事件与自有服务器访问日志按 UTC 分钟对照。只比较观测信号，不进行攻击测试，也不声称同一分钟的事件必然属于同一请求。</p>
      </div>
      <span className="correlation-local">本机 · 只读</span>
    </div>
    <div className="correlation-sources">
      <span>浏览器日志：<b>{browser?browser.events.length+" 条已导入":"未导入"}</b></span>
      <span>服务器访问日志：<b>{server?server.parsedLines+" 行已解析":"未导入"}</b></span>
    </div>
    {(!browser||!server)&&<p className="correlation-hint">先在本页上方导入 Browser Journal JSON 和对应站点的 Apache/Nginx 访问日志，才能进行关联。</p>}
    {browser&&server&&<>
      <label className="correlation-select">选择对应的浏览器域名
        <select value={selectedHost} onChange={e=>{setSelectedHost(e.target.value);setConfirmed(false);setMessage("");}}>
          <option value="">请选择要对照的网站</option>
          {hosts.map(h=><option key={h} value={h}>{h}</option>)}
        </select>
      </label>
      <label className="correlation-confirm"><input type="checkbox" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);setMessage("");}}/>
        <span>我确认所选域名与这份服务器访问日志来自我有权检查的同一网站或服务；两套记录的时间可能存在偏差。</span>
      </label>
      {!result&&<p className="correlation-hint">需要明确选择域名并确认对应关系，避免把不同网站的事件错误关联。</p>}
      {result&&<>
        <div className="correlation-stats">
          <div><small>浏览器该站事件</small><b>{result.sourceBrowserEvents}</b></div>
          <div><small>服务器解析请求</small><b>{result.sourceServerRequests}</b></div>
          <div><small>两侧均有记录的分钟</small><b>{result.jointlyObservedMinutes}</b></div>
          <div><small>双方同分钟出现故障信号</small><b>{result.bothIssueMinutes}</b></div>
          <div><small>仅浏览器有故障信号</small><b>{result.browserOnlyIssueMinutes}</b></div>
          <div><small>仅服务器有故障信号</small><b>{result.serverOnlyIssueMinutes}</b></div>
        </div>
        <p className="correlation-hint">对照时间：{time(result.firstMinute)} — {time(result.lastMinute)}。表中“故障信号”仅指监测到的 5xx、传输错误、停滞或服务器 429，不能作为漏洞、入侵或攻击的判定。</p>
        <div className="correlation-table-wrap"><table><thead><tr><th>日期 UTC</th><th>浏览器事件</th><th>浏览器异常分钟</th><th>服务器请求</th><th>服务器异常分钟</th><th>共同观测分钟</th></tr></thead><tbody>
          {result.days.map(x=><tr key={x.day}><td>{x.day}</td><td>{x.browserEvents}</td><td>{x.browserIssues}</td>
            <td>{x.serverRequests}</td><td>{x.serverIssues}</td><td>{x.coObservedMinutes}</td></tr>)}
        </tbody></table></div>
        <button onClick={()=>setExpanded(x=>!x)}>{expanded?"收起异常分钟":"查看异常分钟（本地） · "+interesting.length+" 个时间窗口"}</button>
        {expanded&&<div className="correlation-table-wrap correlation-details"><table><thead><tr>
          <th>本地时间</th><th>浏览器 5xx</th><th>浏览器传输错误</th><th>停滞</th>
          <th>服务器请求</th><th>服务器 5xx</th><th>服务器 429</th>
        </tr></thead><tbody>{interesting.slice(0,150).map(x=><tr key={x.minute}>
          <td>{time(x.minute)}</td><td>{x.browserHttp5xx}</td><td>{x.browserTransportErrors}</td>
          <td>{x.browserStalls}</td><td>{x.serverRequests}</td><td>{x.serverHttp5xx}</td><td>{x.serverHttp429}</td>
        </tr>)}</tbody></table>
        {interesting.length>150&&<p className="correlation-hint">仅显示前 150 个异常分钟；聚合导出仍包含所有日期统计。</p>}</div>}
        <button onClick={exportResult}>下载脱敏关联报告 JSON</button>
        {message&&<p className="correlation-hint" role="status">{message}</p>}
        <details><summary>关联分析限制</summary>{result.caveats.map((c,i)=><p className="correlation-hint" key={i}>{c}</p>)}</details>
      </>}
    </>}
  </section>;
}
