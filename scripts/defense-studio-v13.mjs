/**
 * Defense Studio v13 — bounded virtual models aligned to OWASP/NIST learning themes.
 *
 * Pure synchronous calculations; NO socket, fetch, real password, credentials,
 * exploit payload, target URL, traffic generator or attacker-controlled scripts.
 */
export const STUDIO_PROFILES={
  steady:{label:"稳定业务访问",slots:[1,2,2,2,3,2,2,1]},
  burst:{label:"短时间流量高峰",slots:[1,2,6,8,7,3,2,1]},
  recovery:{label:"业务中断后恢复",slots:[2,6,8,4,2,1,1,2]}
};
export const STUDIO_LEVELS=[2,4,6];
export const STUDIO_MODES=["protected","teaching"];
const safeInt=(v)=>STUDIO_LEVELS.includes(v);
export function validateStudioConfig(config){
  if(!config||typeof config!=="object"||
    !Object.hasOwn(STUDIO_PROFILES,config.profile)||
    !safeInt(config.rateLimit)||!safeInt(config.serviceCapacity)||
    !STUDIO_MODES.includes(config.mode))throw Error("Invalid fixed defense studio configuration");
  return {profile:config.profile,rateLimit:config.rateLimit,
    serviceCapacity:config.serviceCapacity,mode:config.mode};
}
export const DEFAULT_STUDIO_CONFIG=Object.freeze({
  profile:"burst",rateLimit:4,serviceCapacity:4,mode:"protected"
});
export function evaluateDefenseStudio(rawConfig){
  const config=validateStudioConfig(rawConfig);
  const guarded=config.mode==="protected";
  const ticks=STUDIO_PROFILES[config.profile].slots;
  const traffic=[];
  for(let frame=0;frame<ticks.length;frame++){
    for(let i=0;i<ticks[frame];i++){
      let status=200,reason="virtual-accepted";
      if(guarded&&i>=config.rateLimit){
        status=429;reason="virtual-throttled";
      }else if(i>=config.serviceCapacity){
        status=503;reason="virtual-capacity-exceeded";
      }
      traffic.push({frame,virtualEvent:i+1,status,reason});
    }
  }
  const authentication=[];
  // Failure events are invented flags only; no usernames/password candidates.
  for(let i=0;i<6;i++){
    const status=guarded&&i>=3?429:401;
    authentication.push({step:i+1,status,
      reason:status===429?"virtual-account-protection":"virtual-invalid-auth"});
  }
  const authorization=[
    {id:"own-a",status:200,reason:"owner-authorized"},
    {id:"other-b",status:guarded?403:200,
      reason:guarded?"owner-check-enforced":"teaching-mode-check-missing"},
    {id:"own-c",status:200,reason:"owner-authorized"},
    {id:"other-d",status:guarded?403:200,
      reason:guarded?"owner-check-enforced":"teaching-mode-check-missing"}
  ];
  const statusCounts={"200":0,"401":0,"403":0,"429":0,"503":0};
  for(const e of [...traffic,...authentication,...authorization])
    statusCounts[String(e.status)]++;
  const metric={
    accepted:traffic.filter(e=>e.status===200).length,
    throttled:traffic.filter(e=>e.status===429).length,
    virtualUnavailable:traffic.filter(e=>e.status===503).length,
    accountProtected:authentication.filter(e=>e.status===429).length,
    ownershipDenied:authorization.filter(e=>e.status===403).length
  };
  const perSlot=ticks.map((amount,i)=>({
    frame:i+1,incoming:amount,
    accepted:traffic.filter(e=>e.frame===i&&e.status===200).length,
    throttled:traffic.filter(e=>e.frame===i&&e.status===429).length,
    unavailable:traffic.filter(e=>e.frame===i&&e.status===503).length
  }));
  return {
    schema:"openguin-defense-studio-v13",
    generated:"deterministic-offline",config,virtualEvents:
      traffic.length+authentication.length+authorization.length,
    trafficCount:traffic.length,metrics:metric,statusCounts,perSlot,
    authentication,authorization,
    // bounded per-event synthetic data suitable for manual inspection
    traffic,
    caveats:[
      "每个事件是内存中的一个数字，没有真实的 HTTP 请求或流量发生器。",
      "认证实验只使用固定失败标记，不包含账户、密码、哈希或猜测过程。",
      "授权实验仅使用固定的两组虚构记录。",
      "429 和 503 是模型中的概念性判定；不能预测真实服务器的承载性能。"
    ]
  };
}
export function compareStudioConfig(config){
  const clean=validateStudioConfig(config);
  const protectedResult=evaluateDefenseStudio({...clean,mode:"protected"});
  const teachingResult=evaluateDefenseStudio({...clean,mode:"teaching"});
  return {
    schema:"openguin-defense-comparison-v13",profile:clean.profile,
    rateLimit:clean.rateLimit,serviceCapacity:clean.serviceCapacity,
    protected:protectedResult.metrics,teaching:teachingResult.metrics,
    series:{protected:protectedResult.perSlot,teaching:teachingResult.perSlot}
  };
}
export function exportStudioSummary(result){
  if(!result||result.schema!=="openguin-defense-studio-v13")throw Error("Not a studio result");
  return {
    schema:"openguin-defense-summary-v13",
    simulated:true,networkRequestsSent:0,
    profile:result.config.profile,
    mode:result.config.mode,rateLimit:result.config.rateLimit,
    serviceCapacity:result.config.serviceCapacity,
    eventCount:result.virtualEvents,metrics:{...result.metrics},
    statusCounts:{...result.statusCounts},
    perSlot:result.perSlot.map(x=>({...x})),
    privacy:{noTargets:true,noPasswords:true,noPayloads:true,noPersonalData:true}
  };
}
export function exportStudioCsv(result){
  const safe=exportStudioSummary(result);
  const header="time_slot,incoming,accepted,throttled,unavailable";
  return [header,...safe.perSlot.map(e=>[
    e.frame,e.incoming,e.accepted,e.throttled,e.unavailable
  ].join(","))].join("\n")+"\n";
}
