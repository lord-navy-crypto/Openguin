/**
 * OpenPenguin Virtual Site Builder v8.
 *
 * All actors, pages, request events and responses are synthetic and evaluated
 * entirely in memory. There is no fetch(), socket, real authentication,
 * exploit payload, arbitrary URL, target hostname or server process.
 */
export type SiteTemplate="community"|"classroom"|"store";
export type SiteRole="guest"|"member"|"admin";
export type SiteAccess="public"|"member"|"admin";
export type CaseKind="normal"|"guest-access"|"role-boundary"|"resource-owner"|
  "session-expiry"|"form-origin"|"invalid-input"|"server-fault"|"mixed";
export type SitePage={
  id:string;
  label:string;
  access:SiteAccess;
  ownerOnly:boolean;
  stateChanging:boolean;
  validatesInput:boolean;
};
export type SiteBlueprint={
  template:SiteTemplate;
  siteLabel:string;
  pages:SitePage[];
};
export type DefenseSwitches={
  accessControl:boolean;
  ownershipChecks:boolean;
  sessionChecks:boolean;
  csrfChecks:boolean;
  inputValidation:boolean;
  genericErrors:boolean;
};
export type VirtualCase={
  id:string;
  caseKind:Exclude<CaseKind,"mixed">;
  pageId:string;
  actor:SiteRole;
  ownsResource:boolean;
  sessionValid:boolean;
  csrfValid:boolean;
  inputValid:boolean;
  fault:boolean;
};
export type VirtualOutcome="allow"|"deny"|"fault";
export type VirtualReason="none"|"authentication"|"role"|"ownership"|"expired"|
  "origin-check"|"invalid-input"|"server-error";
export type CaseResult=VirtualCase&{
  expected:VirtualOutcome;
  observed:VirtualOutcome;
  expectedReason:VirtualReason;
  observedReason:VirtualReason;
  status:200|401|403|422|500;
  correct:boolean;
  exposedDetails:boolean;
};
export type SiteRun={
  schema:"openguin-virtual-site-v8";
  template:SiteTemplate;
  scenario:CaseKind;
  total:number;
  correct:number;
  missedDenials:number;
  falseDenials:number;
  disclosedErrorDetails:number;
  statusCounts:Record<string,number>;
  cases:CaseResult[];
  switches:DefenseSwitches;
  warnings:string[];
};
export const PROTECTED_SWITCHES:DefenseSwitches={
  accessControl:true,ownershipChecks:true,sessionChecks:true,
  csrfChecks:true,inputValidation:true,genericErrors:true
};
export const TRAINING_SWITCHES:DefenseSwitches={
  accessControl:false,ownershipChecks:false,sessionChecks:false,
  csrfChecks:false,inputValidation:false,genericErrors:false
};
const page=(id:string,label:string,access:SiteAccess,ownerOnly=false,
  stateChanging=false,validatesInput=false):SitePage=>
  ({id,label,access,ownerOnly,stateChanging,validatesInput});
const TEMPLATES:Record<SiteTemplate,SitePage[]>={
  community:[
    page("home","公共首页","public"),page("feed","动态列表","public"),
    page("profile","个人主页","member"),
    page("messages","私人消息","member",true),
    page("settings","修改个人资料","member",true,true,true),
    page("moderation","管理控制台","admin")
  ],
  classroom:[
    page("home","课程首页","public"),page("catalog","公开课程","public"),
    page("dashboard","学习仪表盘","member"),
    page("submission","作业记录","member",true),
    page("submit","提交作业","member",true,true,true),
    page("staff","教师管理台","admin")
  ],
  store:[
    page("home","商城首页","public"),page("products","商品列表","public"),
    page("account","用户中心","member"),
    page("orders","订单记录","member",true),
    page("checkout","结算表单","member",true,true,true),
    page("inventory","商品管理台","admin")
  ]
};
const IDS=new Set(["home","feed","profile","messages","settings","moderation",
  "catalog","dashboard","submission","submit","staff",
  "products","account","orders","checkout","inventory"]);
export const SITE_SCENARIOS:Array<{id:CaseKind;title:string;description:string}>=[
  {id:"normal",title:"正常访问","description":"合法访客、成员与管理员访问相应页面"},
  {id:"guest-access",title:"访客权限边界","description":"虚拟访客请求仅限登录成员的页面"},
  {id:"role-boundary",title:"角色权限边界","description":"普通成员请求仅管理员可见的页面"},
  {id:"resource-owner",title:"资源归属检查","description":"成员请求属于另一名虚拟成员的私有资源"},
  {id:"session-expiry",title:"过期会话检查","description":"有成员角色，但会话有效期已结束"},
  {id:"form-origin",title:"表单来源校验","description":"虚拟状态变更缺少有效的 CSRF 校验标记"},
  {id:"invalid-input",title:"输入验证","description":"表单数据与字段规则不匹配，不包含具体攻击内容"},
  {id:"server-fault",title:"内部错误信息保护","description":"虚拟服务器产生错误，观察是否暴露调试细节"},
  {id:"mixed",title:"综合演练","description":"混合合法访问和上述不同的防御检查"}
];
export function makeSite(template:SiteTemplate):SiteBlueprint{
 if(!Object.hasOwn(TEMPLATES,template))throw Error("未知的虚拟网站模板。");
 return {template,siteLabel:template==="community"?"社区演练站":
  template==="classroom"?"课程演练站":"商店演练站",
  pages:TEMPLATES[template].map(p=>({...p}))};
}
export function validateSite(site:SiteBlueprint):SiteBlueprint{
 if(!site||!Object.hasOwn(TEMPLATES,site.template)||
   !Array.isArray(site.pages)||site.pages.length<2||site.pages.length>12||
   typeof site.siteLabel!=="string"||site.siteLabel.length>45)
  throw Error("虚拟站点配置超出本地模板限制。");
 const allowed=new Set(TEMPLATES[site.template].map(p=>p.id));
 const ids=new Set<string>();
 for(const p of site.pages){
  if(!p||!IDS.has(p.id)||!allowed.has(p.id)||ids.has(p.id)||
   typeof p.label!=="string"||p.label.length<1||p.label.length>44||
   !["public","member","admin"].includes(p.access)||
   typeof p.ownerOnly!=="boolean"||typeof p.stateChanging!=="boolean"||
   typeof p.validatesInput!=="boolean")throw Error("虚拟页面定义不符合模板规则。");
  ids.add(p.id);
 }
 return {...site,pages:site.pages.map(p=>({...p}))};
}
export function validateSwitches(input:DefenseSwitches):DefenseSwitches{
 if(!input||Object.keys(PROTECTED_SWITCHES).some(k=>
  typeof input[k as keyof DefenseSwitches]!=="boolean"))
  throw Error("防御开关配置无效。");
 return {...input};
}
function fixture(kind:Exclude<CaseKind,"mixed">,p:SitePage,i:number):VirtualCase{
 const actor:SiteRole=kind==="normal"?
    (p.access==="admin"?"admin":p.access==="member"?"member":"guest"):
    kind==="guest-access"?"guest":"member";
 return {
  id:kind+"-"+p.id+"-"+i,caseKind:kind,pageId:p.id,actor,
  ownsResource:kind!=="resource-owner",sessionValid:kind!=="session-expiry",
  csrfValid:kind!=="form-origin",inputValid:kind!=="invalid-input",
  fault:kind==="server-fault"
 };
}
function applicable(kind:Exclude<CaseKind,"mixed">,p:SitePage){
 if(kind==="normal")return true;
 if(kind==="guest-access")return p.access==="member";
 if(kind==="role-boundary")return p.access==="admin";
 if(kind==="resource-owner")return p.ownerOnly&&p.access!=="public";
 if(kind==="session-expiry")return p.access!=="public";
 if(kind==="form-origin")return p.stateChanging;
 if(kind==="invalid-input")return p.validatesInput;
 return kind==="server-fault";
}
export function generateSiteCases(siteInput:SiteBlueprint,kind:CaseKind):VirtualCase[]{
 const site=validateSite(siteInput);
 if(!SITE_SCENARIOS.some(s=>s.id===kind))throw Error("未知虚拟演练类型。");
 const kinds:Exclude<CaseKind,"mixed">[]=kind==="mixed"?[
   "normal","guest-access","role-boundary","resource-owner",
   "session-expiry","form-origin","invalid-input","server-fault"
 ]:[kind];
 const out:VirtualCase[]=[];
 for(const k of kinds){
  const pages=site.pages.filter(p=>applicable(k,p));
  for(let i=0;i<pages.length&&i<8;i++){
   out.push(fixture(k,pages[i],i+1));
   if(out.length>=80)return out;
  }
 }
 return out;
}
function decide(c:VirtualCase,p:SitePage,s:DefenseSwitches):
  {outcome:VirtualOutcome;reason:VirtualReason;status:200|401|403|422|500}{
 if(c.fault)return {outcome:"fault",reason:"server-error",status:500};
 if(s.accessControl){
  if(c.actor==="guest"&&p.access!=="public")
   return {outcome:"deny",reason:"authentication",status:401};
  if(c.actor==="member"&&p.access==="admin")
   return {outcome:"deny",reason:"role",status:403};
 }
 if(s.sessionChecks && c.actor!=="guest"&&!c.sessionValid)
  return {outcome:"deny",reason:"expired",status:401};
 if(s.ownershipChecks&&p.ownerOnly&&c.actor!=="admin"&&!c.ownsResource)
  return {outcome:"deny",reason:"ownership",status:403};
 if(s.csrfChecks&&p.stateChanging&&!c.csrfValid)
  return {outcome:"deny",reason:"origin-check",status:403};
 if(s.inputValidation&&p.validatesInput&&!c.inputValid)
  return {outcome:"deny",reason:"invalid-input",status:422};
 return {outcome:"allow",reason:"none",status:200};
}
export function runVirtualSite(siteInput:SiteBlueprint,scenario:CaseKind,
  switchesInput:DefenseSwitches):SiteRun{
 const site=validateSite(siteInput),switches=validateSwitches(switchesInput);
 const cases=generateSiteCases(site,scenario);
 const pages=new Map(site.pages.map(p=>[p.id,p]));
 const rows:CaseResult[]=cases.map(c=>{
  const p=pages.get(c.pageId)!;
  const expected=decide(c,p,PROTECTED_SWITCHES);
  const actual=decide(c,p,switches);
  const exposedDetails=c.fault&&!switches.genericErrors;
  return {...c,expected:expected.outcome,observed:actual.outcome,
    expectedReason:expected.reason,observedReason:actual.reason,
    status:actual.status,correct:actual.outcome===expected.outcome&&!exposedDetails,
    exposedDetails};
 });
 const missed=rows.filter(r=>r.expected==="deny"&&r.observed==="allow").length;
 const falseDeny=rows.filter(r=>r.expected==="allow"&&r.observed==="deny").length;
 const exposure=rows.filter(r=>r.exposedDetails).length;
 const statuses:Record<string,number>={};
 for(const r of rows)statuses[String(r.status)]=(statuses[String(r.status)]??0)+1;
 return {
  schema:"openguin-virtual-site-v8",template:site.template,scenario,total:rows.length,
  correct:rows.filter(r=>r.correct).length,missedDenials:missed,
  falseDenials:falseDeny,disclosedErrorDetails:exposure,
  statusCounts:statuses,cases:rows,switches,
  warnings:[
   "纯内存模拟：没有创建 Web 服务器，没有打开监听端口，也没有向任何网站发送请求。",
   "事件中没有攻击载荷、真实账户、密码、客户信息或互联网地址。",
   "访问控制、资源归属、会话、CSRF、输入校验和错误屏蔽均为简化教学规则。",
   "更改页面的预期访问权限会改变本场景中的正确答案；本结果不证明网站安全。"
  ]
 };
}
export function compareVirtualSite(site:SiteBlueprint,scenario:CaseKind,chosen:DefenseSwitches){
 const baseline=runVirtualSite(site,scenario,TRAINING_SWITCHES);
 const protectedRun=runVirtualSite(site,scenario,chosen);
 return {
  baseline:{correct:baseline.correct,missed:baseline.missedDenials,exposed:baseline.disclosedErrorDetails},
  current:{correct:protectedRun.correct,missed:protectedRun.missedDenials,exposed:protectedRun.disclosedErrorDetails}
 };
}
export function exportSiteRun(run:SiteRun){
 const {cases,...summary}=run;
 return {schema:"openguin-virtual-site-summary-v8",simulated:true,networkRequestsSent:0,
  summary,caseKindCounts:cases.reduce((acc,c)=>{
   acc[c.caseKind]=(acc[c.caseKind]??0)+1;return acc;
  },{} as Record<string,number>),
  privacy:{syntheticOnly:true,noCredentials:true,noPersonalInformation:true,
    noUserPageLabels:true,noIndividualEvents:true}
 };
}
const labStart=Date.UTC(2026,9,28,0,0,0);
const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function apacheTime(ms:number){
 const d=new Date(ms),pad=(n:number)=>String(n).padStart(2,"0");
 return pad(d.getUTCDate())+"/"+months[d.getUTCMonth()]+"/"+d.getUTCFullYear()+
   ":"+pad(d.getUTCHours())+":"+pad(d.getUTCMinutes())+":"+pad(d.getUTCSeconds())+" +0000";
}
export function exportSiteAccessLog(run:SiteRun):string{
 if(run.cases.length>80)throw Error("模拟日志事件超过限制。");
 return run.cases.map((c,i)=>{
  // Only fixed virtual paths, never arbitrary user-entered values.
  const method=c.caseKind==="form-origin"||c.caseKind==="invalid-input"?"POST":"GET";
  return '127.0.0.1 - - ['+apacheTime(labStart+1000*i)+'] "'+
    method+" /lab/"+c.pageId+' HTTP/1.1" '+c.status+
    ' 128 "-" "OpenPenguin-VirtualLab-v8"';
 }).join("\n")+"\n";
}
export function exportSiteBrowserJournal(run:SiteRun){
 if(run.cases.length>80)throw Error("模拟浏览器日志超过限制。");
 return {
  schema:"openguin-browser-journal-v1",
  createdAt:new Date(labStart+600000).toISOString(),
  retentionDays:30,capacity:2500,recordingEnabled:false,capacityDropped:0,
  events:run.cases.map((c,i)=>({
    at:labStart+i*1000,host:"virtual.local",kind:"fetch-response",
    status:c.status,durationMs:20+(i*11)%90
  }))
 };
}
