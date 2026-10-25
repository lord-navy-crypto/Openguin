import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, ClipboardCopy, Clock3, Gauge, Globe2, HardDrive, Laptop2, LoaderCircle, Network, Radar, RotateCw, ShieldCheck, Wifi, XCircle } from "lucide-react";
import type { OneClickResult, TargetResult } from "./network-one-click";
import { analyzeNetworkHistory, type NetworkHistoryEntry } from "./network-history";
import "./one-click-network.css";

type Stage = "idle"|"connecting"|"speed"|"completed";
type SpeedInfo={
  latencyMs?:number|null; jitterMs?:number|null; downloadMbps?:number|null; uploadMbps?:number|null;
  probeSamples?:Array<{elapsedMs:number;success:boolean;status?:number|null}>;
};
type Props={
  result:OneClickResult|null;busy:boolean;stage:Stage;history:NetworkHistoryEntry[];
  speedTest:SpeedInfo|null;repeatBusy:boolean;repeatProgress:number;
  onRepeat:()=>void;onStopRepeat:()=>void;onClearHistory:()=>void;
  onRun:()=>void;onCopy:()=>void;
};
const stageLabel:Record<Stage,string>={
  idle:"等待检测",connecting:"正在检查 DNS / HTTPS / 网络配置",
  speed:"正在测量 HTTP 稳定性与传输速度",completed:"本轮检查已结束"
};
const tone:Record<OneClickResult["verdict"],{label:string;hint:string}>={
  "no-clear-problem":{label:"采样正常",hint:"受测服务未见明确异常；如果网页仍卡顿，请进一步分析浏览器事件。"},
  "network-failure":{label:"重点异常",hint:"DNS 与 HTTPS 同时出现异常，优先检查网络连接和代理配置。"},
  "connection-problem":{label:"连接异常",hint:"部分连接无法顺利建立；先看下方目标域名的具体结果。"},
  "service-response":{label:"服务响应异常",hint:"服务器已回复 HTTP 状态；请区分访问权限和真正的网络中断。"},
  "slow-or-unstable":{label:"稳定性异常",hint:"发现延迟、波动或传输问题线索；建议多次对照验证。"},
  incomplete:{label:"检测未完成",hint:"无法获取足够的本机网络证据，请重试或检查应用网络权限。"}
};
const money=(value?:number|null,unit="Mbps")=>typeof value==="number"&&Number.isFinite(value)?value.toFixed(1)+" "+unit:"未检测";
const targetState=(t:TargetResult)=>{
  if(t.symptom==="dns")return ["解析失败","bad"] as const;
  if(t.symptom==="transport")return ["连接失败","bad"] as const;
  if(t.symptom==="rejection")return ["受限响应","warn"] as const;
  if(t.symptom==="server")return ["服务错误","warn"] as const;
  if(t.symptom==="ok")return ["已有响应","good"] as const;
  return ["仅检查 DNS","neutral"] as const;
};
export default function OneClickNetworkPanel({
  result,busy,stage,history,speedTest,repeatBusy,repeatProgress,
  onRepeat,onStopRepeat,onClearHistory,onRun,onCopy
}:Props){
  const findings=result?.issues.filter(x=>x.severity!=="info")||[];
  const trend=analyzeNetworkHistory(history);
  const current=result?tone[result.verdict]:null;
  const samples=speedTest?.probeSamples?.slice(0,12)||[];
  const maxSample=Math.max(1,...samples.map(sample=>sample.elapsedMs));
  return <section className="v07-card one-click-network" aria-label="电脑网络体检">
    <div className="doctor-hero">
      <div className="doctor-hero-copy">
        <div className="doctor-eyebrow"><Radar size={15}/><span>OPENGUIN NETWORK DOCTOR</span><span className="doctor-local-tag"><ShieldCheck size={12}/>本机运行</span></div>
        <h2>电脑网络体检</h2>
        <p>不需要启动 AI 模型。自动检测 DNS、HTTPS、VPN 与代理线索、网络测速，帮你判断网页加载失败或下载卡顿可能出现在哪一步。</p>
        <div className="doctor-main-actions">
          <button type="button" className="doctor-start" onClick={onRun} disabled={busy} aria-busy={busy&&!repeatBusy}>
            {busy&&!repeatBusy?<LoaderCircle size={19} className="doctor-spin"/>:<Activity size={19}/>}
            {busy&&!repeatBusy?"正在检测…":result?"重新全面检测":"开始一键全面检测"}
            {!busy&&<ArrowUpRight size={16}/>}
          </button>
          {repeatBusy?
            <button type="button" className="doctor-secondary" onClick={onStopRepeat}>结束本轮后停止 · {repeatProgress}/3</button>:
            <button type="button" className="doctor-secondary" disabled={busy} onClick={onRepeat}><RotateCw size={15}/>三次轻量复测</button>}
        </div>
        <div className="doctor-consent"><ShieldCheck size={13}/>仅点击后连接测试端点，不修改系统网络设置，不读取文件或聊天内容。全面测速预计下载约 10 MB、上传约 3 MiB；轻量复测不测速。</div>
      </div>
      <div className="doctor-orb-wrap" aria-live="polite" role="status">
        <div className={"doctor-orb "+(busy?"scanning":result?"verdict-"+result.verdict:"waiting")}>
          {busy?<LoaderCircle className="doctor-spin" size={42}/>:
            result?.verdict==="no-clear-problem"?<CheckCircle2 size={42}/>:
            result?.verdict==="network-failure"||result?.verdict==="connection-problem"?<XCircle size={42}/>:
            result?<AlertTriangle size={42}/>:<Laptop2 size={42}/>}
          <strong>{busy?"检测中":current?.label||"准备就绪"}</strong>
          <small>{busy?stage==="speed"?"正在测速":"正在连接":result?new Date(result.at).toLocaleTimeString():"等待开始"}</small>
        </div>
        <span className="doctor-orb-note">{busy?stageLabel[stage]:result?"点击重新检测以更新诊断":"点击按钮检查当前电脑连接"}</span>
      </div>
    </div>

    <div className="doctor-progress" aria-live="polite">
      {[
        {title:"DNS / HTTPS",subtitle:"域名及连接",done:stage==="speed"||stage==="completed",active:stage==="connecting",Icon:Globe2},
        {title:"测速与波动",subtitle:"HTTP、上下行",done:stage==="completed",active:stage==="speed",Icon:Gauge},
        {title:"生成诊断",subtitle:"原因及建议",done:stage==="completed",active:false,Icon:ClipboardCopy}
      ].map((s,i)=><div key={s.title} className={"doctor-progress-step "+(s.done?"done":s.active?"active":"pending")}>
        <div className="doctor-progress-icon"><s.Icon size={18}/></div>
        <div><b>{i+1}. {s.title}</b><small>{s.subtitle}</small></div>
        {s.done&&<CheckCircle2 size={15} className="doctor-progress-check"/>}
      </div>)}
    </div>

    {busy&&<div className="doctor-running" role="status"><LoaderCircle size={17} className="doctor-spin"/>{stageLabel[stage]}。检测结果仅在完成相应步骤后显示。</div>}

    {!result&&!busy&&<div className="doctor-empty">
      <div><Wifi size={21}/><b>打开就能检测</b><small>无需终端指令、额外账号或运行 Ollama。</small></div>
      <div><Network size={21}/><b>定位连接阶段</b><small>分清 DNS 失败、连接超时及 HTTP 访问受限。</small></div>
      <div><HardDrive size={21}/><b>结合浏览器证据</b><small>遇到页面渲染或下载故障，还可以导入扩展报告。</small></div>
    </div>}

    {result&&<div className="doctor-report">
      <div className={"doctor-verdict verdict-"+result.verdict} role="status">
        <div className="doctor-verdict-icon">{result.verdict==="no-clear-problem"?<CheckCircle2 size={23}/>:<AlertTriangle size={23}/>}</div>
        <div><span>本轮检测结论 · {current?.label}</span><h3>{result.headline}</h3><p>{current?.hint}</p></div>
        <button type="button" onClick={onCopy}><ClipboardCopy size={15}/>复制报告</button>
      </div>
      <div className="doctor-kpis">
        <div className="doctor-kpi"><Globe2 size={17}/><span>DNS 成功</span><strong>{result.checked.dnsPassed} <small>/ {result.checked.dns}</small></strong></div>
        <div className="doctor-kpi"><ShieldCheck size={17}/><span>HTTPS 已响应</span><strong>{result.checked.httpsResponded} <small>/ {result.checked.https}</small></strong></div>
        <div className="doctor-kpi"><Gauge size={17}/><span>下载测速</span><strong className="doctor-kpi-speed">{money(speedTest?.downloadMbps)}</strong></div>
        <div className="doctor-kpi"><Activity size={17}/><span>HTTP 平均延迟</span><strong className="doctor-kpi-speed">{money(speedTest?.latencyMs,"ms")}</strong></div>
      </div>
      <div className="doctor-two-cols">
        <section className="doctor-targets"><div className="doctor-section-header"><h4><Globe2 size={17}/>网站连接检测</h4><small>逐个定位</small></div>
          {result.targets.length===0?<p className="doctor-muted">暂未取得目标网站的有效检测结果。</p>:
            result.targets.map(t=>{
              const [label,kind]=targetState(t);
              return <div className="doctor-target" key={t.host}>
                <span className={"doctor-target-indicator "+kind}>{kind==="good"?<CheckCircle2 size={16}/>:kind==="neutral"?<Clock3 size={16}/>:<AlertTriangle size={16}/>}</span>
                <div className="doctor-target-name"><b>{t.label}</b><small>{t.host}</small></div>
                <div className="doctor-target-outcome"><b className={kind}>{label}</b><small>{t.status!==null?"HTTP "+t.status+" · ":""}{t.elapsedMs!==null?Math.round(t.elapsedMs)+" ms":"—"} </small></div>
              </div>;
            })}
          <small className="doctor-footnote">HTTP 401/403/429 说明服务器已有响应，不代表断网。</small>
        </section>
        <section className="doctor-fixes"><div className="doctor-section-header"><h4><ShieldCheck size={17}/>优先排查建议</h4><small>{findings.length} 项线索</small></div>
          {!findings.length?<div className="doctor-okay"><CheckCircle2 size={25}/><b>暂无明确异常</b><p>如果某个网页仍然无法正常使用，请在问题出现时再测一次，或导入浏览器事件报告。</p></div>:
            findings.slice(0,4).map((finding,i)=><article className={"doctor-fix "+finding.severity} key={finding.code}>
              <b>{i+1}. {finding.title}</b><p>{finding.evidence}</p><span>建议：{finding.action}</span>
            </article>)}
          {findings.length>4&&<details className="doctor-more"><summary>查看另外 {findings.length-4} 项异常线索</summary>
            {findings.slice(4).map(f=><article className={"doctor-fix "+f.severity} key={f.code}><b>{f.title}</b><p>{f.evidence}</p><span>{f.action}</span></article>)}
          </details>}
        </section>
      </div>

      {result.stability&&<section className="doctor-stability">
        <div className="doctor-section-header"><h4><Activity size={17}/>请求稳定性图</h4><small>{result.stability.passed}/{result.stability.total} 次 HTTP 探测成功</small></div>
        <div className="doctor-stability-grid">
          <div className="doctor-sample-bars">
            {samples.map((sample,i)=><div className="doctor-sample-row" key={i}>
              <span>{i+1}</span><div className="doctor-sample-track" aria-label={"第"+(i+1)+"次 HTTP 探测耗时 "+Math.round(sample.elapsedMs)+"毫秒"}><i className={sample.success?"success":"failure"} style={{width:Math.max(3,Math.min(100,sample.elapsedMs/maxSample*100))+"%"}}/></div><b>{sample.success?Math.round(sample.elapsedMs)+" ms":"失败"}</b>
            </div>)}
          </div>
          <div className="doctor-sample-summary">
            <div><small>最快 / 中位 / 最慢</small><b>{[result.stability.minMs,result.stability.medianMs,result.stability.maxMs].map(x=>x===null?"—":Math.round(x)+"ms").join(" / ")}</b></div>
            <div><small>HTTP 非成功响应 / 传输失败</small><b>{result.stability.httpRejected} / {result.stability.transportFailed}</b></div>
            <div><small>上传 / HTTP 耗时波动</small><b>{money(speedTest?.uploadMbps)} / {money(speedTest?.jitterMs,"ms")}</b></div>
          </div>
        </div>
        <small className="doctor-footnote">图形长度只用于比较同一轮 HTTP 请求耗时，并非 ICMP Ping、系统丢包率或网站整体质量评级。</small>
      </section>}
      {result.issues.some(x=>x.severity==="info")&&<p className="doctor-footnote">环境线索：{result.issues.filter(x=>x.severity==="info").map(x=>x.title).join("；")}。不能仅凭网络接口推断 VPN 实际转发路径。</p>}
      {result.notes.length>0&&<p className="doctor-footnote">{result.notes.join(" ")}</p>}
    </div>}

    <section className="doctor-history">
      <div className="doctor-section-header"><h4><Clock3 size={17}/>检测记录和间歇性故障</h4><span>{history.length} / 12 次</span></div>
      {history.length===0?<p className="doctor-muted">完成首次检测后，这里会显示本机保存的结果摘要。重复检测可识别部分间歇性故障。</p>:<>
        <div className="doctor-history-track" aria-label="历史网络检测状态">
          {history.slice().reverse().map((e,i)=><div key={e.at+"-"+i} className={"history-"+e.verdict} title={new Date(e.at).toLocaleString()+" · "+e.verdict}>
            <small>{new Date(e.at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small>
            <span>{e.verdict==="no-clear-problem"?"正常":e.verdict==="incomplete"?"未知":"异常"}</span>
          </div>)}
        </div>
        <p className="doctor-muted">{trend.note}</p>
        {!!trend.trends.length&&<div className="doctor-trends">{trend.trends.map(t=><div className={"doctor-trend "+t.state} key={t.host}>
          <b>{t.host}</b><strong>{t.caption}</strong><small>{t.passed}/{t.count} 次通过 · {t.details}</small>
        </div>)}</div>}
        <button type="button" className="doctor-history-clear" onClick={onClearHistory} disabled={busy}>清除本地检测记录</button>
      </>}
    </section>
    <div className="doctor-footer"><span><ShieldCheck size={14}/>数据默认只保存在这台电脑上。不会自动修改 VPN、DNS 或代理。</span><span>更详细的网络、浏览器和 VPN 对比见下方高级诊断。</span></div>
  </section>;
}
