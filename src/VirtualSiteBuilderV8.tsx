import {useMemo,useState} from "react";
import {
  makeSite,runVirtualSite,compareVirtualSite,exportSiteRun,
  exportSiteAccessLog,exportSiteBrowserJournal,
  PROTECTED_SWITCHES,TRAINING_SWITCHES,SITE_SCENARIOS,
  type SiteTemplate,type SiteBlueprint,type SitePage,
  type DefenseSwitches,type CaseKind,type SiteRun
} from "./virtual-site-builder-v8";
import {downloadDiagnosticText} from "./diagnostic-export";
import "./virtual-site-builder-v8.css";

const siteTemplates:Array<{id:SiteTemplate;title:string;detail:string}>=[
  {id:"community",title:"社区网站",detail:"首页、消息、个人资料、管理后台"},
  {id:"classroom",title:"学习平台",detail:"课程、作业、提交、教师后台"},
  {id:"store",title:"模拟商店",detail:"商品、订单、结算、管理后台"}
];
const roleLabels={public:"公开",member:"仅成员",admin:"管理员"};
const reasonLabels={
 none:"允许",authentication:"未登录",role:"角色权限",
 ownership:"资源归属",expired:"会话已过期",
 "origin-check":"状态变更验证", "invalid-input":"输入不符合规则",
 "server-error":"内部故障"
};
const switchLabels:Array<{id:keyof DefenseSwitches;title:string;detail:string}>=[
 {id:"accessControl",title:"服务器端页面权限",detail:"控制访客和普通成员可访问的页面"},
 {id:"ownershipChecks",title:"记录所有权验证",detail:"成员只能读取自己的虚拟记录"},
 {id:"sessionChecks",title:"会话有效期",detail:"过期的成员会话将被拒绝"},
 {id:"csrfChecks",title:"状态变更校验",detail:"模拟资料修改时验证 CSRF 保护标记"},
 {id:"inputValidation",title:"输入规则校验",detail:"拒绝不符合预期字段格式的合成数据"},
 {id:"genericErrors",title:"隐藏内部错误细节",detail:"发生虚拟服务器错误时只显示通用状态"}
];
const fmt=(v:number)=>v.toLocaleString("zh-CN");
const fileStamp=()=>new Date().toISOString().replace(/[:.]/g,"-");
export default function VirtualSiteBuilderV8(){
 const [site,setSite]=useState<SiteBlueprint>(()=>makeSite("community"));
 const [scenario,setScenario]=useState<CaseKind>("mixed");
 const [controls,setControls]=useState<DefenseSwitches>({...PROTECTED_SWITCHES});
 const [run,setRun]=useState<SiteRun|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [showEvents,setShowEvents]=useState(false);
 const [eventLimit,setEventLimit]=useState(30);
 const [showEditor,setShowEditor]=useState(false);
 const currentScenario=SITE_SCENARIOS.find(x=>x.id===scenario)!;
 const compare=useMemo(()=>{
  if(!run)return null;
  try{return compareVirtualSite(site,scenario,controls)}
  catch{return null;}
 },[run,site,scenario,controls]);
 function resetResult(){setRun(null);setError("");setNotice("");setShowEvents(false);}
 function changeTemplate(t:SiteTemplate){setSite(makeSite(t));setScenario("mixed");resetResult();}
 function changePage(id:string,field:keyof SitePage,value:string|boolean){
  setSite(current=>({...current,pages:current.pages.map(p=>
   p.id===id?{...p,[field]:value}:p)}));resetResult();
 }
 function changeSwitch(id:keyof DefenseSwitches,value:boolean){
  setControls(c=>({...c,[id]:value}));resetResult();
 }
 function execute(){
  try{setRun(runVirtualSite(site,scenario,controls));setError("");setNotice("");setEventLimit(30);setShowEvents(false);}
  catch(e){setError(e instanceof Error?e.message:"模拟失败。");setRun(null);}
 }
 function download(kind:"summary"|"server"|"journal"){
  if(!run)return;
  const content=kind==="summary"?JSON.stringify(exportSiteRun(run),null,2):
    kind==="server"?exportSiteAccessLog(run):
      JSON.stringify(exportSiteBrowserJournal(run),null,2);
  const name=kind==="summary"?"openguin-v8-virtual-site-report-"+fileStamp()+".json":
    kind==="server"?"openguin-v8-virtual-access.log":
      "openguin-v8-virtual-browser-journal.json";
  downloadDiagnosticText(content,name,
    kind==="server"?"text/plain;charset=utf-8":"application/json;charset=utf-8");
  setNotice("已请求导出虚构演练数据；不会包含真实网站地址或私人数据。");
 }
 return <section className="v07-card virtual-site-v8">
  <header className="site-v8-header">
   <div><span className="eyebrow">SECURITY TOOLBOX V8 · VIRTUAL SITE BUILDER</span>
    <h3>本地模拟网站与防御实验室 · Virtual Site Builder</h3>
    <p>从预设模板搭建一个<strong>纯内存模拟网站</strong>，修改页面访问权限与安全策略，再运行合成的安全事件。整个实验不启动服务器、不绑定端口，也不发送任何网络请求。</p>
   </div>
   <span className="site-v8-offline">隔离演练 · 0 网络请求</span>
  </header>
  <div className="site-v8-progress">
   <span><b>01</b> 选择网站模板</span>
   <span><b>02</b> 设计页面权限</span>
   <span><b>03</b> 配置防御</span>
   <span><b>04</b> 运行与分析</span>
  </div>
  <div className="site-v8-templates">
   {siteTemplates.map(t=><button type="button" key={t.id}
     aria-pressed={site.template===t.id} className={site.template===t.id?"active":""}
     onClick={()=>changeTemplate(t.id)}>
     <strong>{t.title}</strong><small>{t.detail}</small>
   </button>)}
  </div>
  <div className="site-v8-panel">
   <div className="site-v8-title-row">
    <div><h4>虚拟网站结构</h4>
     <p>网站名称和页面只用于本次会话。本工具不创建真实 HTTP 服务。</p></div>
    <button onClick={()=>setShowEditor(x=>!x)}>{showEditor?"收起页面设置":"编辑访问规则"}</button>
   </div>
   <label className="site-v8-name">虚拟网站名称
    <input maxLength={45} value={site.siteLabel} onChange={e=>{
     setSite(s=>({...s,siteLabel:e.target.value}));resetResult();
    }} placeholder="我的模拟网站"/>
   </label>
   <div className="site-v8-page-grid">
    {site.pages.map(p=><div key={p.id} className="site-v8-page">
      <span className="site-v8-page-icon">▢</span>
      <div><strong>{p.label}</strong>
       <small>{roleLabels[p.access]}{p.ownerOnly?" · 个人资源":""}{p.stateChanging?" · 状态变更":""}</small>
      </div>
     </div>)}
   </div>
   {showEditor&&<div className="site-v8-editor">
    <p>这些字段定义模拟网站本来应该实施的访问规则。关闭下方防御开关，可观察规则缺失时哪些事件被错误允许。</p>
    {site.pages.map(p=><div className="site-v8-editor-row" key={p.id}>
     <label className="site-v8-editor-label">页面名称
      <input maxLength={44} value={p.label} onChange={e=>changePage(p.id,"label",e.target.value)}/>
     </label>
     <label className="site-v8-editor-label">访问范围
      <select value={p.access} onChange={e=>changePage(p.id,"access",e.target.value)}>
       <option value="public">公开</option>
       <option value="member">仅登录成员</option>
       <option value="admin">仅管理员</option>
      </select>
     </label>
     <label className="site-v8-inline"><input type="checkbox" checked={p.ownerOnly}
      onChange={e=>changePage(p.id,"ownerOnly",e.target.checked)}/>验证资源归属</label>
     <label className="site-v8-inline"><input type="checkbox" checked={p.stateChanging}
      onChange={e=>changePage(p.id,"stateChanging",e.target.checked)}/>有表单提交</label>
     <label className="site-v8-inline"><input type="checkbox" checked={p.validatesInput}
      onChange={e=>changePage(p.id,"validatesInput",e.target.checked)}/>字段验证</label>
    </div>)}
   </div>}
  </div>
  <div className="site-v8-panel">
   <div className="site-v8-title-row"><div><h4>选择练习场景</h4>
    <p>{currentScenario.description}</p></div>
    <label className="site-v8-scenario">场景
     <select value={scenario} onChange={e=>{
      setScenario(e.target.value as CaseKind);resetResult();
     }}>
      {SITE_SCENARIOS.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
     </select>
    </label>
   </div>
  </div>
  <div className="site-v8-panel">
   <div className="site-v8-title-row"><div><h4>防御策略开关</h4>
     <p>通过对比教学演示策略与受保护策略，观察漏拦截与错误信息泄露。</p></div>
    <div className="site-v8-actions">
     <button onClick={()=>{setControls({...TRAINING_SWITCHES});resetResult();}}>教学对照配置</button>
     <button onClick={()=>{setControls({...PROTECTED_SWITCHES});resetResult();}}>全部开启保护</button>
    </div>
   </div>
   <div className="site-v8-toggles">
    {switchLabels.map(s=><label key={s.id}>
      <input type="checkbox" checked={controls[s.id]} onChange={e=>changeSwitch(s.id,e.target.checked)}/>
      <span><strong>{s.title}</strong><small>{s.detail}</small></span>
    </label>)}
   </div>
  </div>
  <div className="site-v8-actions site-v8-run">
   <button className="site-v8-run-button" onClick={execute}>运行虚拟访问与防御验证</button>
   <button disabled={!run} onClick={()=>download("summary")}>导出脱敏报告</button>
   <button disabled={!run} onClick={()=>download("server")}>导出虚拟 access.log</button>
   <button disabled={!run} onClick={()=>download("journal")}>导出虚拟浏览器日志</button>
   <button disabled={!run} onClick={resetResult}>清空结果</button>
  </div>
  {error&&<p role="alert" className="site-v8-error">{error}</p>}
  {notice&&<p role="status" className="site-v8-notice">{notice}</p>}
  {run&&<div className="site-v8-output">
   <div className="site-v8-stats">
    <div><small>虚拟事件总数</small><strong>{fmt(run.total)}</strong></div>
    <div><small>符合预期</small><strong>{fmt(run.correct)}</strong></div>
    <div><small>漏拦截</small><strong>{fmt(run.missedDenials)}</strong></div>
    <div><small>误拦截</small><strong>{fmt(run.falseDenials)}</strong></div>
    <div><small>错误细节暴露</small><strong>{fmt(run.disclosedErrorDetails)}</strong></div>
   </div>
   <div className="site-v8-comparison-grid">
    <div className="site-v8-panel"><h4>虚拟 HTTP 状态分布</h4>
     <div className="site-v8-statuses">
      {Object.entries(run.statusCounts).map(([status,n])=><div key={status}>
       <span>HTTP {status}</span>
       <div className="site-v8-meter"><div style={{width:(n/run.total*100)+"%"}}/></div>
       <b>{n}</b>
      </div>)}
     </div>
    </div>
    <div className="site-v8-panel"><h4>与教学对照配置比较</h4>
     {compare&&<div className="site-v8-compare">
      <div><span>指标</span><strong>教学对照</strong><strong>当前策略</strong></div>
      <div><span>漏拦截</span><b>{compare.baseline.missed}</b><b>{compare.current.missed}</b></div>
      <div><span>错误细节暴露</span><b>{compare.baseline.exposed}</b><b>{compare.current.exposed}</b></div>
      <div><span>正确判定</span><b>{compare.baseline.correct}</b><b>{compare.current.correct}</b></div>
     </div>}
     <p>这些指标只针对同一批合成场景。生产环境的实际安全性需要另外验证。</p>
    </div>
   </div>
   <div className="site-v8-panel">
    <div className="site-v8-title-row"><div><h4>虚拟请求逐条记录</h4>
     <p>显示客户端身份、目标模拟页面、预期结果与防御响应。没有任何真正的攻击载荷。</p></div>
     <button onClick={()=>setShowEvents(x=>!x)}>{showEvents?"隐藏列表":"展开 "+run.total+" 条事件"}</button>
    </div>
    {showEvents&&<div className="site-v8-table"><table><thead><tr>
     <th>测试场景</th><th>页面</th><th>身份</th><th>预期</th><th>HTTP</th><th>观察原因</th><th>结果</th>
    </tr></thead><tbody>{run.cases.slice(0,eventLimit).map(row=><tr key={row.id}>
     <td>{SITE_SCENARIOS.find(s=>s.id===row.caseKind)?.title}</td>
     <td>{site.pages.find(p=>p.id===row.pageId)?.label??"虚拟页面"}</td>
     <td>{row.actor}</td><td>{row.expected==="deny"?"拒绝":row.expected==="fault"?"错误":"允许"}</td>
     <td>{row.status}</td><td>{reasonLabels[row.observedReason]}</td>
     <td>{row.correct?"符合预期":"需要修复"}</td>
    </tr>)}</tbody></table></div>}
    {showEvents&&eventLimit<run.cases.length&&<button onClick={()=>setEventLimit(n=>n+30)}>继续显示剩余 {run.cases.length-eventLimit} 条</button>}
   </div>
   <details className="site-v8-caveats"><summary>演练限制与数据保护</summary>
    {run.warnings.map((s,i)=><p key={i}>{s}</p>)}
   </details>
  </div>}
  <div className="site-v8-hint">
   <strong>练习流程</strong>
   <p>选择社区、课程或商店模板，先运行默认防御配置；然后切换教学对照配置，重新模拟相同的事件，观察有哪些异常被放行。最后恢复防御开关，验证指标变化。生成的虚拟访问日志和浏览器日志可以导入本页其他调查工具继续练习。</p>
  </div>
 </section>;
}
