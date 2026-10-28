/**
 * Manual localhost HTTP workbench.
 * One user click => one request to a fixed relative route.
 * No custom target, no scripting of test sequences, no network automation.
 */
const allowed={
  health:{path:"/health",method:"GET",hint:"服务健康检查正常时返回 200。"},
  member:{path:"/member",method:"GET",hint:"未登录通常 401；演练成员或管理员为 200。"},
  admin:{path:"/admin",method:"GET",hint:"成员通常 403；演练管理员为 200；访客为 401。"},
  form:{path:"/form",method:"GET",hint:"访问受保护表单：访客 401，演练成员或管理员 200。"},
  rate:{path:"/rate-check",method:"GET",hint:"人工触发限流：初始 200，阈值后 429。"},
  csrf:{path:"/form",method:"POST",hint:"省略 CSRF 校验：已登录身份会收到 403。"},
  validation:{path:"/form",method:"POST",hint:"合法 CSRF 配合无效字段：已登录身份会收到 422。"},
  ordinary:{path:"/form",method:"POST",hint:"正常字段：已登录且校验通过返回 200。"}
};
const list=document.querySelector("#wb-history");
const summary=document.querySelector("#wb-summary");
const result=document.querySelector("#wb-current");
const token=document.querySelector("#wb-csrf")?.value??"";
const history=[];
let busy=false;
const labels={
  200:"允许/正常",401:"需要登录或会话无效",403:"服务器拒绝访问或校验失败",
  422:"字段校验未通过",429:"达到演示限流阈值",
  503:"服务不可用（概念性容量保护）"
};
function setText(node,text){if(node)node.textContent=text;}
function render(){
  list.replaceChildren();
  for(const row of history.slice().reverse()){
    const item=document.createElement("li");
    item.textContent=row.method+" "+row.path+" · HTTP "+row.status+
      " · "+row.durationMs+" ms · "+row.explanation;
    list.append(item);
  }
  setText(summary,"已执行 "+history.length+" 次手动请求。"+
    "最近一次结果："+(history.length?history.at(-1).status:"尚未开始")+"。");
}
async function inspect(id){
  if(busy||!Object.hasOwn(allowed,id))return;
  const spec=allowed[id];
  busy=true;
  const buttons=[...document.querySelectorAll("[data-lab-action]")];
  buttons.forEach(el=>{el.disabled=true;});
  const started=performance.now();
  try{
    const options={method:spec.method,credentials:"same-origin",cache:"no-store",
      redirect:"manual",headers:{"Accept":"text/html"}};
    if(spec.method==="POST"){
      options.headers["Content-Type"]="application/x-www-form-urlencoded";
      const fields=new URLSearchParams();
      if(id==="validation"){fields.set("csrf",token);fields.set("label","INVALID<>");}
      if(id==="ordinary"){fields.set("csrf",token);fields.set("label","Normal Test");}
      if(id==="csrf"){fields.set("label","Normal Test");}
      options.body=fields.toString();
    }
    // Path and method are constants above. User input never affects the target.
    const response=await fetch(spec.path,options);
    const durationMs=Math.max(0,Math.round(performance.now()-started));
    const status=response.status;
    const explained=labels[status]??"查看状态码和服务日志";
    const headers=[
      ["Cache-Control",response.headers.get("Cache-Control")],
      ["X-Content-Type-Options",response.headers.get("X-Content-Type-Options")],
      ["X-Frame-Options",response.headers.get("X-Frame-Options")],
      ["Referrer-Policy",response.headers.get("Referrer-Policy")],
      ["Retry-After",response.headers.get("Retry-After")]
    ].filter(([,value])=>value);
    const row={check:id,path:spec.path,method:spec.method,
      status,durationMs,explanation:explained};
    history.push(row);if(history.length>30)history.shift();
    setText(result, spec.method+" "+spec.path+" → HTTP "+status+
      "（"+explained+"）。"+spec.hint+" "+
      (headers.length?"观察到的安全响应头："+headers.map(([key,value])=>key+"="+value).join("；"):""));
    render();
  }catch{
    setText(result,"无法连接本机练习服务器，或浏览器阻止了这次请求。请检查页面和服务器是否来自相同的 localhost 地址。");
  }finally{
    busy=false;
    buttons.forEach(el=>{el.disabled=false;});
  }
}
document.querySelectorAll("[data-lab-action]").forEach(el=>{
  el.addEventListener("click",()=>{void inspect(el.dataset.labAction);});
});
document.querySelector("#wb-clear")?.addEventListener("click",()=>{
  history.length=0;
  setText(result,"已清空当前浏览器的本次记录，未修改服务器日志。");
  render();
});
document.querySelector("#wb-export")?.addEventListener("click",()=>{
  const report={schema:"openguin-local-manual-http-v11",
    source:"manual-single-click-requests",loopbackOnly:true,
    noCredentials:true,noResponseBodies:true,results:history.slice()};
  const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"});
  const uri=URL.createObjectURL(blob);
  const link=document.createElement("a");link.href=uri;
  link.download="openguin-local-manual-http.json";
  document.body.append(link);link.click();link.remove();
  URL.revokeObjectURL(uri);
});
render();
