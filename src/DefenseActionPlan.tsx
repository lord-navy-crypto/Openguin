import {useMemo,useState} from "react";
import type {HeaderAudit} from "./defensive-header-audit";
import type {BrowserJournal} from "./network-journal";
import type {AccessAudit} from "./server-access-log";
import {buildDefenseActionPlan,exportDefenseActionPlan} from "./defense-action-plan";
import {downloadDiagnosticText} from "./diagnostic-export";
import "./defense-action-plan.css";

const kinds={investigate:"需要排查",verify:"建议核对",improve:"配置改进"};
export default function DefenseActionPlan({
  headers,server,browser
}:{headers:HeaderAudit|null;server:AccessAudit|null;browser:BrowserJournal|null}){
  const actions=useMemo(()=>buildDefenseActionPlan(headers,server,browser),[headers,server,browser]);
  const [completed,setCompleted]=useState<string[]>([]);
  const [filter,setFilter]=useState("all");
  const shown=actions.filter(a=>filter==="all"||a.topic===filter);
  function exportReport(){
    const payload=exportDefenseActionPlan(actions);
    downloadDiagnosticText(JSON.stringify(payload,null,2),
      "openguin-defense-plan-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",
      "application/json;charset=utf-8");
  }
  return <section className="v07-card defense-action-plan">
    <span className="eyebrow">WHITE-HAT DEFENSE · ACTIONABLE REMEDIATION</span>
    <h3>证据驱动的安全修复清单 · Defensive Action Plan</h3>
    <p>根据上面已导入的响应头、浏览器日志与服务器访问日志，提出下一步检查项目。每项都包含证据与局限，不把 HTTP 错误或日志流量解释成攻击。</p>
    <div className="defense-plan-summary">
      <span>检查建议 <b>{actions.length}</b></span>
      <span>本次会话已标记 <b>{actions.filter(x=>completed.includes(x.id)).length}</b></span>
      <span>数据来源 <b>{Number(!!headers)+Number(!!server)+Number(!!browser)}/3</b></span>
    </div>
    <div className="defense-plan-actions">
      <label>筛选类别<select value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="all">全部</option><option value="configuration">配置</option>
        <option value="reliability">可靠性</option><option value="observability">监测质量</option>
      </select></label>
      <button disabled={!actions.length} onClick={exportReport}>导出防御修复计划 JSON</button>
      <button disabled={!completed.length} onClick={()=>setCompleted([])}>清除完成标记</button>
    </div>
    {!headers&&!server&&!browser&&<p className="defense-plan-note">导入至少一份本地防御证据后，自动生成可执行的修复与检查清单。</p>}
    {(headers||server||browser)&&!actions.length&&<p className="defense-plan-note">这些样本没有触发当前规则库中的复核建议。这不代表站点已经通过安全审计。</p>}
    <div className="defense-plan-items">
      {shown.map(a=><article key={a.id}>
        <label><input type="checkbox" checked={completed.includes(a.id)} onChange={e=>setCompleted(prev=>
          e.target.checked?[...prev.filter(x=>x!==a.id),a.id]:prev.filter(x=>x!==a.id)
        )}/><span><small>{kinds[a.priority]} · {a.topic}</small><strong>{a.title}</strong></span></label>
        <p>{a.evidence}</p>
        <p><b>下一步：</b>{a.nextStep}</p>
        <small>{a.caveat}</small>
      </article>)}
    </div>
    <small>完成标记只存在于本次页面会话；导出仅包含规则说明与聚合证据，不包含源文件内容，也不包含完成状态或原始用户事件。</small>
  </section>;
}
