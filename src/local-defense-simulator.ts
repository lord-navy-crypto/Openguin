/**
 * OpenPenguin local-only virtual web defense simulator.
 * This is not a network client, scanner, exploit runner or load generator.
 * Every "request" is an in-memory object with invented identifiers.
 */
export type SimulationScenario="normal"|"login-volume"|"role-boundary"|"csrf-review"|"expired-session"|"mixed";
export type SimKind="browse"|"login"|"admin"|"change";
export type SimRole="visitor"|"member"|"admin";
export type Decision="allow"|"block";
export type BlockReason="none"|"rate-limit"|"session-expired"|"role-denied"|"csrf-missing";
export type DefensePolicy={
  maxEventsPerWindow:number;
  rateWindowSeconds:number;
  sessionLifetimeMinutes:number;
  enforceRoles:boolean;
  requireCsrf:boolean;
  securityHeaders:boolean;
};
export type VirtualRequest={
  id:number;
  atMs:number;
  actor:string;
  kind:SimKind;
  role:SimRole;
  ageMinutes:number;
  csrfPresent:boolean;
  expected:Decision;
};
export type SimulationRow=VirtualRequest&{
  actual:Decision;
  reason:BlockReason;
  correct:boolean;
  responseStatus:200|401|403|429;
};
export type SimSummary={
  scenario:SimulationScenario;
  total:number;
  allowed:number;
  blocked:number;
  expectedBlocked:number;
  correctlyBlocked:number;
  missedProtections:number;
  falsePositives:number;
  correctDecisions:number;
  byReason:Record<BlockReason,number>;
  policy:DefensePolicy;
  securityHeaderSignal:"enabled"|"disabled";
  notes:string[];
};
export type SimulationResult={summary:SimSummary;rows:SimulationRow[]};
export const DEFAULT_POLICY:DefensePolicy={
  maxEventsPerWindow:6,rateWindowSeconds:60,sessionLifetimeMinutes:30,
  enforceRoles:true,requireCsrf:true,securityHeaders:true
};
export const LEARNING_BASELINE:DefensePolicy={
  maxEventsPerWindow:25,rateWindowSeconds:60,sessionLifetimeMinutes:240,
  enforceRoles:false,requireCsrf:false,securityHeaders:false
};
export const SCENARIOS:Array<{id:SimulationScenario;title:string;description:string}>=[
  {id:"normal",title:"普通网站访问",description:"访客阅读页面、已登录成员访问账户和更新个人设置"},
  {id:"login-volume",title:"高频登录事件模拟",description:"只生成连续登录事件记录，观察虚拟限流器何时生效；不包含任何口令"},
  {id:"role-boundary",title:"权限边界验证",description:"普通账户请求虚拟管理页面，测试角色访问规则是否拒绝"},
  {id:"csrf-review",title:"状态变更保护验证",description:"虚拟用户提交缺少 CSRF 校验信号的资料更新请求"},
  {id:"expired-session",title:"会话有效期验证",description:"虚拟会话已过期时访问账户资源"},
  {id:"mixed",title:"综合防御演练",description:"混合正常浏览、频率异常、权限边界、会话过期和状态变更事件"}
];
export function validatePolicy(input:DefensePolicy):DefensePolicy{
  const int=(x:number,min:number,max:number)=>Number.isInteger(x)&&x>=min&&x<=max;
  if(!int(input.maxEventsPerWindow,1,60)||!int(input.rateWindowSeconds,10,300)||
     !int(input.sessionLifetimeMinutes,1,720)||
     typeof input.enforceRoles!=="boolean"||
     typeof input.requireCsrf!=="boolean"||
     typeof input.securityHeaders!=="boolean")
    throw new Error("防御规则超出安全的本地演练参数范围。");
  return {...input};
}
function build(kind:SimKind,actor:string,time:number,role:SimRole,
  ageMinutes:number,csrfPresent:boolean,expected:Decision):Omit<VirtualRequest,"id">{
  return {kind,actor,atMs:time,role,ageMinutes,csrfPresent,expected};
}
export function generateVirtualRequests(scenario:SimulationScenario):VirtualRequest[]{
  if(!SCENARIOS.some(s=>s.id===scenario))throw new Error("未知的本地演练场景。");
  const items:Array<Omit<VirtualRequest,"id">>=[];
  if(scenario==="normal"||scenario==="mixed"){
    for(let i=0;i<8;i++)items.push(build("browse","reader",i*15000,"visitor",0,false,"allow"));
    items.push(build("browse","member",135000,"member",5,false,"allow"));
    items.push(build("change","member",150000,"member",5,true,"allow"));
  }
  if(scenario==="login-volume"||scenario==="mixed"){
    const count=scenario==="mixed"?12:24;
    for(let i=0;i<count;i++)items.push(build("login","synthetic-login",180000+i*1000,
      "visitor",0,false,i<6?"allow":"block"));
  }
  if(scenario==="role-boundary"||scenario==="mixed"){
    for(let i=0;i<4;i++)items.push(build("admin","regular-member",240000+i*12000,
      "member",3,true,"block"));
    items.push(build("admin","admin-actor",295000,"admin",3,true,"allow"));
  }
  if(scenario==="csrf-review"||scenario==="mixed"){
    for(let i=0;i<4;i++)items.push(build("change","member-csrf",305000+i*12000,
      "member",2,false,"block"));
    items.push(build("change","member-csrf",355000,"member",2,true,"allow"));
  }
  if(scenario==="expired-session"||scenario==="mixed"){
    for(let i=0;i<4;i++)items.push(build("browse","stale-session",365000+i*12000,
      "member",120,false,"block"));
    items.push(build("browse","fresh-session",420000,"member",3,false,"allow"));
  }
  return items.map((r,i)=>({...r,id:i+1})).sort((a,b)=>a.atMs-b.atMs||a.id-b.id);
}
export function simulateDefense(scenario:SimulationScenario,policyInput:DefensePolicy):SimulationResult{
  const policy=validatePolicy(policyInput);
  const requests=generateVirtualRequests(scenario);
  const timestamps=new Map<string,number[]>();
  const byReason:Record<BlockReason,number>={
    "none":0,"rate-limit":0,"session-expired":0,"role-denied":0,"csrf-missing":0
  };
  const rows:SimulationRow[]=[];
  for(const req of requests){
    const earlier=(timestamps.get(req.actor)??[]).filter(t=>t>req.atMs-policy.rateWindowSeconds*1000);
    // Rate limits are applied consistently to all virtual request categories.
    const overLimit=earlier.length>=policy.maxEventsPerWindow;
    earlier.push(req.atMs);timestamps.set(req.actor,earlier);
    let reason:BlockReason="none";
    if(overLimit)reason="rate-limit";
    else if(req.kind!=="login" && req.role!=="visitor" && req.ageMinutes>policy.sessionLifetimeMinutes)
      reason="session-expired";
    else if(req.kind==="admin"&&req.role!=="admin"&&policy.enforceRoles)
      reason="role-denied";
    else if(req.kind==="change"&&!req.csrfPresent&&policy.requireCsrf)
      reason="csrf-missing";
    const actual:Decision=reason==="none"?"allow":"block";
    const responseStatus:SimulationRow["responseStatus"]=
      reason==="rate-limit"?429:reason==="session-expired"?401:
      reason==="role-denied"||reason==="csrf-missing"?403:200;
    byReason[reason]++;
    rows.push({...req,actual,reason,correct:actual===req.expected,responseStatus});
  }
  const blocked=rows.filter(r=>r.actual==="block").length;
  const missed=rows.filter(r=>r.expected==="block"&&r.actual==="allow").length;
  const falsePos=rows.filter(r=>r.expected==="allow"&&r.actual==="block").length;
  const correctlyBlocked=rows.filter(r=>r.expected==="block"&&r.actual==="block").length;
  const notes=[
    "全部请求、身份、角色与时间戳均为内存中生成的虚构数据；没有发送真实网络流量。",
    "本模型是教学用简化防御逻辑，不能证明真实网站抗攻击能力或安全性。",
    "同一个高频模拟场景可同时展示限流的漏拦截与正常访问误拦截。",
    "不同网站应依据真实业务、服务器端权限和正常访问基线设计规则。",
    "安全响应头仅作为配置开关信号；本模拟器不验证浏览器中的实际安全策略。"
  ];
  return {summary:{
    scenario,total:rows.length,allowed:rows.length-blocked,blocked,
    expectedBlocked:rows.filter(r=>r.expected==="block").length,
    correctlyBlocked,missedProtections:missed,falsePositives:falsePos,
    correctDecisions:rows.length-missed-falsePos,
    byReason,policy,
    securityHeaderSignal:policy.securityHeaders?"enabled":"disabled",notes
  },rows};
}
export function compareDefensePolicies(scenario:SimulationScenario,a:DefensePolicy,b:DefensePolicy){
  const previous=simulateDefense(scenario,a).summary,next=simulateDefense(scenario,b).summary;
  return {
    scenario,
    previous:{correctDecisions:previous.correctDecisions,missedProtections:previous.missedProtections,falsePositives:previous.falsePositives,blocked:previous.blocked},
    updated:{correctDecisions:next.correctDecisions,missedProtections:next.missedProtections,falsePositives:next.falsePositives,blocked:next.blocked},
    deltaMissedProtections:next.missedProtections-previous.missedProtections,
    deltaFalsePositives:next.falsePositives-previous.falsePositives,
    caution:"减少漏拦截与减少误拦截可能需要权衡；只适用于本地合成事件。"
  };
}
export function exportSimulationSummary(run:SimulationResult){
  return {
    schema:"openguin-virtual-defense-simulation-v1",
    simulated:true,networkRequestsSent:0,
    summary:run.summary,
    eventCategoryCounts:run.rows.reduce((acc,r)=>{
      acc[r.kind]=(acc[r.kind]??0)+1;return acc;
    },{} as Record<SimKind,number>),
    privacy:{syntheticDataOnly:true,noUserIPs:true,noCredentials:true,noOriginalRequests:true},
    explanation:"In-memory mock evaluation; not an actual penetration test or website load test."
  };
}


/**
 * Create synthetic, bounded evidence files compatible with the existing
 * browser journal and Apache/Nginx access-log analyzers. No connections occur.
 * Every line has only loopback IP and invented routes.
 */
const SIMULATED_START=Date.UTC(2026,9,28,0,0,0);
const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function apacheStamp(time:number):string{
  const d=new Date(time);
  const pad=(n:number)=>String(n).padStart(2,"0");
  return pad(d.getUTCDate())+"/"+months[d.getUTCMonth()]+"/"+d.getUTCFullYear()+
    ":"+pad(d.getUTCHours())+":"+pad(d.getUTCMinutes())+":"+pad(d.getUTCSeconds())+" +0000";
}
export function virtualAccessLog(run:SimulationResult):string{
  if(run.rows.length>100)throw new Error("合成记录超过本地演练上限。");
  const paths:Record<SimKind,string>={
    browse:"/",login:"/login",admin:"/admin",change:"/account"
  };
  return run.rows.map(r=>{
    const method=r.kind==="login"||r.kind==="change"?"POST":"GET";
    return '127.0.0.1 - - ['+apacheStamp(SIMULATED_START+r.atMs)+'] "'+
      method+" "+paths[r.kind]+' HTTP/1.1" '+r.responseStatus+
      ' 96 "-" "OpenPenguin-VirtualLab"';
  }).join("\n")+"\n";
}
export function virtualBrowserJournal(run:SimulationResult){
  if(run.rows.length>100)throw new Error("合成记录超过本地演练上限。");
  return {
    schema:"openguin-browser-journal-v1",
    createdAt:new Date(SIMULATED_START+15*60000).toISOString(),
    retentionDays:30,capacity:2500,capacityDropped:0,recordingEnabled:false,
    recordCount:run.rows.length,
    events:run.rows.map(r=>({
      at:SIMULATED_START+r.atMs,host:"virtual.local",kind:"fetch-response",
      status:r.responseStatus,durationMs:25+(r.id*7)%90
    }))
  };
}
