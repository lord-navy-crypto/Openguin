/**
 * Synthetic security training ONLY.
 * No sockets, fetch, HTTP servers, payloads, passwords, targets or network I/O.
 * All actors and events are generated in memory from a bounded deterministic seed.
 */
export type ScenarioId="baseline"|"launch"|"burst"|"sign-in"|"slow-service"|"mixed";
export type VirtualEndpoint="home"|"catalog"|"account"|"service";
export type VirtualEvent={
  id:number;minute:number;actor:number;endpoint:VirtualEndpoint;
  kind:"view"|"read"|"sign-in";
  responseMs:number;failedSignIn:boolean;serverError:boolean;
  simulatedAnomaly:boolean;
};
export type TrainingRules={
  requestsPerActorMinute:number;
  failedSignInsPerActorWindow:number;
  slowResponseMs:number;
  alertServerErrors:number;
};
export type ClassifiedEvent=VirtualEvent&{blocked:boolean;alerts:string[];reason:"rate-limit"|"sign-in-limit"|null};
export type TrainingMinute={
  minute:number;seen:number;allowed:number;blocked:number;normalBlocked:number;
  anomaliesAllowed:number;slowResponses:number;serverErrors:number;alertCount:number;
};
export type TrainingResult={
  schema:"openguin-virtual-defense-simulator-v1";
  scenario:ScenarioId;label:string;description:string;seed:number;
  rules:TrainingRules;
  total:number;legitimate:number;anomalous:number;
  allowed:number;blocked:number;
  correctlyBlocked:number;normalBlocked:number;anomaliesAllowed:number;
  blockedRatePercent:number;falsePositivePercent:number;
  legitimateAvailabilityPercent:number;
  alerts:number;slowObservations:number;serverErrors:number;
  timeline:TrainingMinute[];
  records:ClassifiedEvent[];
  observations:string[];
  limits:string[];
};
const descriptions:Record<ScenarioId,{name:string;description:string}>={
  baseline:{name:"正常日常访问",description:"展示常规网页访问和少量自然错误，用作基线。"},
  launch:{name:"活动日流量增加",description:"合法访问在短时间内集中，观察规则是否误伤真实访客。"},
  burst:{name:"模拟异常访问突增",description:"虚拟访问事件集中出现，用于观察限流效果；不会发送任何真实请求。"},
  "sign-in":{name:"模拟登录失败异常",description:"使用虚构的失败登录记录训练识别与限制；不猜测或尝试任何密码。"},
  "slow-service":{name:"服务响应变慢",description:"以虚构的耗时和服务错误训练告警判断，不模拟网络攻击。"},
  mixed:{name:"混合事件演练",description:"正常访问、活动高峰、虚拟异常事件与服务故障的组合。"}
};
export const scenarioDetails=descriptions;
export const defaultTrainingRules:TrainingRules={
  requestsPerActorMinute:12,failedSignInsPerActorWindow:4,
  slowResponseMs:1200,alertServerErrors:3
};
function integer(value:number,min:number,max:number){
  if(!Number.isFinite(value))return min;
  return Math.max(min,Math.min(max,Math.floor(value)));
}
export function normalizeRules(rules:TrainingRules):TrainingRules{
  return {
    requestsPerActorMinute:integer(rules.requestsPerActorMinute,2,60),
    failedSignInsPerActorWindow:integer(rules.failedSignInsPerActorWindow,1,12),
    slowResponseMs:integer(rules.slowResponseMs,300,5000),
    alertServerErrors:integer(rules.alertServerErrors,1,15)
  };
}
function randomGenerator(seed:number){
  let s=(Math.trunc(seed)>>>0)||1;
  return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
}
export function generateVirtualTraffic(scenario:ScenarioId,seed=2026):VirtualEvent[]{
  if(!(scenario in descriptions))throw Error("不支持该演练场景。");
  const random=randomGenerator(seed);
  const items:VirtualEvent[]=[];
  const put=(minute:number,actor:number,count:number,opts:{anomaly?:boolean;failed?:boolean;slow?:boolean;error?:boolean;signIn?:boolean}={})=>{
    for(let i=0;i<count&&items.length<2400;i++){
      const failed=opts.failed===true || (opts.signIn===true && random()<0.045);
      const endpoint:VirtualEndpoint=opts.signIn?"account":(["home","catalog","service"] as const)[integer(random()*3,0,2)];
      const ms=opts.slow?1800+integer(random()*2600,0,2600):80+integer(random()*500,0,500);
      items.push({
        id:items.length+1,minute,actor,endpoint,kind:opts.signIn?"sign-in":endpoint==="home"?"view":"read",
        responseMs:ms,failedSignIn:failed,serverError:opts.error===true||(
          opts.slow===true&&random()<0.12
        ),simulatedAnomaly:opts.anomaly===true
      });
    }
  };
  for(let minute=0;minute<10;minute++){
    for(let actor=1;actor<=6;actor++){
      put(minute,actor,2+integer(random()*4,0,3),{signIn:actor===1});
    }
  }
  if(scenario==="launch"||scenario==="mixed"){
    for(let minute=3;minute<=6;minute++){
      for(let actor=20;actor<35;actor++)put(minute,actor,7+integer(random()*5,0,4));
    }
  }
  if(scenario==="burst"||scenario==="mixed"){
    for(let minute=4;minute<=6;minute++)
      for(let actor=80;actor<=82;actor++)put(minute,actor,22+integer(random()*13,0,12),{anomaly:true});
  }
  if(scenario==="sign-in"||scenario==="mixed"){
    for(let minute=2;minute<=7;minute++)
      for(let actor=90;actor<=91;actor++)put(minute,actor,6,{anomaly:true,failed:true,signIn:true});
  }
  if(scenario==="slow-service"||scenario==="mixed"){
    for(let minute=4;minute<=7;minute++)
      for(let actor=1;actor<=6;actor++)put(minute,actor,2,{slow:true,error:minute===6});
  }
  return items.sort((a,b)=>a.minute-b.minute||a.id-b.id);
}
export function simulateVirtualDefense(scenario:ScenarioId,rules:TrainingRules=defaultTrainingRules,seed=2026):TrainingResult{
  const config=normalizeRules(rules),events=generateVirtualTraffic(scenario,seed);
  const groups=new Map<string,number>(),failed=new Map<number,number>(),errors=new Map<number,number>();
  const records:ClassifiedEvent[]=[];
  const timeline:TrainingMinute[]=Array.from({length:10},(_,minute)=>({
    minute,seen:0,allowed:0,blocked:0,normalBlocked:0,anomaliesAllowed:0,
    slowResponses:0,serverErrors:0,alertCount:0
  }));
  for(const event of events){
    const key=event.minute+":"+event.actor;
    const rate=(groups.get(key)||0)+1;groups.set(key,rate);
    // Fictional failure counter resets after each five-minute training window.
    const signInKey=event.actor*100+Math.floor(event.minute/5);
    const attempts=event.failedSignIn?(failed.get(signInKey)||0)+1:(failed.get(signInKey)||0);
    if(event.failedSignIn)failed.set(signInKey,attempts);
    const rateExceeded=rate>config.requestsPerActorMinute;
    const signinExceeded=event.kind==="sign-in"&&event.failedSignIn&&attempts>config.failedSignInsPerActorWindow;
    const reason=rateExceeded?"rate-limit":signinExceeded?"sign-in-limit":null;
    const blocked=reason!==null;
    const row=timeline[event.minute];row.seen++;
    const alerts:string[]=[];
    if(reason){alerts.push(reason);row.blocked++;if(!event.simulatedAnomaly)row.normalBlocked++;}
    else{row.allowed++;if(event.simulatedAnomaly)row.anomaliesAllowed++;}
    if(event.responseMs>config.slowResponseMs){row.slowResponses++;if(!blocked)alerts.push("slow-response");}
    if(event.serverError){
      row.serverErrors++;const n=(errors.get(event.minute)||0)+1;errors.set(event.minute,n);
      if(n===config.alertServerErrors)alerts.push("server-error-spike");
    }
    row.alertCount+=alerts.length;
    records.push({...event,blocked,reason,alerts});
  }
  const legitimate=records.filter(e=>!e.simulatedAnomaly).length,anomalous=records.length-legitimate;
  const blocked=records.filter(e=>e.blocked).length,normalBlocked=records.filter(e=>e.blocked&&!e.simulatedAnomaly).length;
  const correctlyBlocked=blocked-normalBlocked,allowed=records.length-blocked,anomaliesAllowed=anomalous-correctlyBlocked;
  const observations:string[]=[];
  if(normalBlocked)observations.push("有 "+normalBlocked+" 条正常虚拟访问受到限制；可检查限流规则是否影响活动日访客。");
  if(anomaliesAllowed)observations.push("仍有 "+anomaliesAllowed+" 条标记为异常的虚拟事件通过；规则需要结合更多观测维度。");
  if(!anomalous)observations.push("当前场景没有预设异常访问；不应仅依据缺少阻断判定规则无效。");
  if(timeline.some(m=>m.slowResponses>0))observations.push("观察到模拟慢响应，请区分系统可靠性问题与访问异常。");
  if(!observations.length)observations.push("这组虚拟事件中没有发现误拦或遗漏，但不能推断真实网站的安全性。");
  return {
    schema:"openguin-virtual-defense-simulator-v1",
    scenario,label:descriptions[scenario].name,description:descriptions[scenario].description,
    seed:integer(seed,1,999999),
    rules:config,total:records.length,legitimate,anomalous,allowed,blocked,
    correctlyBlocked,normalBlocked,anomaliesAllowed,
    blockedRatePercent:records.length?Math.round(1000*blocked/records.length)/10:0,
    falsePositivePercent:legitimate?Math.round(1000*normalBlocked/legitimate)/10:0,
    legitimateAvailabilityPercent:legitimate?Math.round(1000*(legitimate-normalBlocked)/legitimate)/10:100,
    alerts:timeline.reduce((n,m)=>n+m.alertCount,0),
    slowObservations:timeline.reduce((n,m)=>n+m.slowResponses,0),
    serverErrors:timeline.reduce((n,m)=>n+m.serverErrors,0),
    timeline,records,observations,
    limits:[
      "这是内存中的确定性演练，没有真实 HTTP 请求、网络流量、用户账号、密码或攻击载荷。",
      "每组访问者、事件标签和异常真值都由程序虚构，不代表真实 IP 或实际攻击者。",
      "限流、告警、误报和漏报指标只描述虚拟规则与虚拟事件的对比，不是网站压力测试。",
      "不能据此评价实际服务器、CDN、WAF、数据库或身份验证系统的安全性。"
    ]
  };
}
export function exportVirtualDefenseReport(result:TrainingResult){
  // Aggregates only: never include even synthetic per-actor records in shared output.
  const {records,...aggregate}=result;
  return {
    ...aggregate,
    generatedAt:new Date().toISOString(),
    privacy:{networkRequestsMade:false,realTargetUsed:false,credentialsUsed:false,
      rawVirtualActorEventsExported:false},
  };
}
