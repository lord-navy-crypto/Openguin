import {useState} from "react";
import {auditSetCookies,auditDependencies,auditSecretExposure,auditFileSignature,type Review} from "./defensive-auditors-v5";
import {downloadDiagnosticText} from "./diagnostic-export";
import "./defensive-auditors-v5.css";

type Mode="cookies"|"dependencies"|"secrets"|"signature";
const modes:Array<{id:Mode;title:string;desc:string;placeholder:string}>= [
 {id:"cookies",title:"Cookie 安全设置",desc:"检查 Secure、HttpOnly、SameSite 与 __Host- 前缀。请仅使用你自己的网站响应头，不要复制真实会话 Cookie 给他人。",placeholder:"Set-Cookie: __Host-example=REDACTED; Secure; HttpOnly; SameSite=Lax; Path=/"},
 {id:"dependencies",title:"依赖与供应链",desc:"离线分析 package.json 或 package-lock.json 的版本策略和安装脚本标志。不查询线上漏洞数据库。",placeholder:'{"dependencies":{"sample-library":"^1.0.0"}}'},
 {id:"secrets",title:"敏感信息泄露线索",desc:"在本机检查你自己代码或配置中的私钥标记、令牌赋值等疑似信息。结果只给数量，不显示原文。",placeholder:"MY_API_KEY = EXAMPLE_NOT_A_REAL_TOKEN"},
 {id:"signature",title:"文件类型与扩展名",desc:"只读取本地文件前 8 KiB，识别常见文件签名、双扩展名与明显格式不符。不会运行文件，也不是杀毒软件。",placeholder:""}
];
const inspect={cookies:auditSetCookies,dependencies:auditDependencies,secrets:auditSecretExposure};
const stamp=()=>new Date().toISOString().replace(/[:.]/g,"-");
export default function DefensiveAuditorsV5(){
 const [mode,setMode]=useState<Mode>("cookies");
 const [input,setInput]=useState("");
 const [result,setResult]=useState<Review|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [name,setName]=useState("");
 const active=modes.find(x=>x.id===mode)!;
 function choose(id:Mode){setMode(id);setInput("");setResult(null);setError("");setName("");}
 function run(){
  if(mode==="signature")return;
  try{
   const data=inspect[mode](input);
   setResult(data);setError("");setInput("");
  }catch(e){setError(e instanceof Error?e.message:"审查失败");setResult(null);}
 }
 async function scanFile(file:File|undefined){
  if(!file)return;
  setError("");setResult(null);setName("");setBusy(true);
  try{
   if(file.size>100*1024*1024)throw Error("文件超过 100 MiB 检查限制。");
   const data=new Uint8Array(await file.slice(0,8192).arrayBuffer());
   setResult(auditFileSignature(file.name,data));setName(file.name.slice(0,100));
  }catch(e){setError(e instanceof Error?e.message:"无法读取文件");}
  finally{setBusy(false);}
 }
 function exportReport(){
  if(!result)return;
  downloadDiagnosticText(JSON.stringify({...result,exportedAt:new Date().toISOString()},null,2),
   "openguin-defense-"+result.tool+"-"+stamp()+".json","application/json;charset=utf-8");
 }
 return <section className="v07-card defense-auditors">
  <div className="defense-auditors-header">
   <div><span className="eyebrow">DEFENSIVE TOOLBOX V5 · OFFLINE ONLY</span>
   <h3>网络安全审查小工具 · Privacy-First Auditors</h3>
   <p>专门面向自有网站、代码仓库与下载文件的防御检查。不会向外发送网络请求，也不会执行所选择的文件。</p></div>
   <span className="defense-local-tag">本地 · 手动</span>
  </div>
  <div className="defense-auditors-tabs" role="group" aria-label="选择防御工具">
   {modes.map(x=><button key={x.id} type="button" className={mode===x.id?"current":""} aria-pressed={mode===x.id}
     onClick={()=>choose(x.id)}>{x.title}</button>)}
  </div>
  <div className="defense-auditors-content">
   <h4>{active.title}</h4><p>{active.desc}</p>
   {mode==="signature"?<label className="defense-auditors-input">选择本地文件（只读文件头）
     <input type="file" disabled={busy} onChange={e=>{void scanFile(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/>
    </label>:<>
    <label className="defense-auditors-input">本地分析输入
     <textarea rows={5} maxLength={mode==="dependencies"?400000:mode==="secrets"?120000:24000} value={input}
      placeholder={active.placeholder} spellCheck={false} onChange={e=>{setInput(e.target.value);setResult(null);setError("");}}/>
    </label>
    <small>分析完成后将自动清空输入框。请勿把真实令牌、会话 Cookie、密钥或私有代码发送到在线聊天。</small>
   </>}
   <div className="defense-auditors-controls">
    {mode!=="signature"&&<button disabled={!input.trim()} onClick={run}>运行本地检查</button>}
    <button disabled={!result} onClick={exportReport}>导出脱敏摘要 JSON</button>
    <button disabled={!input&&!result} onClick={()=>{setInput("");setResult(null);setError("");setName("");}}>清空本次数据</button>
   </div>
   {busy&&<p role="status">正在本地读取文件头…</p>}
   {error&&<p className="defense-auditors-error" role="alert">{error}</p>}
   {result&&<div className="defense-auditors-results">
    {name&&<p>已检测文件：{name}</p>}
    <div className="defense-auditors-metrics">
     <span>需复核 <b>{result.findings.filter(x=>x.level==="review").length}</b></span>
     <span>建议改进 <b>{result.findings.filter(x=>x.level==="improve").length}</b></span>
     <span>信息提示 <b>{result.findings.filter(x=>x.level==="info").length}</b></span>
    </div>
    <div className="defense-auditors-findings">
     {result.findings.map(f=><article className={f.level} key={f.id}>
      <strong>{f.title}</strong><p>{f.detail}</p><small>建议：{f.remedy}</small>
     </article>)}
     {!result.findings.length&&<p>当前静态规则未触发提示；这并不代表已通过完整安全审查。</p>}
    </div>
    <details><summary>分析范围与局限</summary>{result.caveats.map((c,i)=><p key={i}>{c}</p>)}</details>
    <small>导出不包含粘贴原文、实际 Cookie 值、令牌、包名、文件路径或文件原始字节。统计信息仍可能属于内部资料，请分享前复核。</small>
   </div>}
  </div>
 </section>;
}
