import {useState} from "react";
import {downloadDiagnosticText} from "./diagnostic-export";
import {
  inspectCsp,inspectSecurityTxt,inspectDnsZone,inspectUrl,inspectRobotsTxt,
  type MiniToolReport,type CheckFinding
} from "./defensive-mini-tools";
import "./defensive-mini-tools.css";

type Tool="csp"|"security-txt"|"dns"|"url"|"robots"|"sha256";
const tabs:Array<{id:Tool;name:string;subtitle:string;hint:string}>= [
  {id:"csp",name:"CSP 策略",subtitle:"脚本来源与内容隔离",hint:"从开发者工具复制 Content-Security-Policy 响应头的值。"},
  {id:"security-txt",name:"security.txt",subtitle:"漏洞报告渠道",hint:"复制你自己网站 /.well-known/security.txt 的文本。"},
  {id:"dns",name:"DNS 配置",subtitle:"SPF、DMARC、CAA",hint:"从你自己的 DNS 管理面板复制记录，每行一条 name TTL IN TYPE value。"},
  {id:"url",name:"URL 结构",subtitle:"链接格式与隐私",hint:"粘贴待检查的 URL。离线分析不会打开网页或判断它是否恶意。"},
  {id:"robots",name:"robots.txt",subtitle:"爬虫规则与访问控制",hint:"粘贴 robots.txt 内容，了解为何不能使用它保护敏感资源。"},
  {id:"sha256",name:"文件完整性",subtitle:"SHA-256 本地哈希",hint:"手动选择不超过 16 MiB 的文件。本地计算摘要，不上传文件。"}
];
const checkers={
  csp:inspectCsp,"security-txt":inspectSecurityTxt,dns:inspectDnsZone,
  url:inspectUrl,robots:inspectRobotsTxt
};
function toolReport(tool:Exclude<Tool,"sha256">,raw:string):MiniToolReport{
  return checkers[tool](raw);
}
const titleLevel=(level:CheckFinding["level"])=>
  level==="review"?"人工复核":level==="recommendation"?"建议优化":"说明";
const toHex=(buffer:ArrayBuffer)=>
  Array.from(new Uint8Array(buffer)).map(x=>x.toString(16).padStart(2,"0")).join("");
export default function DefensiveMiniToolbox(){
  const [tool,setTool]=useState<Tool>("csp");
  const [input,setInput]=useState("");
  const [report,setReport]=useState<MiniToolReport|null>(null);
  const [error,setError]=useState("");
  const [fileName,setFileName]=useState("");
  const [fileDigest,setFileDigest]=useState("");
  const [expected,setExpected]=useState("");
  const [digestBusy,setDigestBusy]=useState(false);
  const current=tabs.find(t=>t.id===tool)!;
  function select(next:Tool){
    setTool(next);setInput("");setReport(null);setError("");
    setFileDigest("");setFileName("");setExpected("");
  }
  function run(){
    if(tool==="sha256")return;
    try{setReport(toolReport(tool,input));setError("");}
    catch(e){setReport(null);setError(e instanceof Error?e.message:"本地检查失败。");}
  }
  function exportReport(){
    if(!report)return;
    const name="openguin-"+report.tool+"-review-"+new Date().toISOString().replace(/[:.]/g,"-")+".json";
    downloadDiagnosticText(JSON.stringify({...report,generatedAt:new Date().toISOString()},null,2),
      name,"application/json;charset=utf-8");
  }
  async function hash(file:File|undefined){
    setFileDigest("");setFileName("");setError("");
    if(!file)return;
    if(file.size>16*1024*1024){setError("超过 16 MiB 的文件未读取；请使用适合大文件的本地哈希程序。");return;}
    if(!globalThis.crypto?.subtle){setError("当前环境不支持 Web Crypto SHA-256。");return;}
    setDigestBusy(true);
    try{
      const bytes=await file.arrayBuffer();
      const result=await crypto.subtle.digest("SHA-256",bytes);
      setFileDigest(toHex(result));setFileName(file.name.slice(0,120));
    }catch{setError("文件读取或 SHA-256 计算失败。");}
    finally{setDigestBusy(false);}
  }
  const expectedValid=/^[a-f0-9]{64}$/i.test(expected.trim());
  const match=fileDigest && expectedValid
    ?fileDigest.toLowerCase()===expected.trim().toLowerCase():null;
  return <section className="v07-card defensive-mini-workbench">
    <div className="mini-tool-head"><div>
      <span className="eyebrow">SECURITY TOOLBOX V4 · DEFENSIVE UTILITIES</span>
      <h3>白帽网络安全小工具 · Defensive Mini Tools</h3>
      <p>本地检查配置、报告规范与文件完整性。无需额外权限、无需访问其他服务器、不会自动发送网络请求。</p>
    </div><span className="mini-offline">离线 · 手动执行</span></div>
    <div className="mini-tool-tabs" role="group" aria-label="防御工具选择">
      {tabs.map(t=><button type="button" key={t.id} className={tool===t.id?"selected":""}
        onClick={()=>select(t.id)} aria-pressed={tool===t.id}>
        <strong>{t.name}</strong><small>{t.subtitle}</small>
      </button>)}
    </div>
    <div className="mini-tool-panel">
      <div><h4>{current.name}</h4><p>{current.hint}</p></div>
      {tool!=="sha256"?<>
        <label className="mini-tool-input">离线输入
          <textarea rows={5} maxLength={32000} spellCheck={false} value={input}
            placeholder={tool==="security-txt"?"Contact: mailto:security@example.com\nExpires: 2027-10-28T00:00:00Z":
              tool==="csp"?"default-src 'self'; script-src 'self'; object-src 'none'":
              tool==="dns"?"example.com. 3600 IN TXT \"v=spf1 -all\"":tool==="robots"?"User-agent: *\nDisallow: /private/":"https://example.com/"}
            onChange={e=>{setInput(e.target.value);setReport(null);setError("");}}/>
        </label>
        <div className="mini-tool-actions">
          <button disabled={!input.trim()} onClick={run}>运行离线检查</button>
          <button disabled={!report} onClick={exportReport}>导出检查建议 JSON</button>
          <button onClick={()=>{setInput("");setReport(null);setError("");}}>清空输入</button>
        </div>
        {report&&<>
          <div className="mini-tool-summary">
            <span>人工复核 <b>{report.findings.filter(x=>x.level==="review").length}</b></span>
            <span>优化建议 <b>{report.findings.filter(x=>x.level==="recommendation").length}</b></span>
            <span>说明 <b>{report.findings.filter(x=>x.level==="info").length}</b></span>
          </div>
          <div className="mini-tool-findings">
            {report.findings.map(f=><article key={f.code} className={f.level}>
              <strong>{titleLevel(f.level)} · {f.title}</strong>
              <p>{f.detail}</p><small>下一步：{f.nextStep}</small>
            </article>)}
            {!report.findings.length&&<p className="mini-tool-hint">当前规则未发现需要提示的项目。这不等于网站已经安全或配置完全正确。</p>}
          </div>
          <p className="mini-tool-hint">适用范围：{report.scope}。导出只包含检查结论和统计，不包含粘贴的原始文本。</p>
        </>}
      </>:<>
        <label className="mini-tool-input">选择本地文件（最大 16 MiB）
          <input type="file" onChange={e=>{void hash(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/>
        </label>
        {digestBusy&&<p role="status" className="mini-tool-hint">正在本机计算 SHA-256…</p>}
        {fileDigest&&<div className="mini-tool-digest">
          <p>文件：{fileName}</p><small>SHA-256 文件摘要</small>
          <code>{fileDigest}</code>
          <button onClick={()=>void navigator.clipboard.writeText(fileDigest)}>复制 SHA-256</button>
          <label>可选：输入官方提供的 64 位 SHA-256 校验值
            <input value={expected} maxLength={64} placeholder="64 位十六进制摘要" onChange={e=>setExpected(e.target.value)}/>
          </label>
          {expected&&<p role="status">{!expectedValid?"校验值格式不正确":match?"摘要一致：文件字节与预期摘要相符。":"摘要不一致：请重新确认文件来源。"}</p>}
        </div>}
        <p className="mini-tool-hint">哈希匹配只表示文件字节一致，不保证文件无恶意内容；必须从可信来源获取官方校验值。未导出或保存原始文件内容。</p>
      </>}
      {error&&<p className="mini-tool-error" role="alert">{error}</p>}
    </div>
  </section>;
}
