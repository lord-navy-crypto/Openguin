import {useMemo,useState} from "react";
import {
  defaultTrainingRules,exportVirtualDefenseReport,normalizeRules,
  scenarioDetails,simulateVirtualDefense,
  type ScenarioId,type TrainingRules,type TrainingResult,type VirtualEndpoint
} from "./virtual-defense-simulator";
import {downloadDiagnosticText} from "./diagnostic-export";
import "./virtual-defense-lab.css";

const scenarioIds:ScenarioId[]=["baseline","launch","burst","sign-in","slow-service","mixed"];
const routes:Array<{id:VirtualEndpoint;label:string;description:string}>= [
 {id:"home",label:"虚拟首页",description:"这是纯前端模拟页面，提供公共内容展示。"},
 {id:"catalog",label:"虚拟商品目录",description:"这里显示虚构的资源清单，不包含真实商品或访问服务。"},
 {id:"account",label:"虚拟用户中心",description:"仅显示模拟状态；没有账号数据库、真实登录框或密码处理。"},
 {id:"service",label:"虚拟 API 面板",description:"显示离线生成的状态指标，不对外发出 HTTP 请求。"}
];
const titles={
 "rate-limit":"虚拟访问频率限制",
 "sign-in-limit":"虚拟登录失败保护",
 "slow-response":"模拟慢响应告警",
 "server-error-spike":"模拟服务故障告警"
};
const stamp=()=>new Date().toISOString().replace(/[:.]/g,"-");
function formatRate(n:number){return n.toFixed(1)+"%";}
export default function VirtualDefenseLab(){
 const [scenario,setScenario]=useState<ScenarioId>("mixed");
 const [rules,setRules]=useState<TrainingRules>(defaultTrainingRules);
 const [seed,setSeed]=useState(2026);
 const [result,setResult]=useState<TrainingResult|null>(null);
 const [selectedRoute,setSelectedRoute]=useState<VirtualEndpoint>("home");
 const [showTrace,setShowTrace]=useState(false);
 const [visible,setVisible]=useState(25);
 const [notice,setNotice]=useState("");
 const virtualPage=routes.find(r=>r.id===selectedRoute)!;
 const maxMinute=useMemo(()=>Math.max(1,...(result?.timeline??[]).map(x=>x.seen)),[result]);
 const trace=useMemo(()=>result?[...result.records].filter(x=>x.blocked||x.alerts.length).slice(0,visible):[],[result,visible]);
 const totalAlerted=result?.records.filter(x=>x.alerts.length>0).length??0;
 function run(){
  const config=normalizeRules(rules);
  setRules(config);
  setResult(simulateVirtualDefense(scenario,config,seed));
  setVisible(25);setShowTrace(false);
  setNotice("已在内存中完成一轮演练。没有向任何网站或网络地址发送请求。");
 }
 function exportReport(){
  if(!result)return;
  downloadDiagnosticText(JSON.stringify(exportVirtualDefenseReport(result),null,2),
    "openguin-virtual-defense-"+scenario+"-"+stamp()+".json","application/json;charset=utf-8");
  setNotice("已请求导出仅含虚拟统计数据的演练报告。");
 }
 function updateRule(key:keyof TrainingRules,value:number){
  setRules(r=>({...r,[key]:value}));setResult(null);setNotice("规则已修改。点击“运行模拟演练”查看新结果。");
 }
 return <section className="v07-card virtual-defense-lab">
  <div className="vdl-header">
   <div><span className="eyebrow">SECURITY TOOLBOX V7 · ISOLATED TRAINING</span>
    <h3>本地攻防演练实验室 · Virtual Defense Lab</h3>
    <p>学习模拟网站的异常识别、限流、登录保护、故障告警与误拦分析。全部事件在内存中生成，绝不访问真实站点或运行攻击代码。</p>
   </div>
   <span className="vdl-isolated">虚拟环境 · 零网络请求</span>
  </div>
  <div className="vdl-grid">
   <div className="vdl-panel">
    <h4>虚拟网站</h4>
    <div className="vdl-route-tabs" role="group" aria-label="虚拟网站页面">
     {routes.map(r=><button key={r.id} type="button" aria-pressed={selectedRoute===r.id}
       className={selectedRoute===r.id?"active":""} onClick={()=>setSelectedRoute(r.id)}>{r.label}</button>)}
    </div>
    <div className="vdl-webmock">
      <div className="vdl-window"><span/><span/><span/><b>DemoWebsite · 内存模拟</b></div>
      <h4>{virtualPage.label}</h4>
      <p>{virtualPage.description}</p>
      <div className="vdl-mock-metrics"><span>网络请求 <b>0</b></span><span>外部目标 <b>无</b></span><span>演练记录 <b>{result?.total??0}</b></span></div>
    </div>
    <small>这里不是在本机端口运行的真实 Web 服务。所有页面和访问事件仅是 React 状态与 TypeScript 数据对象。</small>
   </div>
   <div className="vdl-panel">
    <h4>模拟场景</h4>
    <label>选择练习内容
      <select value={scenario} onChange={e=>{setScenario(e.target.value as ScenarioId);setResult(null);setNotice("");}}>
       {scenarioIds.map(id=><option key={id} value={id}>{scenarioDetails[id].name}</option>)}
      </select>
    </label>
    <p>{scenarioDetails[scenario].description}</p>
    <label>演练种子（可重复测试）
      <input type="number" min={1} max={999999} value={seed} onChange={e=>{
        const n=Number(e.target.value);setSeed(Number.isFinite(n)?Math.min(999999,Math.max(1,Math.floor(n))):2026);setResult(null);
      }}/>
    </label>
    <div className="vdl-small-actions">
     <button onClick={()=>{setSeed(x=>x>=999999?1:x+1);setResult(null);}}>换一组虚拟数据</button>
     <button onClick={()=>{setRules(defaultTrainingRules);setResult(null);setNotice("");}}>恢复默认防御规则</button>
    </div>
   </div>
  </div>
  <div className="vdl-panel">
   <div className="vdl-panel-head"><h4>防御策略控制台</h4><small>规则只作用于虚拟事件，调整不会影响系统、浏览器或真实网站</small></div>
   <div className="vdl-rule-grid">
    <label>每个虚拟访客每分钟允许的访问量
     <input type="range" min={2} max={60} value={rules.requestsPerActorMinute} onChange={e=>updateRule("requestsPerActorMinute",Number(e.target.value))}/>
     <b>{rules.requestsPerActorMinute} 次</b>
    </label>
    <label>虚拟登录失败观察阈值（每个 5 分钟窗口）
     <input type="range" min={1} max={12} value={rules.failedSignInsPerActorWindow} onChange={e=>updateRule("failedSignInsPerActorWindow",Number(e.target.value))}/>
     <b>{rules.failedSignInsPerActorWindow} 次</b>
    </label>
    <label>模拟慢响应告警阈值
     <input type="range" min={300} max={5000} step={100} value={rules.slowResponseMs} onChange={e=>updateRule("slowResponseMs",Number(e.target.value))}/>
     <b>{rules.slowResponseMs} ms</b>
    </label>
    <label>模拟服务故障告警阈值（每分钟）
     <input type="range" min={1} max={15} value={rules.alertServerErrors} onChange={e=>updateRule("alertServerErrors",Number(e.target.value))}/>
     <b>{rules.alertServerErrors} 次</b>
    </label>
   </div>
   <div className="vdl-actions">
    <button className="vdl-run" onClick={run}>运行模拟演练</button>
    <button disabled={!result} onClick={exportReport}>导出本地模拟报告 JSON</button>
    <button disabled={!result} onClick={()=>{setResult(null);setNotice("");}}>清除演练结果</button>
   </div>
   {notice&&<p className="vdl-status" role="status">{notice}</p>}
  </div>
  {result&&<>
   <div className="vdl-stats" aria-label="虚拟演练指标">
    <div><small>虚拟访问事件</small><b>{result.total}</b></div>
    <div><small>模拟阻断</small><b>{result.blocked}</b></div>
    <div><small>正确限制的异常</small><b>{result.correctlyBlocked}</b></div>
    <div><small>误拦正常访问</small><b>{result.normalBlocked}</b></div>
    <div><small>漏过的异常事件</small><b>{result.anomaliesAllowed}</b></div>
    <div><small>正常访问可用率</small><b>{formatRate(result.legitimateAvailabilityPercent)}</b></div>
   </div>
   <div className="vdl-grid">
    <div className="vdl-panel">
     <h4>十分钟虚拟事件趋势</h4>
     <div className="vdl-timeline">{result.timeline.map(t=><div className="vdl-time-row" key={t.minute}>
      <span>{String(t.minute).padStart(2,"0")}′</span>
      <div className="vdl-bar" title={"第 "+t.minute+" 分钟："+t.seen+" 件虚拟事件"}>
       <i style={{width:(t.allowed/maxMinute*100)+"%"}}/>
       <em style={{width:(t.blocked/maxMinute*100)+"%"}}/>
      </div>
      <strong>{t.seen}</strong><small>限制 {t.blocked}</small>
     </div>)}</div>
     <div className="vdl-legend"><span><i/>允许</span><span><i/>模拟限制</span></div>
     <small>统计单位是合成事件数，不是实际 HTTP RPS、带宽或服务器容量。</small>
    </div>
    <div className="vdl-panel">
     <h4>防御效果解读</h4>
     <div className="vdl-metrics">
      <span>模拟总告警：<b>{result.alerts}</b></span>
      <span>出现告警的事件：<b>{totalAlerted}</b></span>
      <span>误拦比例：<b>{formatRate(result.falsePositivePercent)}</b></span>
      <span>慢响应记录：<b>{result.slowObservations}</b></span>
      <span>模拟服务端错误：<b>{result.serverErrors}</b></span>
      <span>限制占比：<b>{formatRate(result.blockedRatePercent)}</b></span>
     </div>
     {result.observations.map((message,i)=><p key={i} className="vdl-note">{message}</p>)}
     <small>“正确”“误拦”等标签由模拟数据的预设真值计算，只用于练习策略权衡。</small>
    </div>
   </div>
   <div className="vdl-panel">
    <div className="vdl-panel-head"><h4>可解释的虚拟安全事件</h4>
     <button onClick={()=>setShowTrace(x=>!x)}>{showTrace?"收起模拟事件":"查看模拟事件"}</button>
    </div>
    {showTrace&&<>
     <div className="vdl-table"><table><thead><tr><th>分钟</th><th>模拟资源</th><th>事件分类</th><th>防御决定</th><th>提示</th></tr></thead>
      <tbody>{trace.map(event=><tr key={event.id}><td>{event.minute}</td><td>{event.endpoint}</td>
       <td>{event.simulatedAnomaly?"预设异常":"常规行为"}</td>
       <td>{event.blocked?"虚拟限制":"允许"}</td>
       <td>{event.alerts.map(a=>titles[a as keyof typeof titles]??a).join(" · ")||"—"}</td>
      </tr>)}</tbody></table></div>
     {result.records.filter(x=>x.blocked||x.alerts.length).length>visible&&
      <button onClick={()=>setVisible(x=>Math.min(x+25,2400))}>查看更多事件</button>}
    </>}
   </div>
  </>}
  <div className="vdl-footer">
   <b>安全边界</b>
   <p>所有训练数据是虚构的，没有网站地址、真实用户身份、密码、漏洞代码、真实请求或网络连接。你可以用这个模拟器练习防御规则的效果与误报分析；真实站点的配置评估仍应使用上方独立的日志、HTTP 头和安全配置审查工具。</p>
  </div>
 </section>;
}
