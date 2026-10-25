/**
 * Deterministic, network-only fault triage.
 * Never claims to prove VPN failure or remote server incidents.
 * No user content, cookies, headers, or request bodies.
 */
export type BasicDns = {host:string;resolved:boolean;elapsedMs:number;error?:string|null};
export type BasicEndpoint = {name:string;host:string;reachable:boolean;status?:number|null;elapsedMs?:number|null;error?:string|null};
export type BasicSnapshot = {
  capturedAtMs:number;
  dns:BasicDns[];
  endpoints:BasicEndpoint[];
  route:{defaultInterface?:string|null;vpnLikely:boolean;vpnInterfaces:string[]};
  proxy:{environmentConfigured:boolean;systemConfigured:boolean};
  hints:string[];
};
export type HttpProbeSample = {
  elapsedMs:number;status?:number|null;success:boolean;failureKind?:string|null;
};
export type ProbeStability = {
  total:number;passed:number;httpRejected:number;transportFailed:number;
  minMs:number|null;medianMs:number|null;maxMs:number|null;spreadMs:number|null;
};
export function summarizeHttpProbes(samples:HttpProbeSample[]|undefined):ProbeStability|null {
  if(!samples?.length) return null;
  const finite=samples.slice(0,20).filter(s=>Number.isFinite(s.elapsedMs)&&s.elapsedMs>=0);
  if(!finite.length) return null;
  const good=finite.filter(s=>s.success).map(s=>s.elapsedMs).sort((a,b)=>a-b);
  const count=good.length;
  const median=count?good[Math.floor((count-1)/2)]*(count%2?1:.5)+(count%2?0:good[Math.floor(count/2)]*.5):null;
  return {
    total:finite.length,passed:count,
    httpRejected:finite.filter(s=>!s.success&&typeof s.status==="number").length,
    transportFailed:finite.filter(s=>!s.success&&s.status==null).length,
    minMs:count?good[0]:null,medianMs:median,maxMs:count?good[count-1]:null,
    spreadMs:count?good[count-1]-good[0]:null
  };
}
export type BasicSpeed = {
  capturedAtMs:number;provider:string;
  latencyMs?:number|null;jitterMs?:number|null;
  probeFailures:number;probeCount:number;probeSamples?:HttpProbeSample[];
  downloadMbps?:number|null;uploadMbps?:number|null;
  downloadError?:string|null;uploadError?:string|null;
};
export type TargetResult = {
  host:string;
  label:string;
  dns:"ok"|"failed"|"not-tested";
  https:"responded"|"failed"|"not-tested";
  status:number|null;
  elapsedMs:number|null;
  symptom:"dns"|"transport"|"rejection"|"server"|"ok"|"dns-only"|"unknown";
};
export function summarizeTargets(snapshot:BasicSnapshot|null):TargetResult[] {
  if(!snapshot) return [];
  const dnsByHost=new Map(snapshot.dns.map(d=>[d.host.toLowerCase(),d]));
  const endpointsByHost=new Map(snapshot.endpoints.map(e=>[e.host.toLowerCase(),e]));
  return [...new Set([...dnsByHost.keys(),...endpointsByHost.keys()])].map(host=>{
    const dns=dnsByHost.get(host);
    const endpoint=endpointsByHost.get(host);
    const dnsState:TargetResult["dns"]=dns?(dns.resolved?"ok":"failed"):"not-tested";
    const httpsState:TargetResult["https"]=endpoint?
      (endpoint.reachable?"responded":"failed"):"not-tested";
    let symptom:TargetResult["symptom"]="unknown";
    if(dnsState==="failed") symptom="dns";
    else if(httpsState==="failed") symptom="transport";
    else if(endpoint?.reachable) {
      const status=endpoint.status??0;
      symptom=[401,403,429].includes(status)?"rejection":
        status>=500?"server":"ok";
    } else if(dns) symptom="dns-only";
    return {
      host,label:endpoint?.name||host,
      dns:dnsState,https:httpsState,
      status:endpoint?.status??null,elapsedMs:endpoint?.elapsedMs??null,
      symptom
    };
  });
}
export type DiagnosticIssue = {
  code:string;
  severity:"critical"|"warning"|"info";
  title:string;
  evidence:string;
  action:string;
};
export type OneClickResult = {
  at:string;
  verdict:"network-failure"|"connection-problem"|"service-response"|"slow-or-unstable"|"no-clear-problem"|"incomplete";
  headline:string;
  issues:DiagnosticIssue[];
  checked:{dns:number;dnsPassed:number;https:number;httpsResponded:number;httpFailures:number;speedAttempted:boolean};
  context:{vpnInterfaceSignal:boolean;proxySignal:boolean};
  stability:ProbeStability|null;
  targets:TargetResult[];
  notes:string[];
};
const add = (issues:DiagnosticIssue[],code:string,severity:DiagnosticIssue["severity"],title:string,evidence:string,action:string)=>{
  issues.push({code,severity,title,evidence,action});
};
export function diagnoseOneClick(snapshot:BasicSnapshot|null,speed:BasicSpeed|null,notes:string[]=[]):OneClickResult {
  const dns=snapshot?.dns||[], endpoints=snapshot?.endpoints||[];
  const dnsPassed=dns.filter(d=>d.resolved).length;
  const responded=endpoints.filter(e=>e.reachable).length;
  const transportFailed=endpoints.filter(e=>!e.reachable);
  const blocked=endpoints.filter(e=>e.reachable && [401,403,429].includes(e.status??0));
  const serverErrors=endpoints.filter(e=>e.reachable && (e.status??0)>=500);
  const slow=endpoints.filter(e=>e.reachable && typeof e.elapsedMs==="number" && e.elapsedMs>=2000);
  const issues:DiagnosticIssue[]=[];
  const stability=summarizeHttpProbes(speed?.probeSamples);
  const targets=summarizeTargets(snapshot);
  if (!snapshot) {
    add(issues,"connection-unavailable","critical","连接诊断未完成",
      "没有有效的 DNS/HTTPS 诊断结果；不能仅凭测速推断原因。",
      "重新运行一键检测；若持续失败，检查本机网络连接和系统代理状态。");
  } else {
    if(dns.length && dnsPassed===0)
      add(issues,"dns-outage","critical","全部采样域名 DNS 解析失败",
        "测试中的 "+dns.length+" 个域名均无法解析；无法确认是本地网络、DNS 服务器还是 VPN DNS。",
        "确认本机已联网，检查 VPN/代理是否连接；再手动比较 VPN 开关前后的 DNS 结果。");
    else if(dnsPassed<dns.length)
      add(issues,"dns-partial","warning","部分域名 DNS 解析失败",
        "DNS 成功 "+dnsPassed+"/"+dns.length+"；可能是特定域名的解析或连接路径异常。",
        "检查失败域名、DNS 策略、VPN 分流和代理；不要直接更换所有网络设置。");
    if(endpoints.length && responded===0)
      add(issues,"https-outage","critical","采样 HTTPS 端点均无法返回响应",
        "HTTPS 响应 0/"+endpoints.length+"；DNS 成功与否需结合上方证据。",
        "验证路由、系统代理、TLS/证书以及目标服务是否可达；与另一网络对照。");
    else if(transportFailed.length)
      add(issues,"https-partial","warning","部分 HTTPS 连接出现传输故障",
        "有 "+transportFailed.length+" 个请求在收到 HTTP 状态之前失败，另有 "+responded+" 个端点返回响应。",
        "先比较失败端点与正常端点；检查 VPN 分流、代理、TLS 和目标站点。");
    if(blocked.length)
      add(issues,"http-rejection","warning","服务器已响应，但拒绝或限制了部分请求",
        blocked.map(x=>x.name+" HTTP "+x.status).join("；").slice(0,250)+"。注意：HTTP 401/403/429 不等于网络连接失败。",
        "核对登录及访问状态。出现 429 时避免短时间连续重试；不要以降速或丢包解释这些状态码。");
    const chatgpt=endpoints.find(x=>x.host==="chatgpt.com");
    const github=endpoints.find(x=>x.host==="github.com");
    if(chatgpt && github && github.reachable &&
        typeof github.status==="number" && github.status<400 &&
        (!chatgpt.reachable || (chatgpt.status??0)>=400)){
      add(issues,"target-specific","warning","ChatGPT 与 GitHub 对照站点表现不同",
        "GitHub 对照端点返回 HTTP "+github.status+"，而 ChatGPT "+
          (chatgpt.reachable?"返回 HTTP "+String(chatgpt.status??"未知"):"未返回 HTTP 响应")+"。",
        "优先查看 ChatGPT 相关域名的认证状态、域名解析、代理分流与服务状态；不能断言整个网络都故障。");
    }
    if(serverErrors.length)
      add(issues,"http-server-error","warning","部分服务返回 HTTP 5xx 错误",
        serverErrors.map(x=>x.name+" HTTP "+x.status).join("；").slice(0,250)+"；已收到响应，无法仅凭此断定故障原因。",
        "查看相应服务的官方状态公告，并在不同时间复测。");
    if(slow.length)
      add(issues,"slow-https","warning","部分 HTTPS 请求响应缓慢",
        slow.map(x=>x.name+" "+Math.round(x.elapsedMs||0)+"ms").join("；").slice(0,250)+"；这测的是 HTTP 请求耗时，不是 ICMP Ping。",
        "复测同一网站，结合 VPN、代理和页面级长任务事件判断是传输还是页面渲染。");
    if(snapshot.proxy.environmentConfigured||snapshot.proxy.systemConfigured)
      add(issues,"proxy-detected","info","检测到代理配置线索",
        "环境变量或 macOS 系统代理配置存在，但不能证明浏览器流量一定经过该代理。",
        "如果网页与桌面测速结果不一致，检查浏览器及系统代理是否使用不同出口。");
    if(snapshot.route.vpnLikely)
      add(issues,"vpn-indicative","info","存在 VPN 类网络接口线索",
        "检测到隧道接口或相关路由特征；这不是所有请求实际经过 VPN 的证明。",
        "要判断 VPN 是否影响问题，手动切换状态并使用相同测试目标复测。");
  }
  if (speed) {
    if(stability?.httpRejected) {
      add(issues,"probe-http-status","warning","HTTP 测速服务返回非成功状态",
        stability.httpRejected+"/"+stability.total+" 次测速探测收到 HTTP 非 2xx 状态，这不是断网或丢包的证据。",
        "检查测速提供方的响应状态。若其他网站正常，优先排查该服务而非整个网络。");
    }
    if(stability?.transportFailed) {
      add(issues,"probe-transport","warning","测速服务部分探测未得到 HTTP 响应",
        stability.transportFailed+"/"+stability.total+" 次探测遇到超时或传输失败；无法仅凭该指标判断物理链路丢包。",
        "与 DNS 和其他 HTTPS 网站结果比较；不要把 HTTP 失败率直接称作 Ping 丢包率。");
    }
    if(stability && stability.passed>=3 && stability.spreadMs!==null &&
        stability.medianMs!==null && stability.spreadMs>=400 &&
        stability.maxMs!==null && stability.maxMs>=3*Math.max(1,stability.medianMs)) {
      add(issues,"probe-spread","warning","多次 HTTP 探测耗时差异明显",
        "成功的 "+stability.passed+" 次请求中位数 "+Math.round(stability.medianMs)+
        "ms，最快 "+Math.round(stability.minMs??0)+"ms，最慢 "+Math.round(stability.maxMs)+"ms。",
        "检查是否有后台下载、VPN 路由波动或测速端点拥塞；建议在同一条件下再次运行。");
    }
    if(speed.probeCount>0 && speed.probeFailures>=speed.probeCount)
      add(issues,"speed-probes-failed","warning","测速服务 HTTP 探测全部失败",
        speed.probeFailures+"/"+speed.probeCount+" 次 HTTP 探测未成功；不等于真实 ICMP 丢包率。",
        "确认测速服务能否连接；若其他 HTTPS 端点正常，可能是测速服务单独不可达。");
    else if(speed.probeFailures>0)
      add(issues,"speed-probes-intermittent","warning","测速 HTTP 探测部分失败",
        speed.probeFailures+"/"+speed.probeCount+" 次 HTTP 请求未成功；不是标准丢包率。",
        "在相同时间段复测并核对代理、VPN 与测速服务状态。");
    if(speed.downloadError||speed.uploadError)
      add(issues,"throughput-incomplete","warning","上传或下载测速失败",
        [speed.downloadError?"下载测速失败":"",speed.uploadError?"上传测速失败":""].filter(Boolean).join("；")+"；可能是测速服务或某个网络阶段失败。",
        "检查 Cloudflare 测速服务可达性，避免依据失败测试推断实际带宽为零。");
    if(typeof speed.latencyMs==="number" && speed.latencyMs>800)
      add(issues,"high-http-latency","warning","HTTP 探测延迟较高",
        "采样均值 "+Math.round(speed.latencyMs)+"ms，包含 HTTP 请求开销，不是 ICMP Ping。",
        "使用相同测速服务复测，比较不同网络/VPN 状态以及浏览器页面的请求时间。");
    if(typeof speed.jitterMs==="number" && speed.jitterMs>180)
      add(issues,"high-http-jitter","warning","HTTP 采样延迟波动较大",
        "相邻 HTTP 请求耗时平均差值 "+Math.round(speed.jitterMs)+"ms，不代表底层网络抖动的精确测量。",
        "在空闲网络下复测；检查并发下载、VPN 出口和无线信号稳定性。");
    if(typeof speed.downloadMbps==="number" && speed.downloadMbps>0 && speed.downloadMbps<5)
      add(issues,"slow-download","warning","本次下载测速偏慢",
        "Cloudflare 测得 "+speed.downloadMbps.toFixed(1)+"Mbps；单次 HTTP 测速不代表长期带宽。",
        "重复测速、检查占用带宽的任务，并在 VPN 开启/关闭后比较。");
  }
  const serious=issues.filter(x=>x.severity==="critical");
  const warnings=issues.filter(x=>x.severity==="warning");
  const codeSet=new Set(issues.map(x=>x.code));
  let verdict:OneClickResult["verdict"]="no-clear-problem";
  if(!snapshot) verdict="incomplete";
  else if(codeSet.has("dns-outage") && codeSet.has("https-outage")) verdict="network-failure";
  else if(serious.length||codeSet.has("dns-partial")||codeSet.has("https-partial")) verdict="connection-problem";
  else if(codeSet.has("http-rejection")||codeSet.has("http-server-error")) verdict="service-response";
  else if(warnings.length) verdict="slow-or-unstable";
  const headline:Record<OneClickResult["verdict"],string>={
    "network-failure":"网络连接或 DNS 可能存在明显问题",
    "connection-problem":"检测到连接层异常，需要优先排查",
    "service-response":"服务器已响应，优先检查 HTTP 状态及服务情况",
    "slow-or-unstable":"发现速度、稳定性或测速方面的异常线索",
    "no-clear-problem":"采样端点未发现明确异常",
    "incomplete":"诊断未完成，无法判断网络情况"
  };
  return {
    at:new Date().toISOString(),verdict,headline:headline[verdict],issues,
    checked:{dns:dns.length,dnsPassed,https:endpoints.length,httpsResponded:responded,httpFailures:blocked.length+serverErrors.length,speedAttempted:speed!==null},
    context:{vpnInterfaceSignal:!!snapshot?.route.vpnLikely,
      proxySignal:!!(snapshot?.proxy.environmentConfigured||snapshot?.proxy.systemConfigured)},
    stability,targets,
    notes:[...notes,
      "检测结果是当前采样的证据，不能识别所有浏览器、VPN 或远程服务故障。",
      "网页渲染、响应流以及浏览器下载故障需要结合可选扩展进行页面级监测。"]
  };
}
