/** Local-first static reviews. Input values, paths and credentials never appear in exports. */
export type Finding={id:string;level:"review"|"improve"|"info";title:string;detail:string;remedy:string};
export type Review={schema:"openguin-local-defense-v5";tool:"cookies"|"dependencies"|"secrets"|"signature";
  findings:Finding[];stats:Record<string,number|boolean|string>;caveats:string[];privacy:{rawInput:false;network:false;credentials:false}};
function create(tool:Review["tool"],findings:Finding[],stats:Review["stats"],caveats:string[]):Review{
 return {schema:"openguin-local-defense-v5",tool,findings,stats,caveats,privacy:{rawInput:false,network:false,credentials:false}};
}
function flag(out:Finding[],id:string,level:Finding["level"],title:string,detail:string,remedy:string){
 out.push({id,level,title,detail,remedy});
}
function bound(s:string,limit:number){if(s.length>limit)throw Error("文件或内容超过本地分析大小限制。");return s;}
export function auditSetCookies(raw:string):Review {
 const lines=bound(raw,24000).split(/\r?\n/).filter(s=>/^\s*Set-Cookie\s*:/i.test(s)).slice(0,150);
 const findings:Finding[]=[];let valid=0,secureMissing=0,httpMissing=0,sameMissing=0,noneMissing=0,prefixBad=0,wide=0;
 for(const line of lines){
  const parts=line.replace(/^\s*Set-Cookie\s*:\s*/i,"").split(";").map(s=>s.trim());
  const first=parts.shift()??"",at=first.indexOf("=");
  if(at<=0||!/^[!#$%&'*+\-.^_|~0-9a-zA-Z]{1,120}$/.test(first.slice(0,at)))continue;
  valid++;
  const name=first.slice(0,at),attrs=new Map<string,string>();
  for(const item of parts){const split=item.indexOf("=");const k=(split<0?item:item.slice(0,split)).trim().toLowerCase();
   if(k)attrs.set(k,split<0?"":item.slice(split+1).trim());}
  const secure=attrs.has("secure"),only=attrs.has("httponly"),same=attrs.get("samesite")?.toLowerCase();
  if(!secure)secureMissing++;if(!only)httpMissing++;if(!same)sameMissing++;
  if(same==="none"&&!secure)noneMissing++;if(attrs.has("domain"))wide++;
  if((name.startsWith("__Secure-")&&!secure)||(name.startsWith("__Host-")&&(!secure||attrs.has("domain")||attrs.get("path")!=="/")))prefixBad++;
 }
 if(!lines.length)flag(findings,"no-cookies","info","没有 Set-Cookie 响应头","需要输入服务端 Set-Cookie 响应头，而不是浏览器 Cookie 请求头。","从自有网站的响应头复制，不要分享真实会话值。");
 if(secureMissing)flag(findings,"secure","review","缺少 Secure","有 "+secureMissing+" 条 Cookie 未设置 Secure。","对于 HTTPS 网站，检查身份会话 Cookie 是否启用 Secure。");
 if(httpMissing)flag(findings,"httponly","improve","缺少 HttpOnly","有 "+httpMissing+" 条 Cookie 未设置 HttpOnly，某些前端业务 Cookie 可能需要被 JS 访问。","优先确认身份会话类 Cookie 设置 HttpOnly。");
 if(sameMissing)flag(findings,"samesite","improve","未明确声明 SameSite","有 "+sameMissing+" 条 Cookie 没有显式 SameSite。","结合登录跳转、跨站业务与 CSRF 保护选择 Lax 或 Strict。");
 if(noneMissing)flag(findings,"none-secure","review","SameSite=None 缺少 Secure","有 "+noneMissing+" 条 Cookie 组合不符合现代浏览器要求。","核对跨站必要性并启用 Secure。");
 if(prefixBad)flag(findings,"prefix","review","Cookie 安全前缀不匹配","有 "+prefixBad+" 条 __Host- 或 __Secure- Cookie 的属性不匹配。","__Host- 需要 Secure、Path=/、无 Domain；__Secure- 需要 Secure。");
 if(wide)flag(findings,"domain","info","Cookie 具有 Domain 属性","有 "+wide+" 条声明了 Domain 属性。","仅在有明确需求时跨子域共享身份信息。");
 return create("cookies",findings,{observed:lines.length,valid,secureMissing,httpMissing,sameMissing,noneMissing,prefixBad,domainAttribute:wide},
 ["静态检查，无法判断 Cookie 角色或真实浏览器行为。","原始 Cookie 值与名称从未写入报告；应避免分享真实会话令牌。"]);
}
export function auditDependencies(raw:string):Review {
 bound(raw,400000);let obj:unknown;
 try{obj=JSON.parse(raw);}catch{throw Error("请输入有效 package.json 或 package-lock.json JSON。");}
 if(!obj||typeof obj!=="object"||Array.isArray(obj))throw Error("依赖清单必须是 JSON 对象。");
 const root=obj as Record<string,unknown>,findings:Finding[]=[];
 let total=0,floating=0,remote=0,workspace=0,scripts=0,ignored=0;
 const scan=(data:unknown)=>{
  if(!data||typeof data!=="object"||Array.isArray(data))return;
  for(const value of Object.values(data as Record<string,unknown>)){
   if(total>=10000){ignored++;continue;}
   if(typeof value!=="string"){ignored++;continue;}
   total++;
   if(/^(?:\*|latest|next|x|>=|>|\^|~)/i.test(value))floating++;
   if(/^(?:git\+|git:|https?:)/i.test(value))remote++;
   if(/^(?:file:|link:|workspace:)/i.test(value))workspace++;
  }
 };
 scan(root.dependencies);scan(root.devDependencies);scan(root.optionalDependencies);
 const lock=Number.isInteger(root.lockfileVersion)&&!!root.packages&&typeof root.packages==="object";
 if(lock){
  for(const v of Object.values(root.packages as Record<string,unknown>).slice(0,10000)){
   if(!v||typeof v!=="object"||Array.isArray(v))continue;
   const p=v as Record<string,unknown>;
   if(p.hasInstallScript===true)scripts++;
   if(typeof p.resolved==="string" && /^(?:git\+|git:|http:)/i.test(p.resolved))remote++;
  }
 }
 if(!lock)flag(findings,"lock","info","输入不是 npm 锁文件","这可能只是 package.json，不能证明构建可复现。","核查是否提交了受支持的锁文件并在 CI 中使用锁文件安装。");
 if(floating)flag(findings,"floating","improve","存在浮动的版本约束","发现 "+floating+" 项宽松版本表达式。","结合锁文件、自动更新计划和回归测试审查版本控制。");
 if(remote)flag(findings,"remote","review","存在远程源码依赖","发现 "+remote+" 项 Git/HTTP 等来源线索。","核实来源可信度、TLS、版本锁定和供应链审核流程。");
 if(workspace)flag(findings,"workspace","info","本地/工作区依赖","发现 "+workspace+" 项本地或 monorepo 引用。","核对构建环境能正确找到本地依赖。");
 if(scripts)flag(findings,"scripts","review","存在安装生命周期脚本","锁文件标记 "+scripts+" 个包带安装脚本。","在可信的隔离构建环境审查安装脚本来源和必要性。");
 return create("dependencies",findings,{declaredEntries:total,floating,remote,workspace,installScriptFlags:scripts,ignored,lockfileDetected:lock},
 ["不联网查已知漏洞，也不验证实际安装版本；不构成安全认证。","不会把包名、依赖 URL、版本字符串或文件路径写入报告。"]);
}
export function auditSecretExposure(raw:string):Review {
 const text=bound(raw,120000),lines=text.split(/\r?\n/);
 if(lines.length>3000)throw Error("分析上限为 3,000 行。");
 const patterns=[
  {id:"private-key",rx:/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/i,title:"私钥标记"},
  {id:"credential-assignment",rx:/\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|client[_-]?secret|password|passwd)\b\s*[:=]\s*["']?[A-Za-z0-9_+\/=.-]{16,}/i,title:"敏感变量赋值"},
  {id:"cloud-key",rx:/\bAKIA[0-9A-Z]{16}\b/,title:"云服务访问密钥外观"},
  {id:"repo-token",rx:/\bgh[pousr]_[A-Za-z0-9_]{22,}\b/,title:"代码托管令牌外观"},
  {id:"auth-header",rx:/\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9_.-]{18,}/i,title:"身份授权请求头"}
 ];
 const findings:Finding[]=[];let hitLines=0,hits=0;
 for(const line of lines){
  if(line.length>10000)continue;
  let found=false;
  for(const p of patterns){
   if(p.rx.test(line)){hits++;found=true;
     if(!findings.some(f=>f.id===p.id))flag(findings,p.id,"review","疑似"+p.title,"发现这一类敏感信息外观，输出不包括任何匹配字符。","在自己的源码中人工复核；若确为公开泄露，遵循服务提供方流程撤销并更换。");
   }
  }
  if(found)hitLines++;
 }
 return create("secrets",findings,{lines:lines.length,flaggedLines:hitLines,matchedPatterns:hits,categories:findings.length},
 ["规则匹配可能误报或漏报，不可作为秘密信息全面审计结论。","不会输出凭据、匹配文本、代码片段或原始文件路径。"]);
}
const allowed:Record<string,string[]>={pdf:["pdf"],png:["png"],jpeg:["jpg","jpeg"],gif:["gif"],
 zip:["zip","jar","docx","xlsx","pptx"],exe:["exe","dll"],elf:["elf","so"],macho:["dylib","app"],script:["sh","bash"],html:["html","htm"]};
export function auditFileSignature(fileName:string,input:Uint8Array):Review{
 if(input.length>8192)throw Error("只允许输入文件前 8 KiB。");
 const b=Array.from(input.slice(0,32)),starts=(p:number[])=>p.every((v,i)=>b[i]===v);
 let type="unknown";
 if(starts([37,80,68,70,45]))type="pdf";
 else if(starts([137,80,78,71,13,10,26,10]))type="png";
 else if(starts([255,216,255]))type="jpeg";
 else if(starts([71,73,70,56]))type="gif";
 else if(starts([80,75,3,4])||starts([80,75,5,6]))type="zip";
 else if(starts([77,90]))type="exe";
 else if(starts([127,69,76,70]))type="elf";
 else if([[254,237,250,206],[206,250,237,254],[254,237,250,207],[207,250,237,254],[202,254,186,190]].some(starts))type="macho";
 else if(starts([35,33]))type="script";
 else if(/^\s*(?:<!doctype html|<html[\s>])/i.test(new TextDecoder().decode(input.slice(0,512))))type="html";
 const bits=fileName.replace(/\\/g,"/").split("/").pop()?.toLowerCase().split(".")??[];
 const ext=bits.length>=2?bits[bits.length-1]:"",known=Object.values(allowed).flat().includes(ext);
 const mismatch=type!=="unknown"&&known&&!allowed[type].includes(ext);
 const findings:Finding[]=[];
 if(mismatch)flag(findings,"mismatch","review","文件扩展名与内容签名不符","实际文件头与最终扩展名不匹配，可能是合法封装差异。","确认来源与真实格式，避免仅凭图标或名称信任文件。");
 if(bits.length>=3&&["exe","sh","bat","cmd","jar","app","ps1"].includes(ext))
  flag(findings,"double-extension","review","多重扩展名","文件名包含多个扩展部分且最终扩展名指向程序或脚本。","显示完整文件名并检查来源，不运行未知文件。");
 if(["exe","elf","macho","script"].includes(type))
  flag(findings,"executable","info","检测到程序或脚本签名","文件可能包含可执行内容，但这不代表恶意。","使用可信发布渠道，并核对官方摘要。");
 if(type==="unknown")flag(findings,"unknown","info","没有识别常见文件签名","纯文本或不受支持格式可能没有固定文件头。","不能以此判断文件安全。");
 return create("signature",findings,{signature:type,recognized:type!=="unknown",extensionMismatch:mismatch,doubleExtension:bits.length>=3,bytesExamined:input.length},
 ["只读取前 8 KiB，不执行文件、不开网络、不进行恶意代码检测。","ZIP/JAR/DOCX 容器共享签名，无法仅靠文件头区分。","报告不含原始字节、文件名或文件路径。"]);
}
