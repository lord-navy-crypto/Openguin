import {useState} from "react";
import {downloadDiagnosticText} from "./diagnostic-export";
import "./localhost-manual-lab.css";

type Exercise={id:string;title:string;action:string;expected:string};
const exercises:Exercise[]=[
 {id:"guest",title:"访客访问受保护页面",
  action:"未选择任何模拟身份时，在本地浏览器打开 /member。",
  expected:"收到 401；页面不泄露个人账户信息。"},
 {id:"role",title:"角色权限验证",
  action:"从首页选择 Demo member，再访问 /admin。",
  expected:"收到 403；普通成员不能看到管理员页面。"},
 {id:"admin",title:"管理员访问",
  action:"在首页切换 Demo administrator，再访问 /admin。",
  expected:"收到 200；这是虚构角色，不是真实登录。"},
 {id:"form",title:"表单校验",
  action:"在 Demo member 身份下打开 /form，输入不符合给定字段规则的普通文本。",
  expected:"服务器返回 422；不会保存或回显提交内容。"},
 {id:"rate",title:"手动限流体验",
  action:"打开 /rate-check，使用浏览器手动刷新几次，不要运行自动请求或负载工具。",
  expected:"连续手动检查后收到 429；在窗口恢复后可再次正常访问。"},
 {id:"session",title:"会话过期与退出",
  action:"从首页建立演练身份，使用 End mock session 退出后再访问 /member。",
  expected:"会话退出后收到 401；会话也会在短期内过期。"}
];
type Outcome="untested"|"expected"|"review";
const command="npm run security:lab";
const url="http://127.0.0.1:19090/";
const statusLabels:{[k in Outcome]:string}={
 untested:"未验证",expected:"符合预期",review:"需要复核"
};
export default function LocalhostManualLab(){
 const [state,setState]=useState<Record<string,Outcome>>({});
 const [notice,setNotice]=useState("");
 const complete=exercises.filter(x=>state[x.id]==="expected").length;
 const review=exercises.filter(x=>state[x.id]==="review").length;
 function update(id:string,v:Outcome){setState(s=>({...s,[id]:v}));setNotice("");}
 function exportResults(){
  const out={
   schema:"openguin-manual-localhost-lab-v9",generatedAt:new Date().toISOString(),
   target:"127.0.0.1:19090",manualOnly:true,realSiteTested:false,
   tests:exercises.map(x=>({id:x.id,outcome:state[x.id]??"untested"})),
   summary:{completed:complete,needsReview:review,total:exercises.length},
   limitation:"Self-reported manual checks; no automated validation of a live target."
  };
  downloadDiagnosticText(JSON.stringify(out,null,2),
   "openguin-localhost-practice-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",
   "application/json;charset=utf-8");
  setNotice("已请求导出手动练习记录；报告不包含 Cookie、凭据或请求正文。");
 }
 return <section className="v07-card localhost-manual-lab">
  <header className="localhost-lab-head">
   <div><span className="eyebrow">SECURITY TOOLBOX V9 · REAL LOCALHOST HTTP</span>
    <h3>本机网站手动防御练习场 · Manual Localhost Lab</h3>
    <p>这一版不是仅在内存里计算虚拟事件：配套 Node.js 练习服务器会真正响应浏览器的 HTTP 请求。它只能监听本机回环地址，所有角色、页面和表单都是教学数据。</p></div>
   <span className="localhost-lab-tag">仅 127.0.0.1</span>
  </header>
  <div className="localhost-lab-grid">
   <div className="localhost-lab-card">
    <span className="localhost-lab-step">01 · 启动</span>
    <strong>在 OpenPenguin 源码目录的终端执行</strong>
    <div className="localhost-lab-code"><code>{command}</code>
      <button onClick={()=>{void navigator.clipboard.writeText(command).then(()=>
        setNotice("命令已复制。需要在安装 Node.js 的开发环境终端手动执行。")).catch(()=>
        setNotice("复制未成功，可手动选中上方命令。"));}}>复制命令</button></div>
    <small>需要 Node.js 开发环境；不会随当前 DMG 自动启动。可以用 Ctrl+C 停止服务器。</small>
   </div>
   <div className="localhost-lab-card">
    <span className="localhost-lab-step">02 · 手动访问</span>
    <strong>打开真实的本地 HTTP 练习网页</strong>
    <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
    <small>这个地址只指向当前电脑。不能从其他电脑、手机或线上网站访问，不支持自定义目标地址。</small>
    <a href="http://127.0.0.1:19090/access-log" target="_blank" rel="noopener noreferrer">下载本机练习日志 access.log</a>
    <a href="http://127.0.0.1:19090/manual-console" target="_blank" rel="noopener noreferrer">打开 v10 手动防御控制台（独立本地网页）</a>
    <a href="http://127.0.0.1:19090/workbench" target="_blank" rel="noopener noreferrer">打开 v16 手动 HTTP 响应头审计与计时工作台</a>
    <a href="http://127.0.0.1:19090/ownership-lab" target="_blank" rel="noopener noreferrer">打开 v12 权限漏洞与修复实验室</a>
    <a href="http://127.0.0.1:19090/defense-studio" target="_blank" rel="noopener noreferrer">打开 v13 OWASP/NIST 认证与流量防御教学实验室</a>
    <a href="http://127.0.0.1:19090/drills" target="_blank" rel="noopener noreferrer">打开 v14 三轨道手动攻防练习台</a>
    <a href="http://127.0.0.1:19090/defense-engine" target="_blank" rel="noopener noreferrer">打开 v15 高级排队/限流/授权与认证防御分析</a>
   </div>
  </div>
  <div className="localhost-lab-info">
   <strong>为什么要同时保留 v7/v8 和 v9？</strong>
   <p>v7/v8 用于快速理解防御策略和预期结果；v9 可以亲自通过浏览器、开发者工具或自己熟悉的普通 HTTP 客户端检查真实返回的 200、401、403、422、429 等状态。它不包含真实账号密码，也不适合作负载或漏洞利用测试。</p>
  </div>
  <div className="localhost-lab-checks">
   <div className="localhost-lab-row-head">
    <div><h4>手动练习记录</h4>
     <p>在上面的 localhost 网站操作后，按自己的观察标记结果。这些标记不会自动检测网站。</p></div>
    <div className="localhost-lab-count">{complete}/{exercises.length} 符合预期 · {review} 项复核</div>
   </div>
   <div className="localhost-lab-list">
    {exercises.map((x,i)=><article key={x.id}>
      <div className="localhost-lab-index">{String(i+1).padStart(2,"0")}</div>
      <div className="localhost-lab-item">
       <strong>{x.title}</strong><p>{x.action}</p><small>预期：{x.expected}</small>
       <div className="localhost-lab-choice" role="group" aria-label={x.title+" 手动结果"}>
        {(["untested","expected","review"] as Outcome[]).map(v=><button
         type="button" key={v} aria-pressed={(state[x.id]??"untested")===v}
         className={(state[x.id]??"untested")===v?"chosen":""}
         onClick={()=>update(x.id,v)}>{statusLabels[v]}</button>)}
       </div>
      </div>
    </article>)}
   </div>
   <div className="localhost-lab-actions">
    <button onClick={exportResults}>导出手动验证摘要 JSON</button>
    <button disabled={!Object.keys(state).length} onClick={()=>{setState({});setNotice("");}}>清空本次记录</button>
   </div>
   {notice&&<p role="status" className="localhost-lab-notice">{notice}</p>}
  </div>
  <small>真实线上网站与其他设备不在这个靶场的作用范围内。服务器没有攻击工具、字典、注入载荷、目标扫描、代理转发或自动化请求发送。不要用它判断线上服务器是否能抵抗高流量或入侵。</small>
 </section>;
}
