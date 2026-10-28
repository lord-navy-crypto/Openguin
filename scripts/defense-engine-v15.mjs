/**
 * v15: Offline, finite-state defensive engineering model.
 * No external targets, networking APIs, credentials, payloads, loops that
 * consume real capacity, execution of scripts, or live attack functionality.
 * Virtual arrivals are hard-coded counts, not real HTTP requests.
 */
export const DEFENSE_PATTERNS=Object.freeze({
  regular:Object.freeze({label:"日常访问",arrivals:Object.freeze([2,3,3,4,3,2,4,3,4,3,3,4,3,2,3,2])}),
  release:Object.freeze({label:"发布日高峰",arrivals:Object.freeze([2,3,5,7,10,11,12,10,8,7,5,4,4,3,3,2])}),
  restoration:Object.freeze({label:"中断后的业务恢复",arrivals:Object.freeze([2,3,8,12,12,11,9,7,5,4,3,3,3,3,2,2])})
});
export const DEFENSE_CAPACITY_OPTIONS=Object.freeze([3,5,8]);
export const DEFENSE_QUEUE_OPTIONS=Object.freeze([2,5,8]);
export const DEFENSE_THROTTLE_OPTIONS=Object.freeze([3,5,8]);
export const DEFENSE_LOCK_OPTIONS=Object.freeze([2,3,4]);
export const DEFAULT_DEFENSE_CONFIG=Object.freeze({
  pattern:"release",capacity:5,queue:5,throttle:5,lockout:3
});
const OWNERSHIP_SCENES=Object.freeze([
  {id:"self-record",kind:"owner",secureStatus:200,contrastStatus:200,fix:"根据当前身份确认记录所有者"},
  {id:"other-record",kind:"owner",secureStatus:403,contrastStatus:200,fix:"在服务端按当前身份核对记录所有者"},
  {id:"member-admin",kind:"role",secureStatus:403,contrastStatus:200,fix:"每个管理路由执行角色授权"},
  {id:"unsigned-form",kind:"csrf",secureStatus:403,contrastStatus:200,fix:"在改变服务器状态前验证表单来源令牌"},
  {id:"invalid-field",kind:"validation",secureStatus:422,contrastStatus:200,fix:"对字段类型、字符集合和长度做服务端校验"}
]);
const FAIL_EVENTS=Object.freeze(["failure","failure","failure","failure","failure","recovery","failure","failure"]);
const MAX_FRAMES=16;
const MAX_ARRIVALS=12;
const isChoice=(value,allowed)=>allowed.includes(value);
export function validateDefenseV15(input){
  if(!input||typeof input!=="object"||
    !Object.hasOwn(DEFENSE_PATTERNS,input.pattern)||
    !isChoice(input.capacity,DEFENSE_CAPACITY_OPTIONS)||
    !isChoice(input.queue,DEFENSE_QUEUE_OPTIONS)||
    !isChoice(input.throttle,DEFENSE_THROTTLE_OPTIONS)||
    !isChoice(input.lockout,DEFENSE_LOCK_OPTIONS))
    throw Error("Invalid bounded offline defense configuration");
  return {
    pattern:input.pattern,capacity:input.capacity,queue:input.queue,
    throttle:input.throttle,lockout:input.lockout
  };
}
const percentile=(items,p)=>{
  if(!items.length)return 0;
  const v=[...items].sort((a,b)=>a-b);
  return v[Math.max(0,Math.ceil(v.length*p)-1)];
};
function simulateLoad(config,guarded){
  const arrivals=DEFENSE_PATTERNS[config.pattern].arrivals;
  const history=[];
  let backlog=0,processedTotal=0,throttledTotal=0,overflowTotal=0,peakBacklog=0;
  let virtualLegitimateThrottled=0;
  const lagSamples=[];
  for(let frame=0;frame<arrivals.length;frame++){
    const inbound=arrivals[frame];
    // Protected policy applies a virtual per-frame rate budget, no requests are sent.
    const granted=guarded?Math.min(inbound,config.throttle):inbound;
    const throttled=inbound-granted;
    const available=backlog+granted;
    const processed=Math.min(config.capacity,available);
    const remainder=available-processed;
    const overflow=Math.max(0,remainder-config.queue);
    const queued=Math.min(remainder,config.queue);
    // This is a conceptual queueing delay, NOT measured/forecast latency.
    const latencyUnits=20+queued*18+(overflow?40:0);
    lagSamples.push(latencyUnits);
    processedTotal+=processed;
    throttledTotal+=throttled;
    overflowTotal+=overflow;
    peakBacklog=Math.max(peakBacklog,queued);
    // Estimated regular users caught by broad throttling, not actual user telemetry.
    const regularCount=Math.ceil(inbound*0.7);
    virtualLegitimateThrottled+=Math.round(throttled*(regularCount/inbound));
    history.push({slot:frame+1,incoming:inbound,granted,processed,
      throttled,overflow,backlogBefore:backlog,backlogAfter:queued,
      latencyUnits});
    backlog=queued;
  }
  const inboundTotal=arrivals.reduce((a,b)=>a+b,0);
  const settled=processedTotal+throttledTotal+overflowTotal+backlog;
  if(settled!==inboundTotal)throw Error("Offline conservation invariant failed");
  return {history,metrics:{
    arrivals:inboundTotal,processed:processedTotal,throttled:throttledTotal,
    unavailable:overflowTotal,remainingQueued:backlog,peakBacklog,
    p95LatencyUnits:percentile(lagSamples,0.95),
    maxLatencyUnits:Math.max(...lagSamples),
    estimatedNormalThrottled:virtualLegitimateThrottled,
    processedPercent:Math.round(1000*processedTotal/inboundTotal)/10
  }};
}
function simulateIdentity(config,guarded){
  let consecutive=0;
  const events=FAIL_EVENTS.map((type,i)=>{
    if(type==="recovery"){
      consecutive=0;
      return {step:i+1,event:"invented-recovery",status:200,
        protected:guarded,failedStreak:consecutive};
    }
    // All attempts are fictional labels; no usernames, passwords, or guesses.
    if(guarded&&consecutive>=config.lockout)
      return {step:i+1,event:"invented-failure-rejected",status:429,
        protected:guarded,failedStreak:consecutive};
    consecutive=Math.min(8,consecutive+1);
    return {step:i+1,event:"invented-failure-counted",status:401,
      protected:guarded,failedStreak:consecutive};
  });
  return {events,blocked:events.filter(x=>x.status===429).length};
}
function simulateAuthorization(guarded){
  const cases=OWNERSHIP_SCENES.map(s=>({
    id:s.id,kind:s.kind,expectedStatus:s.secureStatus,
    status:guarded?s.secureStatus:s.contrastStatus,
    matchesExpected:guarded||s.contrastStatus===s.secureStatus,
    repair:s.fix
  }));
  return {cases,failedChecks:cases.filter(x=>!x.matchesExpected).length};
}
export function runDefenseV15(raw){
  const config=validateDefenseV15(raw);
  const protectedLoad=simulateLoad(config,true),contrastLoad=simulateLoad(config,false);
  const protectedAuth=simulateIdentity(config,true),contrastAuth=simulateIdentity(config,false);
  const protectedChecks=simulateAuthorization(true),contrastChecks=simulateAuthorization(false);
  return {
    schema:"openguin-defense-engine-v15",
    config,
    networkRequestsGenerated:0,
    virtualFrames:MAX_FRAMES,
    maximumVirtualArrivalsPerFrame:MAX_ARRIVALS,
    protected:{
      ...protectedLoad,identity:protectedAuth,validation:protectedChecks
    },
    contrast:{
      ...contrastLoad,identity:contrastAuth,validation:contrastChecks
    },
    notes:[
      "所有流量为预设数字，未发送或接收任何网络负载。",
      "模拟延迟的单位不是毫秒，不是实际性能测量或预测。",
      "认证事件不含账户、口令、密码候选或身份信息。",
      "权限案例仅使用固定标签，无法指定任何文件、真实路由或请求内容。",
      "估计误拦截依据固定70%正常业务假设，不是用户行为分析。"
    ]
  };
}
export function exportDefenseV15(result){
  if(!result||result.schema!=="openguin-defense-engine-v15"||
    !result.protected?.history||!result.contrast?.history)
    throw Error("Expected a v15 offline simulation result");
  return {
    schema:"openguin-defense-report-v15",modelOnly:true,networkRequestsGenerated:0,
    config:{...result.config},protected:{...result.protected.metrics,
      identityPrevented:result.protected.identity.blocked,
      validationMisses:result.protected.validation.failedChecks},
    contrast:{...result.contrast.metrics,
      identityPrevented:result.contrast.identity.blocked,
      validationMisses:result.contrast.validation.failedChecks},
    slots:result.protected.history.map((x,i)=>({
      slot:x.slot,incoming:x.incoming,
      guardedProcessed:x.processed,guardedThrottled:x.throttled,
      guardedUnavailable:x.overflow,guardedQueued:x.backlogAfter,
      contrastProcessed:result.contrast.history[i].processed,
      contrastUnavailable:result.contrast.history[i].overflow,
      contrastQueued:result.contrast.history[i].backlogAfter
    })),
    privacy:{noTargets:true,noCredentials:true,noPayloads:true,noPersonalData:true}
  };
}
export function exportDefenseV15Csv(result){
  const report=exportDefenseV15(result);
  const keys=["slot","incoming","guardedProcessed","guardedThrottled",
    "guardedUnavailable","guardedQueued","contrastProcessed",
    "contrastUnavailable","contrastQueued"];
  return [keys.join(","),...report.slots.map(r=>keys.map(k=>r[k]).join(","))].join("\n")+"\n";
}
