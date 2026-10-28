/* OpenPenguin Network Watch v17: fixed-loopback, privacy-limited report adapter.
 * Standalone browser script; no network APIs or permissions, never reads DOM
 * or cookies. Accepts the extension's already-redacted diagnostic report.
 */
(() => {
  "use strict";
  const LOCAL_HOSTS = new Set(["localhost","127.0.0.1"]);
  const LAB_PATHS = new Set([
    "/","/health","/session","/logout","/member","/admin","/form",
    "/rate-check","/events","/access-log","/manual-console",
    "/manual-attempt","/manual-capacity","/manual-reset","/workbench",
    "/workbench-client","/audit-core","/ownership-lab","/ownership-mode",
    "/record-own","/record-other","/defense-studio","/defense-studio-export",
    "/drills","/drill-step","/drill-policy","/drill-reset","/drill-report",
    "/defense-engine","/defense-engine-export"
  ]);
  const HTTP_KINDS = new Set(["fetch-response","xhr-response"]);
  const ERROR_KINDS = new Set(["fetch-error","xhr-error","fetch-stall","xhr-stall"]);
  const ACCEPTED = new Set(["fetch-start",...HTTP_KINDS,...ERROR_KINDS,
    "navigation","monitor-started","monitor-active"]);
  const VALID_STATUS = new Set([200,201,204,301,302,303,400,401,403,404,405,413,415,422,429,503]);
  const MAX_ITEMS=300;
  function boundedDuration(input) {
    return Number.isFinite(input)&&input>=0&&input<=60000?Math.round(input):null;
  }
  function toLabEvidence(base) {
    const raw=Array.isArray(base?.events)?base.events.slice(0,MAX_ITEMS):[];
    const events=[];
    const codes={};
    const kinds={};
    const manualTimes=[];
    for(const item of raw){
      if(!item||!LOCAL_HOSTS.has(item.host)||!LAB_PATHS.has(item.path)||
        !ACCEPTED.has(item.kind)||!Number.isFinite(item.at))continue;
      const event={kind:item.kind,host:item.host,path:item.path,at:item.at};
      if(/^(GET|POST|HEAD)$/.test(item.method||""))event.method=item.method;
      const status=Number(item.status);
      if(HTTP_KINDS.has(item.kind)&&VALID_STATUS.has(status)){
        event.status=status;
        codes[String(status)]=(codes[String(status)]||0)+1;
      }
      const duration=boundedDuration(item.durationMs);
      if(duration!==null){event.durationMs=duration;
        if(HTTP_KINDS.has(item.kind))manualTimes.push(duration);}
      kinds[event.kind]=(kinds[event.kind]||0)+1;
      events.push(event);
    }
    const times=manualTimes.sort((a,b)=>a-b);
    const p95=times.length>=3?times[Math.max(0,Math.ceil(times.length*.95)-1)]:null;
    const median=times.length?times[Math.ceil(times.length*.5)-1]:null;
    const statuses=Object.fromEntries(Object.entries(codes).sort(([a],[b])=>Number(a)-Number(b)));
    const summary={
      schema:"openguin-localhost-extension-v17",
      sourceLab:"fixed-routes-127.0.0.1",
      observedResponses:Object.values(codes).reduce((a,b)=>a+b,0),
      statusCounts:statuses,
      kindCounts:kinds,
      medianObservedMs:median,p95ObservedMs:p95,
      latencySamples:times.length,
      lostEvents:Math.max(0,Number(base?.quality?.droppedEvents)||0),
      duplicateEventsSuppressed:Math.max(0,Number(base?.quality?.duplicateEventsSuppressed)||0),
      notes:[
        "Only responses observed while the user explicitly monitored the local lab tab are included.",
        "Fetch/XHR lifecycle events are visible; ordinary top-level HTML form navigation status may not be captured.",
        "Some status codes may be missed after reload, tab navigation, or when request hooks are not installed.",
        "Not a traffic benchmark, security certification, password audit or attack tool."
      ]
    };
    const report={
      source:"openguin-network-watch",formatVersion:1,
      generatedAt:typeof base?.generatedAt==="string"?base.generatedAt:"",
      eventCount:events.length,
      quality:{
        storedEventCount:events.length,exportedEventCount:events.length,
        droppedEvents:summary.lostEvents,
        duplicateEventsSuppressed:summary.duplicateEventsSuppressed,
        eventCapReached:summary.lostEvents>0
      },
      privacy:{localOnly:true,includes:["fixed localhost route","HTTP status",
          "redacted timing","event category"],
        excludes:["page text","cookies","request or response headers",
          "bodies","query strings","credentials","arbitrary URLs","tab IDs"]},
      labCompatibility:summary,
      events
    };
    return {summary,report};
  }
  const api=Object.freeze({toLabEvidence});
  // Keep the adapter visible only in the extension's popup context.
  Object.defineProperty(globalThis,"OpenguinLabCompat",{
    value:api,writable:false,configurable:false
  });
})();
