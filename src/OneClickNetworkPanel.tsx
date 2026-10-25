import type { OneClickResult } from "./network-one-click";
import { analyzeNetworkHistory, type NetworkHistoryEntry } from "./network-history";
import "./one-click-network.css";

type Stage = "idle"|"connecting"|"speed"|"completed";
type Props={result:OneClickResult|null;busy:boolean;stage:Stage;history:NetworkHistoryEntry[];onClearHistory:()=>void;onRun:()=>void;onCopy:()=>void};
const statusText:Record<Stage,string>={
  idle:"尚未检测",connecting:"正在检查 DNS、HTTPS、代理和 VPN 路由",
  speed:"连接检查结束，正在采样 Cloudflare HTTP 延迟、下载和上传",
  completed:"本轮检测完成"
};
export default function OneClickNetworkPanel({result,busy,stage,history,onClearHistory,onRun,onCopy}:Props){
  const issues=result?.issues.filter(x=>x.severity!=="info")||[];
  const historyAnalysis=analyzeNetworkHistory(history);
  return <section className="v07-card one-click-network">
    <div className="one-click-network-head">
      <div><span className="eyebrow">AUTOMATED NETWORK DIAGNOSIS</span>
        <h2>一键检测网络与网页连接</h2>
        <p>自动完成 DNS → HTTPS → VPN/代理线索 → 有界测速 → 故障分类。报告明确区分观察到的证据和推测原因。</p>
      </div>
      <button className="one-click-primary" disabled={busy} onClick={onRun}>
        {busy?"检测中…":result?"重新一键检测":"开始一键检测"}
      </button>
    </div>
    <div className="one-click-stages" aria-live="polite">
      <span className={stage==="connecting"?"active":stage==="speed"||stage==="completed"?"done":""}>1 · DNS/HTTPS</span>
      <span className={stage==="speed"?"active":stage==="completed"?"done":""}>2 · 测速与延迟</span>
      <span className={stage==="completed"?"done":""}>3 · 故障总结</span>
      <b>{statusText[stage]}</b>
    </div>
    <small className="one-click-consent">一键检测会访问测试网站，预设下载约 10 MB、上传约 3 MiB 的测试数据（另有少量 DNS/HTTP 请求开销）；仅在点击后执行，不更改 VPN/DNS/代理，不采集聊天正文。测速结果受网络和提供方影响。</small>
    {history.length>0&&<section className="one-click-history">
      <div className="one-click-history-head">
        <div><h4>连续检测与间歇性故障</h4>
          <small>本地保留最多 12 次手动检测摘要，24 小时后自动忽略过期记录。</small>
        </div>
        <button disabled={busy} onClick={onClearHistory}>清除检测历史</button>
      </div>
      <div className="one-click-history-bar" aria-label="最近检测结论">
        {history.slice().reverse().map((entry,i)=><div key={entry.at+"-"+i}
          className={"history-result "+entry.verdict}
          title={new Date(entry.at).toLocaleString()+" · "+entry.verdict}>
          <span>{entry.verdict==="no-clear-problem"?"正常线索":entry.verdict==="incomplete"?"未完成":"发现异常"}</span>
        </div>)}
      </div>
      <p className="one-click-history-note">{historyAnalysis.note}</p>
      {historyAnalysis.trends.length>0&&<div className="one-click-trend-grid">
        {historyAnalysis.trends.map(trend=><article key={trend.host}
          className={"one-click-trend "+trend.state}>
          <div><b>{trend.host}</b><span>{trend.caption}</span></div>
          <p>{trend.passed}/{trend.count} 次通过 · {trend.failed} 次异常</p>
          <small>{trend.details}</small>
        </article>)}
      </div>}
    </section>}
    {result&&<div className="one-click-result">
      <div className={"one-click-verdict "+result.verdict}>
        <span>当前检查结论</span>
        <strong>{result.headline}</strong>
        <small>{new Date(result.at).toLocaleString()} · 这是概率性定位，不是确定性故障归因。</small>
      </div>
      <div className="one-click-metrics">
        <div><span>DNS 通过</span><b>{result.checked.dnsPassed} / {result.checked.dns}</b></div>
        <div><span>HTTPS 响应</span><b>{result.checked.httpsResponded} / {result.checked.https}</b></div>
        <div><span>值得处理的线索</span><b>{issues.length}</b></div>
        <div><span>测速检查</span><b>{result.checked.speedAttempted?"已运行":"未运行"}</b></div>
      </div>
      {result.targets.length>0&&<div className="one-click-targets">
        <h4>逐个域名定位</h4>
        <div className="one-click-target-grid">
          {result.targets.map(t=><div key={t.host} className={"one-click-target "+t.symptom}>
            <div><b>{t.label}</b><small>{t.host}</small></div>
            <p>DNS：{t.dns==="ok"?"解析成功":t.dns==="failed"?"解析失败":"未检测"} · HTTPS：{t.https==="responded"?"收到响应":t.https==="failed"?"连接失败":"未检测"}</p>
            <p>{t.status!==null?"HTTP "+t.status:"无 HTTP 状态"}{t.elapsedMs!==null?" · "+Math.round(t.elapsedMs)+"ms":""}</p>
          </div>)}
        </div>
        <p>HTTPS 已响应不代表网页功能正常；HTTP 401/403/429 与 TCP/TLS 连接失败是不同情况。</p>
      </div>}
      {result.stability&&<div className="one-click-probes" aria-label="HTTP 探测稳定性">
        <div className="one-click-probes-head"><h4>HTTP 重复采样稳定性</h4><span>{result.stability.passed}/{result.stability.total} 次成功</span></div>
        <div className="one-click-probes-metrics">
          <div><small>最快</small><b>{result.stability.minMs===null?"—":Math.round(result.stability.minMs)+" ms"}</b></div>
          <div><small>中位数</small><b>{result.stability.medianMs===null?"—":Math.round(result.stability.medianMs)+" ms"}</b></div>
          <div><small>最慢</small><b>{result.stability.maxMs===null?"—":Math.round(result.stability.maxMs)+" ms"}</b></div>
          <div><small>HTTP 非成功状态 / 传输失败</small><b>{result.stability.httpRejected} / {result.stability.transportFailed}</b></div>
        </div>
        <p>这些是同一测速服务的 HTTP 请求耗时样本，不是 ICMP Ping、真实丢包率或所有网站的稳定性证明。</p>
      </div>}
      {issues.length===0?<p className="one-click-no-issues">
        本次采样没有发现明确的连接或性能问题；如果 ChatGPT 仍在加载、打字卡顿或下载失败，请在浏览器扩展中开启页面监测，再导入事件报告。
      </p>:<div className="one-click-findings">
        <h4>按优先级排查</h4>
        {issues.map((issue,i)=><article key={issue.code} className={issue.severity}>
          <div><b>{i+1}. {issue.title}</b><small>{issue.severity==="critical"?"优先处理":"建议检查"}</small></div>
          <p><b>证据：</b>{issue.evidence}</p>
          <p><b>建议：</b>{issue.action}</p>
        </article>)}
      </div>}
      {result.issues.some(x=>x.severity==="info")&&<p className="one-click-context">
        附加线索：{result.issues.filter(x=>x.severity==="info").map(x=>x.title).join("；")}。仅为配置迹象，不能据此确定 VPN 是否正在转发流量。
      </p>}
      {result.notes.length>0&&<p className="one-click-notes">{result.notes.join(" ")}</p>}
      <div className="network-actions"><button onClick={onCopy}>复制一键检测结果</button></div>
    </div>}
  </section>;
}
