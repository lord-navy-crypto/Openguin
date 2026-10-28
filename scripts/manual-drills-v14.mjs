/**
 * Three-track hands-on defensive teaching controller.
 * State and actions are bounded, local, fictional, and intentionally contain
 * NO passwords, guessed values, target addresses, exploit strings, packets,
 * request loops, sockets, subprocesses, or real traffic pressure.
 */
export const DRILL_TRACKS=Object.freeze(["identity","ownership","capacity"]);
export const DRILL_MODES=Object.freeze(["protected","teaching"]);
const MAX_IDENTITIES=64;
const MAX_HISTORY=30;
const WINDOW_MS=60000;
const MAX_COUNTER=6;
function isIssuedToken(value){
  return typeof value==="string"&&/^[a-f0-9]{48}$/.test(value);
}
function assertTrack(track){
  if(!DRILL_TRACKS.includes(track))throw Error("Unknown fictional drill track");
}
function assertMode(mode){
  if(!DRILL_MODES.includes(mode))throw Error("Unknown fixed defense mode");
}
export function createManualDrills({now=Date.now}={}){
  if(typeof now!=="function")throw Error("Invalid clock");
  const sessions=new Map();
  function get(token){
    if(!isIssuedToken(token))throw Error("Valid local training identity required");
    let s=sessions.get(token);
    if(!s){
      if(sessions.size>=MAX_IDENTITIES)sessions.delete(sessions.keys().next().value);
      s={mode:{identity:"protected",ownership:"protected",capacity:"protected"},
        count:{identity:0,ownership:0,capacity:0},authTimes:[],history:[]};
      sessions.set(token,s);
    }
    s.authTimes=s.authTimes.filter(t=>t>now()-WINDOW_MS);
    s.count.identity=s.authTimes.length;
    return s;
  }
  function append(s,entry){
    s.history.push({...entry,order:s.history.length?s.history.at(-1).order+1:1});
    if(s.history.length>MAX_HISTORY)s.history.shift();
  }
  function selectMode(token,track,mode){
    assertTrack(track);assertMode(mode);
    const s=get(token);
    s.mode[track]=mode;
    s.count[track]=0;
    if(track==="identity")s.authTimes=[];
    append(s,{track,kind:"policy",status:200,policy:mode,
      note:"只改变虚拟教学规则，不改变真实网站安全策略"});
    return {status:200,track,mode};
  }
  function step(token,track){
    assertTrack(track);
    const s=get(token);
    let status,reason,explanation;
    if(track==="identity"){
      // No password, username, candidate, hash, dictionary or login endpoint.
      const attempts=s.authTimes.length;
      if(s.mode.identity==="protected"&&attempts>=3){
        status=429;reason="fictional-account-locked";
        explanation="已触发虚构身份失败阈值；本次没有尝试任何密码。";
      }else{
        status=401;reason="fictional-auth-rejected";
        explanation="拒绝一次虚构身份事件；该事件不包含账户或密码。";
        s.authTimes.push(now());
      }
      s.count.identity=s.authTimes.length;
    }else if(track==="ownership"){
      // Only one fixed, non-personal mock record — no real object IDs.
      s.count.ownership=Math.min(MAX_COUNTER,s.count.ownership+1);
      status=s.mode.ownership==="protected"?403:200;
      reason=status===403?"fictional-owner-check-on":"fictional-owner-check-missing";
      explanation=status===403?
        "所有权检查阻止另一名虚构成员的示例记录。":
        "教学模式允许读取完全虚构的公开练习文字；不涉及任何真实私人数据。";
    }else{
      // Single number update, not a request generator, CPU or memory stressor.
      const queue=s.count.capacity;
      status=queue<3?200:s.mode.capacity==="protected"?429:503;
      reason=status===200?"virtual-capacity-open":
        status===429?"virtual-throttle-applied":"virtual-capacity-overflow";
      explanation=status===200?
        "增加一个虚构队列单位，未分配额外处理任务。":
        status===429?"保护规则拦截虚拟过量事件。":
        "未启用虚拟限流，模型显示概念性 503；没有真实服务器过载。";
      s.count.capacity=Math.min(MAX_COUNTER,queue+1);
    }
    const outcome={track,kind:"step",policy:s.mode[track],status,reason,
      note:explanation};
    append(s,outcome);
    return {...outcome};
  }
  function reset(token,track){
    assertTrack(track);
    const s=get(token);
    s.count[track]=0;
    if(track==="identity")s.authTimes=[];
    append(s,{track,kind:"reset",policy:s.mode[track],status:200,
      note:"已清空此虚构练习的计数器"});
    return {status:200,track};
  }
  function snapshot(token){
    const s=get(token);
    return {schema:"openguin-manual-drills-v14",
      modes:{...s.mode},counts:{...s.count},
      history:s.history.map(e=>({...e})),
      maxHistory:MAX_HISTORY,
      maxCounter:MAX_COUNTER,
      loopbackTeachingOnly:true,
      generatedNetworkEvents:0,
      personalDataStored:false
    };
  }
  return {step,selectMode,reset,snapshot};
}
export function exportManualDrills(snapshot){
  if(!snapshot||snapshot.schema!=="openguin-manual-drills-v14"||
    !Array.isArray(snapshot.history)||snapshot.history.length>MAX_HISTORY)
    throw Error("Invalid local drill history");
  return {
    schema:"openguin-manual-drills-summary-v14",simulated:true,
    generatedNetworkEvents:0,history:snapshot.history.map(e=>({
      order:e.order,track:e.track,kind:e.kind,policy:e.policy,
      status:e.status,reason:e.reason??null
    })),
    privacy:{noPasswords:true,noUserRecords:true,noTargets:true,
      noRequestsBodies:true,noTokens:true}
  };
}
