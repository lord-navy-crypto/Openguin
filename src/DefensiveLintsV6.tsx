import {useState} from "react";
import {checkCors,checkCache,checkSri,checkActions,type Report} from "./defensive-lints-v6";
import {downloadDiagnosticText} from "./diagnostic-export";
import "./defensive-lints-v6.css";

type Mode="cors"|"cache"|"sri"|"actions";
const modes:Array<{id:Mode;name:string;description:string;placeholder:string;limit:number}>= [
 {id:"cors",name:"CORS 配置",description:"检查自有网站的跨源读取策略和缓存来源区分。只分析粘贴的响应头。",placeholder:"Access-Control-Allow-Origin: https://example.com\nAccess-Control-Allow-Credentials: true\nVary: Origin",limit:30000},
 {id:"cache",name:"HTTP 缓存隐私",description:"审查登录后或个人化页面的缓存头。请删除粘贴内容中的真实 Cookie、令牌。",placeholder:"Cache-Control: private, no-store\nContent-Type: text/html",limit:30000},
 {id:"sri",name:"第三方资源完整性",description:"检查 HTML 中外部脚本和样式资源是否有 SRI 属性，不打开链接、不执行代码。",placeholder:"<script src=\"https://cdn.example.com/app.js\" integrity=\"sha384-...\" crossorigin=\"anonymous\"></script>",limit:60000},
 {id:"actions",name:"CI 工作流权限",description:"审查你自己仓库的 GitHub Actions YAML，提示令牌写权限、第三方动作版本固定及高权限事件。",placeholder:"name: CI\non: push\npermissions: read-all\njobs:\n  check:\n    steps:\n      - uses: actions/checkout@v4",limit:60000}
];
const tools={cors:checkCors,cache:checkCache,sri:checkSri,actions:checkActions};
export default function DefensiveLintsV6(){
 const [mode,setMode]=useState<Mode>("cors"),[input,setInput]=useState(""),
  [out,setOut]=useState<Report|null>(null),[error,setError]=useState("");
 const active=modes.find(m=>m.id===mode)!;
 function choose(next:Mode){setMode(next);setInput("");setOut(null);setError("");}
 function run(){
  try{setOut(tools[mode](input));setInput("");setError("");}
  catch(e){setError(e instanceof Error?e.message:"无法完成本地检查。");setOut(null);}
 }
 function exportJson(){
  if(!out)return;
  downloadDiagnosticText(JSON.stringify({...out,createdAt:new Date().toISOString()},null,2),
   "openguin-lint-"+mode+"-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",
   "application/json;charset=utf-8");
 }
 const review=out?.findings.filter(f=>f.severity==="review").length??0;
 const suggestions=out?.findings.filter(f=>f.severity==="suggest").length??0;
 return <section className="v07-card defensive-lints-v6">
  <div className="def-lint-intro">
   <div><span className="eyebrow">SECURITY TOOLBOX V6 · DEFENSIVE CONFIGURATION</span>
    <h3>网站与持续集成安全检查 · Web & CI Lint</h3>
    <p>四个手动运行的离线工具，适用于你管理的网站和代码仓库。不会调用网络接口、打开链接或执行配置内容。</p></div>
   <span className="def-lint-private">仅本机 · 规则检查</span>
  </div>
  <div className="def-lint-selector" role="group" aria-label="选择安全配置检查器">
   {modes.map(m=><button type="button" key={m.id} aria-pressed={mode===m.id} className={mode===m.id?"active":""}
    onClick={()=>choose(m.id)}>{m.name}</button>)}
  </div>
  <div className="def-lint-content">
   <h4>{active.name}</h4>
   <p>{active.description}</p>
   <label className="def-lint-label">粘贴待分析的配置或代码片段
    <textarea rows={6} maxLength={active.limit} spellCheck={false} value={input} placeholder={active.placeholder}
     onChange={e=>{setInput(e.target.value);setOut(null);setError("");}}/>
   </label>
   <div className="def-lint-controls">
    <button disabled={!input.trim()} onClick={run}>运行本地检查</button>
    <button disabled={!out} onClick={exportJson}>导出脱敏 JSON 报告</button>
    <button disabled={!out&&!input} onClick={()=>{setOut(null);setInput("");setError("");}}>清空本次结果</button>
   </div>
   {error&&<p role="alert" className="def-lint-error">{error}</p>}
   {out&&<>
    <div className="def-lint-metrics"><span>人工复核 <b>{review}</b></span>
     <span>改进建议 <b>{suggestions}</b></span>
     <span>规则说明 <b>{out.findings.length-review-suggestions}</b></span></div>
    {out.findings.length?<div className="def-lint-findings">{out.findings.map(f=>
     <article key={f.code} className={f.severity}>
      <strong>{f.title}</strong><p>{f.reason}</p><small>建议：{f.fix}</small>
     </article>)}</div>:<p className="def-lint-neutral">当前规则没有触发提示，但这不代表网站或仓库没有安全风险。</p>}
    <details><summary>检查范围与局限</summary><p>{out.scope}</p><p>报告只包含统计与规则描述，不包含输入的 URL、域名、令牌、响应头原文或代码。</p></details>
   </>}
   <small>请仅检查你有权管理的配置。离线静态规则可能误报或遗漏问题，不能替代安全测试与专业审计。</small>
  </div>
 </section>;
}
