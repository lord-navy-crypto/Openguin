/** Offline web-security lint, intentionally retaining no pasted values. */
export type Finding={code:string;severity:"review"|"suggest"|"info";title:string;reason:string;fix:string};
export type Report={schema:"openguin-lint-v6";tool:"cors"|"cache"|"sri"|"actions";
 findings:Finding[];metrics:Record<string,number|boolean>;scope:string;
 privacy:{rawInput:false;network:false;credentials:false}};
const limit=(s:string,max=60000)=>{if(s.length>max)throw Error("输入超过本地分析大小限制。");return s;};
const report=(tool:Report["tool"],findings:Finding[],metrics:Report["metrics"],scope:string):Report=>
 ({schema:"openguin-lint-v6",tool,findings,metrics,scope,privacy:{rawInput:false,network:false,credentials:false}});
function note(arr:Finding[],code:string,severity:Finding["severity"],title:string,reason:string,fix:string){
 arr.push({code,severity,title,reason,fix});
}
function headerMap(raw:string){
 const lines=limit(raw,30000).split(/\r?\n/);
 if(lines.length>500)throw Error("响应头超过 500 行限制。");
 const map=new Map<string,string[]>();
 for(const line of lines){
  const m=/^([a-z][a-z0-9-]{0,75}):\s*(.{0,4096})$/i.exec(line);
  if(!m)continue;
  const k=m[1].toLowerCase();map.set(k,[...(map.get(k)??[]),m[2].trim()]);
 }
 return map;
}
const get=(m:Map<string,string[]>,key:string)=>m.get(key)?.[0]??"";
export function checkCors(raw:string):Report{
 const m=headerMap(raw),f:Finding[]=[];
 const all=m.get("access-control-allow-origin")??[],origin=all[0]??"";
 const creds=get(m,"access-control-allow-credentials").toLowerCase()==="true";
 const vary=(m.get("vary")??[]).some(x=>x.toLowerCase().split(",").some(y=>y.trim()==="origin"));
 if(all.length>1)note(f,"origin-duplicate","review","重复 CORS 来源头","多条允许来源响应头可能使浏览器拒绝。","只返回一个允许来源，核对真实业务。");
 if(origin==="*"&&creds)note(f,"wildcard-creds","review","凭据模式与通配来源冲突","浏览器不会允许凭据跨源请求使用通配允许来源。","对真正需要的来源返回明确的 Origin，并独立执行服务器鉴权。");
 else if(origin==="*")note(f,"wildcard","info","允许任意来源无凭据读取","公开 API 可以使用通配来源，但 CORS 不能替代身份验证。","核对 API 公开程度与服务器权限。");
 if(origin==="null"&&creds)note(f,"null-creds","review","null 来源允许凭据","不透明来源可能与沙盒环境有关，需要谨慎审查。","只允许明确可信的浏览器来源。");
 if(origin&&origin!=="*"&&origin!=="null"&&!/^https?:\/\/[^,\s/]+$/i.test(origin))
  note(f,"bad-origin","review","来源字段格式异常","允许来源应为单一来源值、null 或 *。","不要返回逗号分隔的来源列表。");
 if(origin&&origin!=="*"&&!vary)note(f,"vary","suggest","未观察到 Vary: Origin","若按请求来源动态生成响应，缓存可能需要按 Origin 区分。","动态回显来源时评估设置 Vary: Origin。");
 if(creds&&["access-control-allow-headers","access-control-allow-methods","access-control-expose-headers"]
 .some(k=>get(m,k).split(",").some(x=>x.trim()==="*")))
  note(f,"other-wildcards","review","凭据模式下存在其他通配 CORS 字段","凭据请求对额外通配响应头存在限制。","列出确实需要的方法和字段。");
 if(!all.length)note(f,"missing","info","没有 CORS 来源响应头","不需要跨源读取的网站可以不设置该头。","先确认是否需要从其他网站的 JS 读取资源。");
 return report("cors",f,{headerNames:m.size,originHeaders:all.length,credentialed:creds,wildcard:origin==="*",varyOrigin:vary},
 "仅检查粘贴的响应头，不发送请求、运行预检或验证动态策略。");
}
export function checkCache(raw:string):Report{
 const m=headerMap(raw),f:Finding[]=[];
 const dirs=(m.get("cache-control")??[]).join(",").toLowerCase().split(",").map(x=>x.trim());
 const has=(s:string)=>dirs.some(x=>x===s||x.startsWith(s+"="));
 const sensitive=m.has("set-cookie")||m.has("www-authenticate")||m.has("authorization");
 const shared=has("public")||has("s-maxage"),noStore=has("no-store"),priv=has("private");
 if(sensitive&&shared&&!noStore&&!priv)
  note(f,"shared-personal","review","身份相关信号与共享缓存设置并存","可能存在缓存个性化响应的风险，但仅凭头部无法确定内容。","核对受保护响应与 CDN 的实际缓存规则，考虑 private/no-store。");
 else if(sensitive&&!noStore&&!priv)
  note(f,"personal-cache","suggest","身份相关响应未显式限制缓存","Cookie 或认证信号不必然说明响应包含隐私信息。","对包含个人信息的响应审查 private/no-store 是否合适。");
 if(has("public")&&has("private"))
  note(f,"conflict","review","混合 public 和 private","策略意图可能不清晰。","清理互相矛盾的指令并验证行为。");
 if(has("no-cache")&&!noStore)
  note(f,"no-cache","info","no-cache 不等于 no-store","no-cache 允许存储，但复用前需要重新验证。","真正需要禁止存储时才考虑 no-store。");
 if(!m.has("cache-control"))
  note(f,"missing","info","缺少 Cache-Control","该响应可能遵循其他缓存约束或默认规则。","依据资源是否个人化以及性能需要制定策略。");
 return report("cache",f,{headerNames:m.size,sensitiveSignals:sensitive,shared,noStore,private:priv,cacheControl:dirs.length>0&&dirs[0]!==""},
 "静态响应头检查，无法证实 CDN 是否缓存了私有内容。");
}
function attr(tag:string,name:string):string|null{
 // An intentionally conservative tag-attribute tokenizer, not an HTML parser.
 const body=tag.replace(/^<\s*[a-z][a-z0-9-]*\b/i,"");
 const regex=/([a-z][a-z0-9:-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/gi;
 for(const m of body.matchAll(regex)){
  if(m[1].toLowerCase()===name)return m[2]??m[3]??m[4]??"";
 }
 return null;
}
function sriValid(raw:string){
 return raw.trim().split(/\s+/).some(s=>{
  const m=/^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(s);
  return !!m&&m[2].length===(m[1]==="sha256"?44:m[1]==="sha384"?64:88);
 });
}
export function checkSri(raw:string):Report{
 const text=limit(raw),f:Finding[]=[];
 const tags=[...text.matchAll(/<\s*(script|link)\b[^>]{0,3000}>/gi)];
 if(tags.length>400)throw Error("资源标签超过 400 项限制。");
 let count=0,external=0,missing=0,invalid=0,cross=0;
 for(const m of tags){
  const tag=m[0],type=m[1].toLowerCase();
  if(type==="link"&&!/\b(?:stylesheet|modulepreload|preload)\b/i.test(attr(tag,"rel")??""))continue;
  const url=attr(tag,type==="script"?"src":"href");if(!url)continue;
  count++;if(!/^(?:https?:)?\/\//i.test(url))continue;
  external++;
  const integrity=attr(tag,"integrity");
  if(!integrity){missing++;continue;}
  if(!sriValid(integrity))invalid++;
  if(attr(tag,"crossorigin")===null)cross++;
 }
 if(missing)note(f,"missing","suggest","外部资源缺少 SRI","检测到 "+missing+" 项未提供 integrity 的外部脚本或样式资源。","对版本固定的第三方资源考虑提供可信 SHA 摘要。");
 if(invalid)note(f,"invalid","review","完整性摘要格式不符合预期","检测到 "+invalid+" 项缺少可识别的 SHA-256/384/512 Base64 摘要。","从可信发布流程获得匹配实际文件的摘要。");
 if(cross)note(f,"crossorigin","suggest","部分外部资源的跨源模式需复核","检测到 "+cross+" 项带 SRI 但缺少 crossorigin。","核对资源服务端 CORS 及实际的跨源加载模式。");
 if(!count)note(f,"none","info","没有识别出静态资源引用","网页可能动态注入资源，或输入只是部分 HTML。","在自己的网站检查最终加载资源。");
 return report("sri",f,{tags:tags.length,resources:count,external,missing,invalid,crossoriginMissing:cross},
 "离线 HTML 标签分析，不执行 JavaScript、不读取 CDN 文件，也不验证真实摘要。");
}
export function checkActions(raw:string):Report{
 const lines=limit(raw).split(/\r?\n/),f:Finding[]=[];
 if(lines.length>1500)throw Error("工作流输入超过 1,500 行限制。");
 let uses=0,unpinned=0,wide=0,writes=0,trigger=0,pipes=0,interpolation=0,permission=false;
 for(const s of lines){
  if(/^\s*#/.test(s))continue;
  if(/^\s*permissions\s*:/i.test(s))permission=true;
  if(/^\s*permissions\s*:\s*write-all\b/i.test(s))wide++;
  if(/^\s*(?:contents|actions|packages|issues|pull-requests|deployments|id-token)\s*:\s*write\b/i.test(s))writes++;
  if(/\b(?:pull_request_target|workflow_run)\s*:/i.test(s))trigger++;
  const m=/^\s*(?:-\s*)?uses\s*:\s*([^\s#]+)/i.exec(s);
  if(m){
   const ref=m[1].replace(/^['"]|['"]$/g,"");
   if(!ref.startsWith("./")&&!ref.startsWith("docker://")){
    uses++;const at=ref.lastIndexOf("@");
    if(at<0||!/^[a-f0-9]{40}$/i.test(ref.slice(at+1)))unpinned++;
   }
  }
  if(/\b(?:curl|wget)\b.{0,240}\|\s*(?:sudo\s+)?(?:bash|sh)\b/i.test(s))pipes++;
  if(/\$\{\{\s*github\.event\.(?:pull_request\.title|issue\.title|comment\.body)/i.test(s))interpolation++;
 }
 if(wide)note(f,"write-all","review","检测到 write-all 权限","工作流出现 "+wide+" 处广泛写入令牌权限。","只授予实际任务需要的权限。");
 if(writes)note(f,"write","suggest","工作流存在显式写入权限","检测到 "+writes+" 项写入权限配置；可能是发布流程的正常需要。","检查触发来源与最小权限范围。");
 if(!permission)note(f,"permissions","suggest","未观察到显式 permissions 块","实际默认权限取决于仓库/组织设置。","在工作流或 job 中明确声明必要令牌权限。");
 if(trigger)note(f,"triggers","review","检测到需审查的高权限触发方式","出现 "+trigger+" 处 pull_request_target/workflow_run 线索。","避免把不可信的外部贡献内容与高权限工作流混合执行。");
 if(unpinned)note(f,"unpinned","suggest","动作引用未固定完整 SHA","发现 "+unpinned+" 条 uses 没有指向完整的 40 位提交 SHA。","确认可信发布者后采用固定 SHA 与受控升级策略。");
 if(pipes)note(f,"remote-shell","review","检测到下载内容直送 shell 模式","有 "+pipes+" 个需要审查的流水线执行线索。","评估供应链来源、校验与版本固定，避免未审查的远端脚本直接运行。");
 if(interpolation)note(f,"interpolation","review","外部事件字段可能进入命令脚本","有 "+interpolation+" 处直接插入事件文本的线索。","为外部输入建立数据与代码边界，不直接构成 shell 命令。");
 return report("actions",f,{lines:lines.length,actions:uses,unpinned,writeAll:wide,writeKeys:writes,sensitiveTriggers:trigger,
  downloadToShell:pipes,eventInterpolations:interpolation,permissionsDeclared:permission},
 "文本启发式，不是完整 YAML 解析器，无法识别所有模板、权限继承或运行时行为。");
}
