/**
 * Bounded, in-memory defensive exercise controller.
 * One transition per explicit UI action. No password material, payloads,
 * sockets, background requests, traffic generation or target addresses.
 */
export function createManualExerciseState({now=Date.now}={}){
  if(typeof now!=="function")throw Error("Clock must be a function");
  const states=new Map();
  const MAX_STATES=64, WINDOW=60000, MAX_EVENTS=5;
  function get(key){
    if(typeof key!=="string"||!/^[a-f0-9]{48}$/.test(key))
      throw Error("A server-issued lab identity is required");
    let state=states.get(key);
    if(!state){
      if(states.size>=MAX_STATES)states.delete(states.keys().next().value);
      state={attempts:[],capacity:0,stepCount:0};
      states.set(key,state);
    }
    state.attempts=state.attempts.filter(x=>x>now()-WINDOW);
    return state;
  }
  function failureCheck(key){
    const state=get(key);
    // Never accepts or tests a password: one click represents one invented
    // account failure event. No credential oracle exists.
    if(state.attempts.length>=3){
      return {status:429,reason:"synthetic-lockout",
        message:"虚拟登录事件已触发保护：本地拒绝继续判定，稍后自动恢复。"};
    }
    state.attempts.push(now());
    return {status:401,reason:"synthetic-failure",
      message:"已记录一次虚构身份失败事件，没有提交或检查任何密码。"};
  }
  function capacityCheck(key){
    const state=get(key);
    // This is a counter model; the action does NOT allocate memory,
    // consume CPU deliberately, or create concurrent network traffic.
    state.stepCount=Math.min(MAX_EVENTS,state.stepCount+1);
    state.capacity=Math.min(MAX_EVENTS,state.capacity+1);
    const unavailable=state.capacity>3;
    return {status:unavailable?503:200,
      reason:unavailable?"virtual-capacity-protection":"virtual-capacity-available",
      message:unavailable?
        "虚拟容量已满，返回教学用 503；没有增加实际服务器负载。":
        "增加了一个虚构队列单位；没有启动流量生成器。"};
  }
  function reset(key){
    const state=get(key);
    state.attempts=[];state.capacity=0;state.stepCount=0;
    return {status:200,reason:"cleared",message:"本次虚拟计数已清零。"};
  }
  function snapshot(key){
    const state=get(key);
    return {failedIdentityEvents:state.attempts.length,
      virtualQueueUnits:state.capacity,
      queueFull:state.capacity>3,remainingSafeQueueSlots:Math.max(0,3-state.capacity),
      note:"仅当前本地会话计数，无账号、口令、IP 或网络负载数据"};
  }
  return {failureCheck,capacityCheck,reset,snapshot};
}
