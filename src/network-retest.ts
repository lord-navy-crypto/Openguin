import {diagnoseOneClick,type BasicSnapshot,type OneClickResult} from "./network-one-click";

export type RetestOutcome={
  attempts:number;
  successes:number;
  cancelled:boolean;
  last:OneClickResult|null;
};
/**
 * Three small, explicitly user-initiated connection checks.
 * No throughput payloads, background timers, invasive packet capture or
 * automatic VPN/proxy changes. A cancellation stops before the next check.
 */
export async function runLightRetest(
  probe:()=>Promise<BasicSnapshot>,
  onReport:(result:OneClickResult,attempt:number)=>void,
  cancelled:()=>boolean,
  count=3
):Promise<RetestOutcome> {
  const total=Math.max(1,Math.min(3,Math.floor(count)||3));
  let attempts=0,successes=0,last:OneClickResult|null=null;
  for(let i=1;i<=total;i++){
    if(cancelled()) break;
    attempts++;
    let snapshot:BasicSnapshot|null=null;
    const notes=["轻量复测 "+i+"/"+total+"：仅采样 DNS 和 HTTPS，不运行下载/上传测速。"];
    try{
      snapshot=await probe();successes++;
    }catch{
      notes.push("当前连接检查未完成；不将未知结果归类为断网。");
    }
    last=diagnoseOneClick(snapshot,null,notes);
    onReport(last,i);
  }
  return {attempts,successes,cancelled:cancelled(),last};
}
