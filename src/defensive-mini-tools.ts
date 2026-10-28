/**
 * Local, non-networking configuration checks for authorized web properties.
 * Outputs are intentionally allowlisted: no pasted secrets, paths or TXT
 * values are copied into findings or exports.
 */
export type CheckFinding={code:string;level:"review"|"recommendation"|"info";title:string;detail:string;nextStep:string};
export type MiniToolReport={
  schema:"openguin-defensive-mini-tool-v1";
  tool:"csp"|"security-txt"|"dns"|"url"|"robots";
  findings:CheckFinding[];
  statistics:Record<string,number|boolean|string|null>;
  scope:string;
  privacy:{rawInputIncluded:false;networkRequestsMade:false};
};
const cap=(s:string,max=32000)=>{if(s.length>max)throw new Error("输入过大，请缩小为相关配置片段（上限 32 KB）。");return s.trim();};
function report(tool:MiniToolReport["tool"],findings:CheckFinding[],statistics:MiniToolReport["statistics"],scope:string):MiniToolReport{
  return {schema:"openguin-defensive-mini-tool-v1",tool,findings,statistics,scope,privacy:{rawInputIncluded:false,networkRequestsMade:false}};
}
function add(out:CheckFinding[],code:string,level:CheckFinding["level"],title:string,detail:string,nextStep:string){
  out.push({code,level,title,detail,nextStep});
}
export function inspectCsp(raw:string):MiniToolReport{
  const text=cap(raw,16000).replace(/^content-security-policy(?:-report-only)?\s*:/i,"").trim();
  const findings:CheckFinding[]=[];
  if(!text){add(findings,"empty","review","没有 CSP 策略","请从自有网站响应头复制 CSP 策略。","使用已有 Security Headers Audit 获取实际响应头，再在此核对策略。");return report("csp",findings,{directives:0},"Offline CSP policy review");}
  const directives=new Map<string,string>();
  let duplicates=0;
  for(const part of text.split(";").slice(0,120)){
    const tokens=part.trim().split(/\s+/).filter(Boolean);
    if(!tokens.length)continue;
    const key=tokens[0].toLowerCase();
    if(!/^[a-z][a-z0-9-]{0,48}$/.test(key))continue;
    if(directives.has(key))duplicates++;
    else directives.set(key,tokens.slice(1).join(" ").toLowerCase());
  }
  const script=directives.get("script-src")??directives.get("default-src")??"";
  if(duplicates)add(findings,"duplicate","review","检测到重复 CSP 指令","同一策略中的重复指令容易造成误判，浏览器通常只执行首个。","整理为单一、清晰的策略指令。");
  if(!directives.has("default-src"))add(findings,"default-src","recommendation","未观察到 default-src","没有通用的资源来源回退策略。","评估以 default-src 'self' 或更严格策略为基础。");
  if(!directives.has("script-src")&&!directives.has("default-src"))
    add(findings,"script-src","review","脚本资源未受到显式来源限制","缺少 script-src/default-src 信号。","为实际使用的脚本制定明确的来源规则。");
  if(/(?:^|\s)'unsafe-inline'(?:\s|$)/.test(script))
    add(findings,"unsafe-inline","review","脚本策略允许 unsafe-inline","可能削弱对脚本注入的防护；某些与 nonce/hash 组合的情况下语义不同。","检查实际 CSP 生效方式，考虑 nonce 或 hash 的发布流程。");
  if(/(?:^|\s)'unsafe-eval'(?:\s|$)/.test(script))
    add(findings,"unsafe-eval","review","脚本策略允许 unsafe-eval","允许某些动态代码求值行为。","核查框架兼容性后考虑移除动态求值权限。");
  if(/(?:^|\s)\*(?:\s|$)/.test(script))
    add(findings,"wildcard-script","review","脚本来源包含通配符","过宽的脚本来源策略需要进一步人工审核。","只保留网站实际依赖的脚本来源。");
  if(!directives.has("object-src"))add(findings,"object-src","recommendation","未显式限制 object-src","兼容性允许时可关闭旧式插件内容。","考虑 object-src 'none'。");
  if(!directives.has("base-uri"))add(findings,"base-uri","recommendation","未显式限制 base-uri","文档基准 URL 可能影响相对链接的解释。","考虑 base-uri 'self' 或 'none'。");
  if(!directives.has("frame-ancestors"))add(findings,"frame-ancestors","recommendation","未观察到 frame-ancestors","是否允许页面嵌入取决于产品需求。","按业务需要限制可嵌入此页面的站点。");
  if(directives.has("report-only"))
    add(findings,"unexpected-report-only","info","策略中出现 report-only 指令文本","真正的 Report-Only 是单独的 HTTP 响应头，不是普通 CSP 指令。","核对浏览器响应头是否使用 Content-Security-Policy-Report-Only。");
  return report("csp",findings,{directives:directives.size,duplicateDirectives:duplicates},"Static CSP directives only; cannot verify browser enforcement");
}
export function inspectSecurityTxt(raw:string,now=Date.now()):MiniToolReport{
  const text=cap(raw,32000),findings:CheckFinding[]=[];
  const fields=new Map<string,string[]>();
  let malformed=0;
  for(const line of text.split(/\r?\n/).slice(0,1000)){
    const s=line.trim();if(!s||s.startsWith("#"))continue;
    const m=/^([A-Za-z][A-Za-z0-9-]{0,60}):\s*(.{1,2048})$/.exec(s);
    if(!m){malformed++;continue;}
    const name=m[1].toLowerCase(),rows=fields.get(name)??[];
    rows.push(m[2].trim());fields.set(name,rows);
  }
  const contacts=fields.get("contact")??[],expiry=fields.get("expires")??[];
  const url=(v:string)=>{try{return new URL(v)}catch{return null}};
  if(!contacts.length)add(findings,"contact","review","缺少 Contact","RFC 9116 要求提供安全问题报告渠道。","填写可用的 HTTPS、mailto: 或 tel: Contact URI。");
  else if(contacts.some(v=>!["https:","mailto:","tel:"].includes(url(v)?.protocol??"")))
    add(findings,"contact-scheme","review","部分 Contact 不是受支持的安全 URI","报告地址需要符合 URI 语法；网页地址应使用 HTTPS。","核对每条 Contact 的协议和实际可用性。");
  if(expiry.length!==1)add(findings,"expires-count","review","Expires 必须恰好出现一次","缺失或重复的有效期字段会影响安全报告渠道可信度。","保留一个有效、明确的 Expires 日期。");
  else{
    const expire=Date.parse(expiry[0]);
    if(!Number.isFinite(expire)||!/(?:z|[+-]\d{2}:\d{2})$/i.test(expiry[0]))
      add(findings,"expires-format","review","Expires 时间格式无效","应使用明确的带时区 RFC 3339 时间戳。","例如 2027-10-28T00:00:00Z，并维护有效期。");
    else if(expire<now)add(findings,"expires-stale","review","安全报告信息已过期","security.txt 的 Expires 时间早于本次审查时间。","确认联系人仍可用并及时更新 Expires。");
  }
  if(fields.has("canonical")&&(fields.get("canonical")??[]).some(v=>url(v)?.protocol!=="https:"))
    add(findings,"canonical","review","Canonical URI 需要 HTTPS","Canonical 定义规范的 security.txt 文件位置。","使用 HTTPS 下的 /.well-known/security.txt 地址。");
  if(!fields.has("policy"))
    add(findings,"policy","info","未发现 Policy 字段","漏洞披露政策可帮助研究人员了解合适的报告方式。","如果有正式的披露流程，可以添加 HTTPS Policy 地址。");
  if(malformed)add(findings,"malformed","review","存在无法解析的字段行","部分内容格式不符合 field-name: value。","检查格式、字段名和换行。");
  return report("security-txt",findings,{fields:[...fields.values()].reduce((a,b)=>a+b.length,0),
    contactEntries:contacts.length,expiresEntries:expiry.length,malformedLines:malformed},
    "RFC 9116 text-only review; does not verify HTTPS placement, file ownership or signature");
}
export function inspectDnsZone(raw:string):MiniToolReport{
  const text=cap(raw),findings:CheckFinding[]=[];
  const rows:{name:string;type:string;value:string}[]=[];
  let ignored=0;
  for(const line of text.split(/\r?\n/).slice(0,800)){
    const s=line.trim();if(!s||s.startsWith(";")||s.startsWith("#"))continue;
    const m=/^(\S+)\s+(?:(?:\d{1,10})\s+)?(?:(?:IN)\s+)?(A|AAAA|CNAME|MX|TXT|CAA|NS|DS|DNSKEY)\s+(.{1,1800})$/i.exec(s);
    if(!m){ignored++;continue;}
    rows.push({name:m[1].toLowerCase().replace(/\.$/,""),type:m[2].toUpperCase(),value:m[3]});
  }
  const txt=rows.filter(r=>r.type==="TXT");
  const spf=txt.filter(r=>/v=spf1\b/i.test(r.value));
  const dmarc=txt.filter(r=>r.name.startsWith("_dmarc.") && /v=dmarc1\b/i.test(r.value));
  if(!spf.length)add(findings,"spf-not-shown","info","样本中未见 SPF","此样本可能不是完整的 DNS 区域记录。","若域名用于发信，核对已发布的 SPF TXT 记录。");
  if(spf.length>1)add(findings,"spf-multiple","review","样本有多个 SPF TXT 记录","多个 SPF 政策可能导致验证失败。","核对相同域名的 SPF 记录并整理为一条有效策略。");
  if(spf.some(r=>/\+all(?:\s|"|$)/i.test(r.value)))
    add(findings,"spf-permissive","review","SPF 允许任意发送方","存在 +all 的 SPF 策略应谨慎复核。","核对真实发信来源并使用符合部署需求的策略。");
  if(!dmarc.length)add(findings,"dmarc-not-shown","info","样本中未见 DMARC","不表示线上不存在该记录。","从授权的 DNS 管理面板核对 _dmarc 域名记录。");
  if(dmarc.some(r=>/\bp=none\b/i.test(r.value)))
    add(findings,"dmarc-monitor","info","DMARC 为监测模式","p=none 用于观察邮件认证结果，本身不会执行拒收政策。","完成合法发信源核对后再评估适合的实施策略。");
  if(!rows.some(r=>r.type==="CAA"))
    add(findings,"caa-not-shown","info","样本中未见 CAA","CAA 可用于声明哪些 CA 被允许为域名签发证书；本次输入可能不完整。","在 DNS 管理面板检查是否需要 CAA 限制。");
  if(ignored)add(findings,"unparsed","info","部分行不符合简单 DNS 记录文本格式","这是配置片段审查，不是完整 DNS 区域文件解析器。","改用每行一条 name TTL IN TYPE value 形式的记录。");
  return report("dns",findings,{recognizedRecords:rows.length,txtRecords:txt.length,spfRecords:spf.length,dmarcRecords:dmarc.length,ignoredLines:ignored},
    "Pasted DNS records only; no lookups, DNSSEC validation or evidence of live publication");
}
export function inspectUrl(raw:string):MiniToolReport{
  const text=cap(raw,4096),findings:CheckFinding[]=[];
  let u:URL;
  try{u=new URL(text)}catch{
    add(findings,"invalid","review","URL 格式无效","无法使用标准 URL 解析器解析。","核对协议和域名，避免复制不完整的地址。");
    return report("url",findings,{valid:false},"Offline URL anatomy; does not visit link");
  }
  if(!["https:","http:"].includes(u.protocol))
    add(findings,"scheme","review","不是 HTTP(S) 网页地址","该链接采用其他 URI 协议。","仅在了解协议作用后使用，不要直接打开未知链接。");
  if(u.protocol==="http:" && !["localhost","127.0.0.1","[::1]"].includes(u.hostname.toLowerCase()))
    add(findings,"http","recommendation","链接未使用 HTTPS","普通 HTTP 不能提供与 HTTPS 相同的传输保护。","如果管理这个网站，考虑 HTTPS 与正确的证书配置。");
  if(u.username||u.password)add(findings,"credentials","review","URL 包含用户信息字段","这可能混淆实际网站主机，并可能泄露私密信息。","不要在链接中嵌入账号或口令；核对真实主机。");
  if(u.hostname.startsWith("xn--")||u.hostname.includes(".xn--"))
    add(findings,"idn","info","域名包含 Punycode","国际化域名可能正常，也可能与相似字符混淆。","在浏览器中核对实际目标域名与来源。");
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(u.hostname)||u.hostname.startsWith("["))
    add(findings,"ip","info","直接使用 IP 地址","直接使用 IP 并不一定危险，但可能不符合预期站点域名。","核对这个 IP 是否是自己预期的服务器。");
  if(u.hostname.length>100)
    add(findings,"long-host","review","主机名较长","域名结构异常复杂时容易误读。","人工检查实际注册域名，而不是仅凭子域名前缀判断。");
  if(u.hash)add(findings,"fragment","info","URL 含本地片段标识","浏览器可能在本地处理片段；不要把它直接解释为网络请求参数。","分享链接前检查片段中是否有私密信息。");
  if(u.search)add(findings,"query","info","URL 含查询参数","查询参数有时包含私人资料；工具不会显示或导出参数。","分享前移除不必要的查询参数。");
  return report("url",findings,{valid:true,https:u.protocol==="https:",hasQuery:!!u.search,hasFragment:!!u.hash,hasCredentials:!!u.username||!!u.password},
    "Structural review only; no reputation lookup, navigation or claim that a link is malicious");
}
export function inspectRobotsTxt(raw:string):MiniToolReport{
  const text=cap(raw,16000),findings:CheckFinding[]=[];
  const lines=text.split(/\r?\n/).slice(0,600).map(l=>l.trim()).filter(l=>l&&!l.startsWith("#"));
  const robots=lines.filter(l=>/^user-agent\s*:/i.test(l));
  const deny=lines.filter(l=>/^disallow\s*:\s*\S+/i.test(l));
  const sitemap=lines.filter(l=>/^sitemap\s*:/i.test(l));
  if(!robots.length)add(findings,"agent","info","没有观察到 User-agent 指令","robots.txt 的规则通常按照目标机器人分组。","检查站点实际 robots.txt 的分组与预期搜索引擎政策。");
  if(deny.length)add(findings,"privacy","review","存在 Disallow 路径","robots.txt 是对合规爬虫的提示，不是登录验证或访问控制。","确保受保护资源由服务器鉴权，而非依赖 Disallow。");
  if(!sitemap.length)add(findings,"sitemap","info","未观察到 Sitemap 行","Sitemap 并非所有网站都需要。","如网站需要被索引，可检查站点地图发布方式。");
  return report("robots",findings,{ruleLines:lines.length,userAgentGroups:robots.length,disallowRules:deny.length,sitemapEntries:sitemap.length},
    "Offline robots.txt policy review; cannot enforce access control");
}
