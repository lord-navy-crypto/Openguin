import {useMemo,useState} from "react";
import {
  DEFAULT_POLICY,LEARNING_BASELINE,SCENARIOS,simulateDefense,compareDefensePolicies,
  exportSimulationSummary,type DefensePolicy,type SimulationScenario
} from "./local-defense-simulator";
import {downloadDiagnosticText} from "./diagnostic-export";
import "./local-defense-simulator.css";

const reasonNames={
 "none":"通过规则检查","rate-limit":"触发虚拟限流","session-expired":"会话过期",
 "role-denied":"角色权限不符","csrf-missing":"缺少状态变更验证"
};
const kindNames={browse:"页面访问",login:"登录事件",admin:"管理资源",change:"资料修改"};
const fmt=(n:number)=>n.toLocaleString("zh-CN");
export default function LocalDefenseSimulator(){
 const [scenario,setScenario]=useState<SimulationScenario>("mixed");
 const [policy,setPolicy]=useState<DefensePolicy>({...DEFAULT_POLICY});
 const [runId,setRunId]=useState(0);
 const [current,setCurrent]=useState<ReturnType<typeof simulateDefense>|null>(null);
 const [showRows,setShowRows]=useState(false);
 const [limit,setLimit]=useState(30);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const scenarioDesc=SCENARIOS.find(x=>x.id===scenario)!;
 const comparison=useMemo(()=>current?compareDefensePolicies(scenario,LEARNING_BASELINE,policy):null,
  [current,scenario,policy]);
 function setValue<K extends keyof DefensePolicy>(key:K,value:DefensePolicy[K]){
   setPolicy(p=>({...p,[key]:value}));setCurrent(null);setMessage("");setError("");
 }
 function run(){
   try{setCurrent(simulateDefense(scenario,policy));setShowRows(false);setLimit(30);
     setRunId(x=>x+1);setMessage("");setError("");
   }catch(e){setError(e instanceof Error?e.message:"模拟规则校验失败。");}
 }
 function chooseScenario(value:string){
   if(!SCENARIOS.some(x=>x.id===value))return;
   setScenario(value as SimulationScenario);setCurrent(null);setShowRows(false);setMessage("");
 }
 function exportResult(){
   if(!current)return;
   const name="openguin-defense-simulation-"+new Date().toISOString().replace(/[:.]/g,"-")+".json";
   downloadDiagnosticText(JSON.stringify(exportSimulationSummary(current),null,2),name,
      "application/json;charset=utf-8");
   setMessage("已请求下载合成事件报告；没有真实网站日志、IP 或凭据。");
 }
 const summary=current?.summary;
 return <section className="v07-card local-defense-simulator">
  <header className="sim-header">
   <div><span className="eyebrow">WHITE-HAT LAB · ISOLATED VIRTUAL WEBSITE</span>
    <h3>网站防御模拟实验室 · Virtual Web Defense Lab</h3>
    <p>这里运行一个<strong>完全虚拟的网站</strong>。你可以选择模拟的异常请求场景、修改防御规则，然后观察虚拟服务器如何判定状态码。所有事件都在内存中生成，不会连接或冲击任何真实网站。</p>
   </div><span className="sim-offline">0 次网络请求</span>
  </header>
  <div className="sim-steps">
   <span><b>01</b> 选择演练场景</span><span><b>02</b> 调整防御规则</span>
   <span><b>03</b> 运行虚拟请求</span><span><b>04</b> 分析漏拦截与误拦截</span>
  </div>
  <div className="sim-scenario-section">
   <label>虚拟网站场景
    <select value={scenario} onChange={e=>chooseScenario(e.target.value)}>
     {SCENARIOS.map(s=><option value={s.id} key={s.id}>{s.title}</option>)}
    </select>
   </label>
   <p>{scenarioDesc.description}</p>
  </div>
  <div className="sim-policy-top">
   <h4>防御策略配置</h4>
   <div className="sim-actions">
    <button onClick={()=>{setPolicy({...LEARNING_BASELINE});setCurrent(null);setMessage("");}}>加载教学对照策略</button>
    <button onClick={()=>{setPolicy({...DEFAULT_POLICY});setCurrent(null);setMessage("");}}>加载保护策略</button>
   </div>
  </div>
  <div className="sim-settings">
   <label>同一虚拟身份在窗口内的事件阈值
    <input type="number" min={1} max={60} step={1} value={policy.maxEventsPerWindow}
     onChange={e=>setValue("maxEventsPerWindow",Number(e.target.value))}/>
    <small>越小越严格，也可能拦截合法访问</small>
   </label>
   <label>统计窗口（秒）
    <input type="number" min={10} max={300} step={10} value={policy.rateWindowSeconds}
      onChange={e=>setValue("rateWindowSeconds",Number(e.target.value))}/>
    <small>只对虚拟事件进行时间窗口计算</small>
   </label>
   <label>会话最长有效期（分钟）
    <input type="number" min={1} max={720} step={1} value={policy.sessionLifetimeMinutes}
      onChange={e=>setValue("sessionLifetimeMinutes",Number(e.target.value))}/>
    <small>超过阈值的虚拟已登录会话被拒绝</small>
   </label>
  </div>
  <div className="sim-toggles">
   <label><input type="checkbox" checked={policy.enforceRoles}
     onChange={e=>setValue("enforceRoles",e.target.checked)}/><span><b>服务端角色权限验证</b><small>普通成员不可读取虚拟管理资源</small></span></label>
   <label><input type="checkbox" checked={policy.requireCsrf}
     onChange={e=>setValue("requireCsrf",e.target.checked)}/><span><b>状态变更验证信号</b><small>资料修改必须具备虚拟 CSRF 校验信号</small></span></label>
   <label><input type="checkbox" checked={policy.securityHeaders}
     onChange={e=>setValue("securityHeaders",e.target.checked)}/><span><b>启用安全响应头配置</b><small>仅作为配置覆盖提示，不模拟真实浏览器 CSP</small></span></label>
  </div>
  <div className="sim-actions sim-run-controls">
   <button className="sim-run" onClick={run}>运行虚拟防御演练</button>
   <button disabled={!summary} onClick={exportResult}>导出合成分析报告 JSON</button>
   <button disabled={!summary} onClick={()=>{setCurrent(null);setMessage("");}}>清空结果</button>
  </div>
  {error&&<p className="sim-error" role="alert">{error}</p>}
  {message&&<p className="sim-message" role="status">{message}</p>}
  {summary&&current&&<div className="sim-results" key={runId}>
   <div className="sim-summary">
    <div><span>虚拟事件</span><b>{fmt(summary.total)}</b></div>
    <div><span>实际允许</span><b>{fmt(summary.allowed)}</b></div>
    <div><span>虚拟拦截</span><b>{fmt(summary.blocked)}</b></div>
    <div><span>漏拦截</span><b>{fmt(summary.missedProtections)}</b></div>
    <div><span>误拦截</span><b>{fmt(summary.falsePositives)}</b></div>
    <div><span>判定符合预期</span><b>{fmt(summary.correctDecisions)}/{fmt(summary.total)}</b></div>
   </div>
   <div className="sim-panels">
    <div className="sim-panel">
     <h4>虚拟服务器决策</h4>
     <div className="sim-bars">
      {Object.entries(summary.byReason).map(([key,count])=><div key={key}>
       <span>{reasonNames[key as keyof typeof reasonNames]}</span>
       <div className="sim-bar-bg"><div style={{width:summary.total?count/summary.total*100+"%":"0%"}}/></div><b>{count}</b>
      </div>)}
     </div>
     <small>模拟规则先应用窗口限流，再检查会话、角色和状态变更。优先级会影响记录到的拒绝原因。</small>
    </div>
    <div className="sim-panel">
     <h4>与教学对照策略比较</h4>
     {comparison&&<div className="sim-comparison">
      <div><span>项目</span><b>教学对照</b><b>当前设置</b></div>
      <div><span>漏拦截</span><b>{comparison.previous.missedProtections}</b><b>{comparison.updated.missedProtections}</b></div>
      <div><span>误拦截</span><b>{comparison.previous.falsePositives}</b><b>{comparison.updated.falsePositives}</b></div>
      <div><span>符合预期</span><b>{comparison.previous.correctDecisions}</b><b>{comparison.updated.correctDecisions}</b></div>
     </div>}
     <p>安全响应头开关：<b>{summary.securityHeaderSignal==="enabled"?"已启用（模拟）":"未启用（模拟）"}</b></p>
     <small>教学对照不是可部署的网站配置。判断结果仅由本地固定的合成事件与预期标签产生。</small>
    </div>
   </div>
   <div className="sim-panel">
    <div className="sim-policy-top"><div><h4>虚拟请求时间线</h4><p>展示虚拟事件的预期结果和防御引擎的实际结果。</p></div>
     <button onClick={()=>setShowRows(x=>!x)}>{showRows?"隐藏请求记录":"展开虚拟请求记录"}</button>
    </div>
    {showRows&&<div className="sim-tablewrap"><table><thead><tr>
     <th>相对时间</th><th>类别</th><th>虚拟角色</th><th>模拟响应</th><th>规则原因</th><th>与预期一致</th>
    </tr></thead><tbody>
     {current.rows.slice(0,limit).map(row=><tr key={row.id}>
      <td>{(row.atMs/1000).toFixed(0)} s</td><td>{kindNames[row.kind]}</td><td>{row.role}</td>
      <td>{row.responseStatus}</td><td>{reasonNames[row.reason]}</td>
      <td>{row.correct?"一致":"需调整"}</td>
     </tr>)}
    </tbody></table></div>}
    {showRows&&limit<current.rows.length&&<button onClick={()=>setLimit(n=>n+30)}>显示剩余 {current.rows.length-limit} 条记录</button>}
   </div>
   <details><summary>模拟范围、安全边界与解释</summary>
    {summary.notes.map((s,i)=><p key={i}>{s}</p>)}
   </details>
  </div>}
  <div className="sim-guidance">
   <strong>怎样将演练用到你自己的站点？</strong>
   <p>先在这里验证防御策略的逻辑，再从你自己的开发者工具或服务器日志中导入真实的正常访问记录，核查是否出现对应的 401、403、429 和 5xx。不要把这个模拟器的结果当成真实负载测试或漏洞利用测试。</p>
  </div>
 </section>;
}
