/**
 * OpenPenguin Manual Localhost Defense Lab
 * Standalone educational HTTP server. Binds ONLY to IPv4 loopback.
 * No outbound requests, proxying, target URL inputs, attack automation,
 * passwords, actual user databases, or stored user-supplied content.
 */
import http from "node:http";
import {randomBytes,timingSafeEqual} from "node:crypto";
import {pathToFileURL} from "node:url";
import {readFileSync} from "node:fs";
import {createManualExerciseState} from "./manual-defense-exercises.mjs";
import {createManualDrills,DRILL_TRACKS,DRILL_MODES,exportManualDrills} from "./manual-drills-v14.mjs";
import {DEFENSE_PATTERNS,DEFENSE_CAPACITY_OPTIONS,DEFENSE_QUEUE_OPTIONS,DEFENSE_THROTTLE_OPTIONS,DEFENSE_LOCK_OPTIONS,DEFAULT_DEFENSE_CONFIG,validateDefenseV15,runDefenseV15,exportDefenseV15Csv,exportDefenseV15} from "./defense-engine-v15.mjs";
import {DEFAULT_STUDIO_CONFIG,STUDIO_PROFILES,STUDIO_LEVELS,validateStudioConfig,evaluateDefenseStudio,compareStudioConfig,exportStudioCsv} from "./defense-studio-v13.mjs";

export const LAB_HOST="127.0.0.1";
export const LAB_PORT=19090;
const MAX_BODY=2048;
const MAX_LOGS=120;
const COMMON_HEADERS={
  "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Referrer-Policy":"no-referrer",
  "Cache-Control":"no-store",
  "Cross-Origin-Resource-Policy":"same-origin",
  "X-Lab-Notice":"LOCALHOST-TRAINING-ONLY"
};
const fixedWorkbenchClient=readFileSync(new URL("./localhost-http-workbench.js",import.meta.url),"utf8");
const cleanToken=()=>randomBytes(24).toString("hex");
const safeEqual=(a,b)=>{
  if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length||a.length<32)return false;
  return timingSafeEqual(Buffer.from(a),Buffer.from(b));
};
const parseCookies=(text)=>{
  const cookies=new Map();
  for(const part of String(text??"").slice(0,2048).split(";").slice(0,20)){
    const i=part.indexOf("=");
    if(i>0)cookies.set(part.slice(0,i).trim(),part.slice(i+1).trim());
  }
  return cookies;
};
const escapeHtml=(x)=>String(x).replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);
function page(title,inner){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>'+escapeHtml(title)+' | OpenPenguin localhost lab</title>'+
    '<style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:36px auto;padding:0 18px;background:#111f2b;color:#e6f5fa}'+
    'a{color:#92d8e7}section{border:1px solid #4b6a7f;border-radius:12px;padding:17px;margin:15px 0}'+
    'button,select,input{font:inherit;padding:8px;border-radius:6px}button{cursor:pointer}'+
    'code{background:#244257;padding:3px 6px;border-radius:5px}small{color:#b2c9d5}</style></head><body>'+
    '<header><h1>OpenPenguin · Local Defense Lab</h1><p>Real HTTP responses, invented roles. No attack payloads or real account credentials.</p>'+
    '<nav><a href="/">Home</a> · <a href="/member">Member</a> · <a href="/admin">Admin</a> · '+
    '<a href="/form">Form</a> · <a href="/rate-check">Rate check</a> · <a href="/events">Local event summary</a> · <a href="/access-log">Download log</a> · <a href="/manual-console">Manual defense console</a> · <a href="/workbench">HTTP Workbench</a> · <a href="/ownership-lab">Ownership Lab</a> · <a href="/defense-studio">Defense Studio</a> · <a href="/drills">Hands-on Drills</a> · <a href="/defense-engine">v15 Defense Engine</a></nav></header>'+
    '<main><section><h2>'+escapeHtml(title)+'</h2>'+inner+'</section></main>'+
    '<footer><small>Bound to 127.0.0.1 only. Stop the process with Ctrl+C. Training only.</small></footer></body></html>';
}
const field=(csrf)=>'<input type="hidden" name="csrf" value="'+escapeHtml(csrf)+'">';
async function bodyParams(req){
  const ct=String(req.headers["content-type"]??"");
  if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(ct)){
    const err=new Error("Only basic form submissions are supported.");err.status=415;throw err;
  }
  const chunks=[];let size=0;
  for await(const part of req){
    size+=part.length;
    if(size>MAX_BODY){const err=new Error("Request exceeds the 2 KiB lab limit.");err.status=413;throw err;}
    chunks.push(part);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
export function createLocalDefenseLab(options={}){
  const {port=LAB_PORT,sessionTtlMs=5*60*1000,now=Date.now}=options;
  if(!Number.isInteger(port)||port<0||port>65535||
     !Number.isFinite(sessionTtlMs)||sessionTtlMs<100||sessionTtlMs>3600000||
     typeof now!=="function")throw Error("Invalid local-only lab configuration");
  const sessions=new Map();
  const csrfTokens=new Map();
  const events=[];
  const limiter=new Map();
  const exercises=createManualExerciseState({now});
  const drills=createManualDrills({now});
  let activePort=port;
  const record=(route,status,method)=>{
    const safeRoute=new Set(["/","/health","/session","/logout","/member","/admin","/form","/rate-check","/events","/access-log","/manual-console","/manual-attempt","/manual-capacity","/manual-reset","/workbench","/workbench-client","/ownership-lab","/ownership-mode","/record-own","/record-other","/defense-studio","/defense-studio-export","/drills","/drill-step","/drill-policy","/drill-reset","/drill-report","/defense-engine","/defense-engine-export"]);
    events.push({at:new Date(now()).toISOString(),route:safeRoute.has(route)?route:"other",
      method:["GET","POST","HEAD"].includes(method)?method:"OTHER",status});
    if(events.length>MAX_LOGS)events.shift();
  };
  const server=http.createServer(async(req,res)=>{
    const origin="http://"+LAB_HOST+":"+activePort;
    const host=String(req.headers.host??"").toLowerCase();
    const validHosts=new Set([LAB_HOST+":"+activePort,"localhost:"+activePort]);
    const headers={...COMMON_HEADERS};
    const send=(status,body,kind="text/html; charset=utf-8",extra={})=>{
      res.writeHead(status,{"Content-Type":kind,...headers,...extra});
      res.end(req.method==="HEAD"?"":body);
      record(route,status,req.method);
    };
    let route="unknown";
    if(!validHosts.has(host)){
      send(400,"Invalid lab host.","text/plain; charset=utf-8");
      return;
    }
    if(req.headers.origin && ![origin,"http://localhost:"+activePort].includes(req.headers.origin)){
      send(403,"Cross-origin form submission rejected.","text/plain; charset=utf-8");return;
    }
    let url;
    try{url=new URL(req.url??"/",origin)}
    catch{send(400,"Malformed request.","text/plain; charset=utf-8");return;}
    route=url.pathname;
    if(url.origin!==origin&&url.origin!=="http://localhost:"+activePort){
      send(400,"Unexpected absolute request target.","text/plain; charset=utf-8");return;
    }
    if(url.search || url.hash || url.username || url.password || !/^\/[a-z-]*$/.test(route)){
      send(400,page("Invalid lab request","<p>This training site accepts only fixed routes without query parameters.</p>"));return;
    }
    if(!["GET","HEAD","POST"].includes(req.method??"")){
      send(405,page("Method not allowed","<p>Use browser GET pages or the provided POST forms.</p>"),
        "text/html; charset=utf-8",{"Allow":"GET, HEAD, POST"});return;
    }
    const cookies=parseCookies(req.headers.cookie);
    const session=sessions.get(cookies.get("lab_session"));
    const authenticated=session && session.expiresAt>now();
    const role=authenticated?session.role:"guest";
    if(session&&!authenticated)sessions.delete(cookies.get("lab_session"));
    const csrfCookie=cookies.get("lab_csrf");
    const issuedCsrf=typeof csrfCookie==="string"&&/^[a-f0-9]{48}$/.test(csrfCookie)&&
      (csrfTokens.get(csrfCookie)??0)>now();
    const csrf=issuedCsrf?csrfCookie:cleanToken();
    if(!issuedCsrf){
      csrfTokens.set(csrf,now()+10*60*1000);
      if(csrfTokens.size>128)csrfTokens.delete(csrfTokens.keys().next().value);
      headers["Set-Cookie"]="lab_csrf="+csrf+"; HttpOnly; SameSite=Strict; Path=/";
    }
    const authorized=(required)=>{
      if(role==="guest"){send(401,page("Login required","<p>This area requires an invented member session. Visit Home and select a demo role.</p>"));return false;}
      if(required==="admin"&&role!=="admin"){send(403,page("Permission denied","<p>Demo member accounts cannot access the admin-only resource.</p>"));return false;}
      return true;
    };
    const verifyCsrf=(params)=>issuedCsrf&&safeEqual(csrfCookie,params.get("csrf"));
    if(req.method==="HEAD" && route!=="/health"){
      send(405,"HEAD is only supported on /health.","text/plain; charset=utf-8");return;
    }
    if((req.method==="GET"||req.method==="HEAD")&&route==="/health"){
      send(200,JSON.stringify({sandbox:true,networkScope:"127.0.0.1",fakeRoles:true,
        realAccounts:false,attackAutomation:false}),"application/json; charset=utf-8");return;
    }
    if(req.method==="GET"&&route==="/"){
      const form='<form method="post" action="/session">'+field(csrf)+
        '<label>Choose a simulated account: <select name="role"><option value="member">Demo member</option>'+
        '<option value="admin">Demo administrator</option></select></label> '+
        '<button type="submit">Start mock session</button></form>';
      const logout='<form method="post" action="/logout">'+field(csrf)+
        '<button type="submit">End mock session</button></form>';
      send(200,page("Start here","<p>Current invented role: <strong>"+escapeHtml(role)+"</strong>. "+
        "No password or real login identity is used.</p>"+form+(role!=="guest"?logout:"")+
        "<p>Open the Member and Admin pages manually, then use the Form and Rate check pages to inspect protective HTTP statuses.</p>"));
      return;
    }
    if(req.method==="POST"&&route==="/session"){
      let params;
      try{params=await bodyParams(req)}catch(e){send(e.status??400,"Invalid form.","text/plain; charset=utf-8");return;}
      if(!verifyCsrf(params)){send(403,page("Form origin check","<p>Session setup requires the matching local anti-CSRF token.</p>"));return;}
      const nextRole=params.get("role");
      if(!["member","admin"].includes(nextRole)){
        send(422,page("Invalid demo role","<p>Choose one of the two invented demo roles.</p>"));return;
      }
      const token=cleanToken();
      sessions.set(token,{role:nextRole,expiresAt:now()+sessionTtlMs,ownershipTrainingMode:false});
      if(sessions.size>128)sessions.delete(sessions.keys().next().value);
      send(303,"","text/plain; charset=utf-8",{"Location":"/",
        "Set-Cookie":"lab_session="+token+"; HttpOnly; SameSite=Strict; Path=/"});
      return;
    }
    if(req.method==="POST"&&route==="/logout"){
      let params;
      try{params=await bodyParams(req)}catch(e){send(e.status??400,"Invalid form.","text/plain; charset=utf-8");return;}
      if(!verifyCsrf(params)){send(403,page("Form origin check","<p>Session closure requires a local anti-CSRF token.</p>"));return;}
      sessions.delete(cookies.get("lab_session"));
      send(303,"","text/plain; charset=utf-8",{"Location":"/",
        "Set-Cookie":"lab_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"});return;
    }
    if(req.method==="GET"&&route==="/member"){
      if(!authorized("member"))return;
      send(200,page("Member area","<p>Access granted for an invented member or administrator.</p>"));return;
    }
    if(req.method==="GET"&&route==="/admin"){
      if(!authorized("admin"))return;
      send(200,page("Admin area","<p>The role rule permitted the demo administrator.</p>"));return;
    }
    if(req.method==="GET"&&route==="/form"){
      if(!authorized("member"))return;
      send(200,page("Form validation practice","<form action=\"/form\" method=\"post\">"+
        field(csrf)+"<label>Invented note label (letters/numbers, 1–32 chars): "+
        "<input maxlength=\"32\" name=\"label\" required></label> "+
        "<button type=\"submit\">Submit sample</button></form>"+
        "<p>Form values are validated but never saved or logged.</p>"));return;
    }
    if(req.method==="POST"&&route==="/form"){
      if(!authorized("member"))return;
      let params;
      try{params=await bodyParams(req)}catch(e){send(e.status??400,"Invalid form.","text/plain; charset=utf-8");return;}
      if(!verifyCsrf(params)){send(403,page("Missing form verification","<p>The CSRF value is absent or incorrect.</p>"));return;}
      const label=params.get("label")??"";
      if(!/^[a-zA-Z0-9 _.-]{1,32}$/.test(label)){
        send(422,page("Input rejected","<p>The fictional note label did not satisfy the server-side input rule.</p>"));return;
      }
      send(200,page("Validated","<p>The invented form passed origin and field checks. The submitted content was discarded.</p>"));return;
    }
    // Deliberately limited, fictional ownership teaching case:
    // one server-side member session, two fixed mock records, no external data.
    if(["/ownership-lab","/ownership-mode","/record-own","/record-other"].includes(route)){
      if(role!=="member"){
        send(role==="guest"?401:403,page("Member-only sandbox",
          "<p>Use the home page to create the invented Demo member session. "+
          "This experiment never operates on real user records.</p>"));
        return;
      }
      if(req.method==="POST"&&route==="/ownership-mode"){
        let params;
        try{params=await bodyParams(req)}
        catch(e){send(e.status??400,"Invalid training form.","text/plain; charset=utf-8");return;}
        if(!verifyCsrf(params)){
          send(403,page("Form validation","<p>Use the local training panel and its CSRF-protected buttons.</p>"));return;
        }
        const mode=params.get("mode");
        if(!["protected","training"].includes(mode)){
          send(422,page("Unknown mode","<p>Only the two preinstalled sandbox modes are available.</p>"));return;
        }
        // Switch is isolated to this invented session, expires with it,
        // and can change only a single route serving constant mock data.
        session.ownershipTrainingMode=mode==="training";
        send(303,"","text/plain; charset=utf-8",{"Location":"/ownership-lab"});
        return;
      }
      if(req.method==="GET"&&route==="/ownership-lab"){
        const training=session.ownershipTrainingMode===true;
        const controls=[
          ["protected","Enable verified owner check"],
          ["training","Enable intentionally missing owner check"]
        ].map(([mode,label])=>'<form action="/ownership-mode" method="post">'+field(csrf)+
          '<input type="hidden" name="mode" value="'+mode+'">'+
          '<button type="submit">'+escapeHtml(label)+'</button></form>').join("");
        send(200,page("Resource Ownership Lab",
          "<p>Member session contains two invented records: <strong>your mock record</strong>"+
          " and <strong>another imaginary member's mock record</strong>. "+
          "The records contain no personal data.</p>"+
          "<p>Current access policy: <strong>"+(training?
            "INTENTIONALLY INSECURE TRAINING MODE":"OWNER CHECK ENABLED")+
          "</strong>. This toggle affects only your fictional session and the fixed /record-other endpoint.</p>"+
          controls+
          '<p><a href="/record-own">Read own fictional record</a> · '+
          '<a href="/record-other">Try other fictional member record</a></p>'+
          "<p>With owner checks enabled, reading /record-other returns 403. "+
          "After deliberately turning the check off, the same single manual request returns 200. "+
          "Turn the check back on and repeat to verify the repair.</p>"+
          '<p><a href="/access-log">Download sanitized log</a> to compare recorded statuses.</p>'));
        return;
      }
      if(req.method==="GET"&&route==="/record-own"){
        send(200,page("Your fictional record",
          "<p>DEMO RECORD A: an invented, non-sensitive practice item. "+
          "The server has confirmed your fictional session.</p>"));return;
      }
      if(req.method==="GET"&&route==="/record-other"){
        if(session.ownershipTrainingMode!==true){
          send(403,page("Resource owner denied",
            "<p>The server checked the mock record owner and rejected access.</p>"));return;
        }
        headers["X-Openguin-Lab-Mode"]="deliberately-unprotected-fake-record";
        send(200,page("Intentionally unprotected MOCK data",
          "<p>DEMO RECORD B: invented public training text, not an actual person's record.</p>"+
          "<p>This response demonstrates a missing object-ownership check "+
          "in an isolated lesson. Restore the owner check in the Ownership Lab.</p>"));return;
      }
    }
    if(["/defense-studio","/defense-studio-export"].includes(route)){
      let config={...DEFAULT_STUDIO_CONFIG};
      if(req.method==="POST"){
        let params;
        try{params=await bodyParams(req)}
        catch(e){send(e.status??400,"Invalid local training form.","text/plain; charset=utf-8");return;}
        if(!verifyCsrf(params)){
          send(403,page("Studio form validation","<p>Use a valid server-issued localhost training form.</p>"));return;
        }
        try{config=validateStudioConfig({
          profile:params.get("profile"),
          rateLimit:Number(params.get("rateLimit")),
          serviceCapacity:Number(params.get("serviceCapacity")),
          mode:params.get("mode")
        })}
        catch{
          send(422,page("Unsupported training option",
            "<p>Choose only the limited, preinstalled simulation options.</p>"));return;
        }
      }else if(req.method!=="GET"||route==="/defense-studio-export"){
        send(405,page("Form required","<p>Use the training page's manual form buttons.</p>"));return;
      }
      const result=evaluateDefenseStudio(config);
      if(route==="/defense-studio-export"){
        send(200,exportStudioCsv(result),"text/csv; charset=utf-8",
          {"Content-Disposition":'attachment; filename="openguin-offline-defense-studio.csv"'});
        return;
      }
      const comparison=compareStudioConfig(config);
      const option=(value,text,selected)=>'<option value="'+value+'"'+
        (selected===value?" selected":"")+'>'+escapeHtml(text)+'</option>';
      const profiles=Object.entries(STUDIO_PROFILES).map(([id,info])=>
        option(id,info.label,config.profile)).join("");
      const numbers=(value)=>STUDIO_LEVELS.map(n=>
        option(String(n),String(n)+" virtual events / slot",String(value))).join("");
      const modes=option("protected","Protection enabled",config.mode)+
        option("teaching","Teaching contrast (checks disabled)",config.mode);
      const formFields=
        '<label>Virtual event pattern <select name="profile">'+profiles+'</select></label> '+
        '<label>Throttle threshold <select name="rateLimit">'+numbers(config.rateLimit)+'</select></label> '+
        '<label>Virtual capacity <select name="serviceCapacity">'+numbers(config.serviceCapacity)+'</select></label> '+
        '<label>Model mode <select name="mode">'+modes+'</select></label> ';
      const form=(action,button)=>
        '<form method="post" action="'+action+'" style="display:grid;gap:9px;'+
        'padding:10px;border:1px solid #35566a;border-radius:8px">'+field(csrf)+
        formFields+'<button type="submit">'+button+'</button></form>';
      const row=(cells)=>'<tr>'+cells.map(x=>'<td style="border-bottom:1px solid #46657a;'+
        'padding:6px">'+escapeHtml(x)+'</td>').join("")+'</tr>';
      const slotRows=result.perSlot.map(x=>row([
        String(x.frame),String(x.incoming),String(x.accepted),
        String(x.throttled),String(x.unavailable)
      ])).join("");
      const compareRows=[
        ["Virtual traffic accepted","accepted"],
        ["Virtual throttled responses 429","throttled"],
        ["Virtual capacity responses 503","virtualUnavailable"],
        ["Virtual account protections","accountProtected"],
        ["Mock ownership denies","ownershipDenied"]
      ].map(([label,key])=>row([
        label,String(comparison.protected[key]),String(comparison.teaching[key])
      ])).join("");
      const explain='<p>Inspired by NIST SP 800-63B-4 and OWASP Authentication / API Security guidance. '+
        'This is a deterministic mathematical model, not a live website load test. '+
        'No passwords, usernames, attack strings, network traffic, target addresses, or HTTP probes are generated by the engine.</p>';
      send(200,page("OWASP / NIST Defense Studio",
        "<p>Change one of the bounded, preinstalled parameters and click "+
        "Run one offline comparison. One local form POST calculates synthetic events "+
        "in memory; it does not send event requests anywhere.</p>"+
        form("/defense-studio","Run one offline comparison")+
        form("/defense-studio-export","Export virtual event counts (CSV)")+
        "<h3>Current simulation: "+escapeHtml(STUDIO_PROFILES[config.profile].label)+
        " · "+escapeHtml(config.mode)+"</h3>"+
        "<p>Simulated events: "+result.virtualEvents+
        ". None are network requests. Profiles are fixed; the model cannot target a server.</p>"+
        "<table><caption>Virtual events by time slot</caption><thead><tr>"+
        "<th>Slot</th><th>Incoming</th><th>Accepted</th><th>429</th><th>503</th>"+
        "</tr></thead><tbody>"+slotRows+"</tbody></table>"+
        "<h3>Protected versus teaching contrast</h3>"+
        "<table><thead><tr><th>Metric</th><th>Protected</th><th>Teaching</th>"+
        "</tr></thead><tbody>"+compareRows+"</tbody></table>"+
        "<h3>What these outcomes mean</h3><p>401: fictional credential failure; "+
        "403: mock ownership blocked; 429: conceptual throttle / lockout; "+
        "503: conceptual capacity unavailable. No password checks, exploit "+
        "execution, networking tools or pressure on the computer.</p>"+
        explain+
        "<p><a href='/manual-console'>Manual HTTP defense checks</a> · "+
        "<a href='/ownership-lab'>Object ownership exercise</a></p>"));return;
    }
    if(["/drills","/drill-step","/drill-policy","/drill-reset","/drill-report"].includes(route)){
      if(req.method==="GET"&&route==="/drill-report"){
        const report=exportManualDrills(drills.snapshot(csrf));
        send(200,JSON.stringify(report,null,2),"application/json; charset=utf-8",
          {"Content-Disposition":'attachment; filename="openguin-manual-drills-v14.json"'});
        return;
      }
      if(req.method==="POST"&&["/drill-step","/drill-policy","/drill-reset"].includes(route)){
        let params;
        try{params=await bodyParams(req)}
        catch(e){send(e.status??400,"Invalid training form.","text/plain; charset=utf-8");return;}
        if(!verifyCsrf(params)){
          send(403,page("Form rejected",
            "<p>Use the local single-step exercise buttons with a server-issued form token.</p>"));
          return;
        }
        const track=params.get("track");
        if(!DRILL_TRACKS.includes(track)){
          send(422,page("Unsupported exercise","<p>Select a preinstalled local training track.</p>"));
          return;
        }
        const mode=params.get("mode");
        if(route==="/drill-policy"&&!DRILL_MODES.includes(mode)){
          send(422,page("Unsupported defense mode",
            "<p>Only protected or educational-contrast modes are available.</p>"));return;
        }
        const answer=route==="/drill-policy"?
          drills.selectMode(csrf,track,mode):
          route==="/drill-reset"?drills.reset(csrf,track):drills.step(csrf,track);
        const msg=route==="/drill-policy"?
          "已切换该虚拟训练轨道的规则并清空轨道计数。":
          route==="/drill-reset"?"该虚拟轨道的计数已清空。":answer.note;
        const reply='<p>'+escapeHtml(msg)+'</p>'+
          '<p>Actual localhost HTTP response: <strong>'+answer.status+'</strong>.</p>'+
          '<p><a href="/drills">Return to three-track exercises</a> · '+
          '<a href="/access-log">Download safe access log</a></p>';
        const extra=answer.status===429?{"Retry-After":"60"}:{};
        send(answer.status,page("One manual defensive drill step",reply),
          "text/html; charset=utf-8",extra);
        return;
      }
      if(req.method!=="GET"||route!=="/drills"){
        send(405,page("Manual form required",
          "<p>Use the visible training buttons. No automatic sequences are provided.</p>"));
        return;
      }
      const current=drills.snapshot(csrf);
      const tracks=[
        {id:"identity",title:"身份失败与锁定",detail:
          "每次点击代表一次不包含用户名或密码的虚构失败事件。保护模式在三次失败后返回 429；对照模式保持 401。"},
        {id:"ownership",title:"对象权限检查",detail:
          "每次点击只检查一个固定的虚构记录。保护模式返回 403，对照模式返回 200；没有真实私有数据。"},
        {id:"capacity",title:"虚拟积压与限流",detail:
          "每次点击增加一个数字计数。保护模式达到阈值后返回 429；对照模式返回概念性 503，不会制造流量。"}
      ];
      const action=(route,track,label,mode="")=>
        '<form method="post" action="'+route+'">'+field(csrf)+
        '<input type="hidden" name="track" value="'+track+'">'+
        (mode?'<input type="hidden" name="mode" value="'+mode+'">':"")+
        '<button type="submit">'+escapeHtml(label)+'</button></form>';
      const cards=tracks.map(d=>
        '<section style="border-color:#557c91">'+
        '<h3>'+escapeHtml(d.title)+'</h3><p>'+escapeHtml(d.detail)+'</p>'+
        '<p>当前规则：<strong>'+escapeHtml(current.modes[d.id])+
        '</strong> · 模拟计数：<strong>'+current.counts[d.id]+'</strong></p>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
        action("/drill-step",d.id,"手动执行一次虚构事件")+
        action("/drill-policy",d.id,"开启防御","protected")+
        action("/drill-policy",d.id,"教学对照规则","teaching")+
        action("/drill-reset",d.id,"重置本轨道")+'</div></section>'
      ).join("");
      const rows=current.history.slice().reverse().map(e=>
        '<tr><td>'+e.order+'</td><td>'+escapeHtml(e.track)+
        '</td><td>'+escapeHtml(e.kind)+'</td><td>'+
        escapeHtml(e.policy)+'</td><td>'+e.status+'</td></tr>'
      ).join("");
      send(200,page("Three-Track Manual Defense Drills",
        "<p>手动扮演安全测试人员：一次点击对应一次真实 localhost 表单请求，"+
        "服务端只处理一件虚构事件。切换保护/对照规则，再复测并观察状态码。"+
        "不存在密码尝试、漏洞利用载荷、网络发包或流量生成器。</p>"+
        cards+
        "<h3>本次手动操作记录（最多 30 条）</h3>"+
        '<table><thead><tr><th>序号</th><th>轨道</th><th>操作</th>'+
        "<th>规则</th><th>HTTP</th></tr></thead><tbody>"+
        rows+"</tbody></table>"+
        '<p><a href="/drill-report">下载脱敏虚构演练报告 JSON</a> · '+
        '<a href="/access-log">下载真实 localhost 脱敏 HTTP 日志</a></p>'+
        "<p>注意：报告中虚拟事件数不等于网络请求数；每次手动操作仅发送一个"+
        "本机 HTTP 请求。练习不评估任何真实网站的安全性。</p>"));
      return;
    }
    if(["/defense-engine","/defense-engine-export"].includes(route)){
      let config={...DEFAULT_DEFENSE_CONFIG};
      if(req.method==="POST"){
        let params;
        try{params=await bodyParams(req)}
        catch(e){send(e.status??400,"Invalid local form.","text/plain; charset=utf-8");return;}
        if(!verifyCsrf(params)){
          send(403,page("Defense engine form refused",
            "<p>Use the server-issued localhost training form.</p>"));return;
        }
        try{
          config=validateDefenseV15({
            pattern:params.get("pattern"),
            capacity:Number(params.get("capacity")),
            queue:Number(params.get("queue")),
            throttle:Number(params.get("throttle")),
            lockout:Number(params.get("lockout"))
          });
        }catch{
          send(422,page("Training parameter rejected",
            "<p>Only the provided bounded model values are supported.</p>"));return;
        }
      }else if(req.method!=="GET"||route==="/defense-engine-export"){
        send(405,page("Method not supported",
          "<p>Use the visible local form controls.</p>"));return;
      }
      const model=runDefenseV15(config);
      if(route==="/defense-engine-export"){
        send(200,exportDefenseV15Csv(model),"text/csv; charset=utf-8",
          {"Content-Disposition":'attachment; filename="openguin-v15-offline-defense.csv"'});
        return;
      }
      const report=exportDefenseV15(model);
      const select=(name,values,selected,title)=>
        '<label>'+escapeHtml(title)+' <select name="'+name+'">'+
        values.map(([key,label])=>
          '<option value="'+key+'"'+(String(key)===String(selected)?" selected":"")+'>'+
          escapeHtml(label)+'</option>').join("")+'</select></label>';
      const numeric=(choices)=>choices.map(n=>[n,String(n)]);
      const controls=
        select("pattern",Object.entries(DEFENSE_PATTERNS).map(([id,p])=>[id,p.label]),
          config.pattern,"预设业务场景")+
        select("capacity",numeric(DEFENSE_CAPACITY_OPTIONS),config.capacity,"每时间片虚拟处理容量")+
        select("queue",numeric(DEFENSE_QUEUE_OPTIONS),config.queue,"虚拟排队上限")+
        select("throttle",numeric(DEFENSE_THROTTLE_OPTIONS),config.throttle,"虚拟限流阈值")+
        select("lockout",numeric(DEFENSE_LOCK_OPTIONS),config.lockout,"虚构失败次数保护阈值");
      const form=(action,label)=>
        '<form method="post" action="'+action+'" style="padding:12px;display:flex;'+
        'flex-wrap:wrap;align-items:center;gap:9px;border:1px solid #506f81;border-radius:10px">'+
        field(csrf)+controls+'<button type="submit">'+escapeHtml(label)+'</button></form>';
      const tableRows=report.slots.map(d=>{
        const guardedWidth=Math.max(0,Math.min(100,Math.round(d.guardedProcessed/d.incoming*100)));
        const blockedWidth=Math.max(0,Math.min(100,Math.round(d.guardedThrottled/d.incoming*100)));
        const bar='<div style="height:10px;background:#274359;border-radius:5px;overflow:hidden;'+
          'min-width:90px;display:flex">'+
          '<span style="width:'+guardedWidth+'%;background:#71b6b7"></span>'+
          '<span style="width:'+blockedWidth+'%;background:#c6a77e"></span></div>';
        return '<tr><td>'+d.slot+'</td><td>'+d.incoming+'</td>'+
          '<td>'+d.guardedProcessed+'</td><td>'+d.guardedThrottled+'</td>'+
          '<td>'+d.guardedUnavailable+'</td><td>'+d.guardedQueued+'</td>'+
          '<td>'+d.contrastUnavailable+'</td><td>'+bar+'</td></tr>';
      }).join("");
      const metric=[
        ["进入事件数","arrivals"],["处理事件数","processed"],
        ["限流事件数","throttled"],["容量拒绝事件数","unavailable"],
        ["结束时仍排队","remainingQueued"],["峰值排队量","peakBacklog"],
        ["第95百分位虚拟延迟单位","p95LatencyUnits"],
        ["估算正常请求受限数","estimatedNormalThrottled"],
        ["处理完成率（%）","processedPercent"]
      ].map(([label,key])=>'<tr><td>'+escapeHtml(label)+'</td><td>'+
        report.protected[key]+'</td><td>'+report.contrast[key]+'</td></tr>').join("");
      const risk=(
        '<tr><td>虚构登录保护次数</td><td>'+report.protected.identityPrevented+
        '</td><td>'+report.contrast.identityPrevented+'</td></tr>'+
        '<tr><td>固定权限/验证案例未通过数</td><td>'+report.protected.validationMisses+
        '</td><td>'+report.contrast.validationMisses+'</td></tr>'
      );
      const identityRows=model.protected.identity.events.map((e,i)=>{
        const other=model.contrast.identity.events[i];
        const label=e.event==="invented-recovery"?"虚拟恢复事件":"虚拟身份失败";
        return '<tr><td>'+e.step+'</td><td>'+escapeHtml(label)+
          '</td><td>'+e.status+'</td><td>'+other.status+'</td></tr>';
      }).join("");
      const guardRows=model.protected.validation.cases.map((e,i)=>{
        const other=model.contrast.validation.cases[i];
        return '<tr><td>'+escapeHtml(e.id)+'</td><td>'+e.status+
          '</td><td>'+other.status+'</td><td>'+escapeHtml(e.repair)+'</td></tr>';
      }).join("");
      send(200,page("v15 Advanced Offline Defense Engine",
        '<p>16 个虚拟时间片的排队模型。每次手动运行只发出一条 localhost 表单请求；'+
        '模型事件不会成为真实网络请求，也不消耗模拟出来的服务器容量。</p>'+
        form("/defense-engine","运行一次防护对照")+
        form("/defense-engine-export","导出当前配置的脱敏 CSV")+
        '<h3>防护与教学对照</h3><table><thead><tr><th>模型指标</th>'+
        '<th>防护开启</th><th>教学对照</th></tr></thead><tbody>'+
        metric+risk+'</tbody></table>'+
        '<h3>时间线：'+escapeHtml(DEFENSE_PATTERNS[config.pattern].label)+'</h3>'+
        '<p><span style="color:#71b6b7">■</span> 虚拟处理量 · '+
        '<span style="color:#c6a77e">■</span> 虚拟限流量。'+
        '这不是实际服务器性能曲线。</p>'+
        '<table><thead><tr><th>时段</th><th>流入</th><th>处理</th>'+
        '<th>429</th><th>503</th><th>排队</th><th>无保护503</th><th>示意</th>'+
        '</tr></thead><tbody>'+tableRows+'</tbody></table>'+
        '<h3>认证防护事件时间线（固定虚构事件）</h3>'+
        '<table><thead><tr><th>步骤</th><th>虚构事件</th>'+
        '<th>防护开启</th><th>教学对照</th></tr></thead><tbody>'+
        identityRows+'</tbody></table>'+
        '<h3>授权与输入防护检查矩阵（不执行漏洞利用）</h3>'+
        '<table><thead><tr><th>固定案例</th><th>防护开启</th>'+
        '<th>教学对照</th><th>修复概念</th></tr></thead><tbody>'+
        guardRows+'</tbody></table>'+
        '<h3>如何复测</h3><p>一次只更改一个变量（例如处理容量），重新运行。'+
        '观察排队峰值、容量拒绝和正常请求被限流的估计值是否出现取舍。'+
        '虚拟延迟单位不是毫秒；此模型不能测量真实网站抗压性能。</p>'+
        '<p>授权场景来自固定的虚构记录、角色、CSRF 与字段规则；'+
        '认证时间线仅用“失败/恢复”标签，不尝试任何密码，也不执行漏洞载荷。</p>'+
        '<p><a href="/drills">手动单步三轨道练习</a> · '+
        '<a href="/ownership-lab">真实 localhost 权限修复练习</a> · '+
        '<a href="/access-log">脱敏访问日志</a></p>'));
      return;
    }
    if(req.method==="GET"&&route==="/workbench-client"){
      send(200,fixedWorkbenchClient,"text/javascript; charset=utf-8");return;
    }
    if(req.method==="GET"&&route==="/workbench"){
      // Only this page may load the local, fixed-source inspector script.
      // It can connect only to its own same-origin localhost server.
      headers["Content-Security-Policy"]=
        "default-src 'none'; script-src 'self'; connect-src 'self'; "+
        "style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
      const actions=[
        ["health","Health 检查","单次 GET，确认本机服务"],
        ["member","会员权限","检查 401 或 200"],
        ["admin","管理权限","检查 401、403 或 200"],
        ["ownrecord","本人虚拟记录","检查正常的 200 响应"],
        ["otherrecord","他人虚拟记录","对照缺陷模式下 200 和修复后的 403"],
        ["form","表单页面","验证会话允许访问"],
        ["rate","手动限流检查","每次点击只请求一次"],
        ["csrf","缺失表单校验","需要演练成员身份"],
        ["validation","字段格式检查","仅提交固定示例文本"],
        ["ordinary","合法表单示例","输入会被服务器丢弃"]
      ];
      const cards=actions.map(([id,title,description])=>
        '<button type="button" data-lab-action="'+id+'" style="text-align:left;'+
        'background:#18465c;color:#eef8fc;border:1px solid #426e86;'+
        'border-radius:10px;padding:12px;min-height:68px;cursor:pointer">'+
        '<strong style="display:block">'+title+'</strong>'+
        '<small>'+description+'</small></button>').join("");
      const body='<p>从下方选择一次手动 HTTP 检查，浏览器会向本机固定路由发送一条请求。'+
        '没有目标地址输入框、自动重复、密码尝试、漏洞攻击或流量生成。</p>'+
        '<p>当前虚构角色：<strong>'+escapeHtml(role)+
        '</strong>。如需改变角色，请在 <a href="/">首页</a> 手动选择 Demo member / administrator。</p>'+
        '<input type="hidden" id="wb-csrf" value="'+escapeHtml(csrf)+'">'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">'+cards+'</div>'+
        '<section aria-live="polite"><h3>本次请求结果</h3>'+
        '<p id="wb-current">选择一项检查，浏览器会显示真实的本机 HTTP 响应状态与有限的安全响应头。</p></section>'+
        '<section><h3>手动检查记录</h3><p id="wb-summary">尚未开始。</p>'+
        '<ol id="wb-history" style="padding-left:24px;max-height:350px;overflow:auto"></ol>'+
        '<button type="button" id="wb-export">导出脱敏结果 JSON</button> '+
        '<button type="button" id="wb-clear">清空当前浏览器记录</button></section>'+
        '<p>每次最多保留 30 条本浏览器页面内的结果。不会导出 Cookie、CSRF 令牌、请求正文或响应正文。'+
        '完整服务器侧结果可通过 <a href="/access-log">脱敏 access.log</a> 分析。</p>'+
        '<script src="/workbench-client" defer></script>';
      send(200,page("Manual HTTP Workbench",body));return;
    }
    if(req.method==="GET"&&route==="/manual-console"){
      const state=exercises.snapshot(csrf);
      const one=(action,button,detail)=>
        '<form action="'+action+'" method="post">'+field(csrf)+
        '<button type="submit">'+escapeHtml(button)+'</button> '+
        '<small>'+escapeHtml(detail)+'</small></form>';
      send(200,page("Manual defense console",
        "<p>Each button makes exactly one ordinary browser POST to this loopback server. "+
        "No credentials, exploit payloads, requests to other websites or concurrent traffic are created.</p>"+
        "<h3>Identity failure & lockout model</h3>"+
        "<p>Invented failed sign-in events in the current 60-second window: "+
        state.failedIdentityEvents+" / 3. There is no password field or checking algorithm.</p>"+
        one("/manual-attempt","Record one fake identity failure",
          "Expected 401 for the first three events, then 429 until the window expires.")+
        "<h3>Capacity protection model (no actual load)</h3>"+
        "<p>Virtual queue units: "+state.virtualQueueUnits+" / 5. "+
        "These are numbers, not sockets, CPU tasks or live requests.</p>"+
        one("/manual-capacity","Advance virtual queue one step",
          "A single local request increments a counter; after three units the response is 503.")+
        "<h3>Restore the training baseline</h3>"+
        one("/manual-reset","Reset invented counters",
          "Resets only this lab's fictional event state.")+
        "<p>Open your browser's Network panel to inspect the single response, "+
        "then use <a href='/events'>event summary</a> or "+
        "<a href='/access-log'>sanitized access.log</a> to investigate.</p>"));return;
    }
    if(req.method==="POST"&&["/manual-attempt","/manual-capacity","/manual-reset"].includes(route)){
      let params;
      try{params=await bodyParams(req)}
      catch(e){send(e.status??400,"Invalid local form.","text/plain; charset=utf-8");return;}
      if(!verifyCsrf(params)){
        send(403,page("Manual check refused","<p>Use the form on the local Manual Defense Console.</p>"));
        return;
      }
      const result=route==="/manual-attempt"?exercises.failureCheck(csrf):
        route==="/manual-capacity"?exercises.capacityCheck(csrf):
          exercises.reset(csrf);
      const body="<p>"+escapeHtml(result.message)+"</p>"+
        "<p>Training decision: <code>HTTP "+result.status+"</code> · "+
        "<code>"+escapeHtml(result.reason)+"</code>.</p>"+
        "<p><a href='/manual-console'>Return to manual defense console</a></p>";
      const extra=result.status===429?{"Retry-After":"60"}:{};
      send(result.status,page("One-click defense result",body),"text/html; charset=utf-8",extra);
      return;
    }
    if(req.method==="GET"&&route==="/rate-check"){
      const key=authenticated?cookies.get("lab_session"):"guest";
      const current=(limiter.get(key)??[]).filter(time=>time>now()-30000);
      if(current.length>=4){
        limiter.set(key,current);
        send(429,page("Rate limit reached","<p>Four manual refreshes in a 30-second window trigger the demo limit. No load test is needed.</p>"),
          "text/html; charset=utf-8",{"Retry-After":"30"});return;
      }
      current.push(now());
      limiter.set(key,current);
      if(limiter.size>128)limiter.delete(limiter.keys().next().value);
      send(200,page("Rate limit demo","<p>Allowed check "+current.length+" of 4 in the current 30-second window.</p>"+
        "<p>Refresh this page manually to observe how 429 differs from a normal response.</p>"));return;
    }
    if(req.method==="GET"&&route==="/access-log"){
      const timestamp=(iso)=>{
        const d=new Date(iso),z=n=>String(n).padStart(2,"0");
        const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return z(d.getUTCDate())+"/"+months[d.getUTCMonth()]+"/"+d.getUTCFullYear()+
          ":"+z(d.getUTCHours())+":"+z(d.getUTCMinutes())+":"+z(d.getUTCSeconds())+" +0000";
      };
      const body=events.map(e=>
        '127.0.0.1 - - ['+timestamp(e.at)+'] "'+e.method+" "+
        (e.route==="other"?"/other":e.route)+' HTTP/1.1" '+e.status+
        ' 0 "-" "OpenPenguin-ManualLab"').join("\n")+"\n";
      send(200,body,"text/plain; charset=utf-8",
        {"Content-Disposition":'attachment; filename="openguin-localhost-access.log"'});
      return;
    }
    if(req.method==="GET"&&route==="/events"){
      const counts={};
      for(const item of events)counts[String(item.status)]=(counts[String(item.status)]??0)+1;
      const rows=Object.entries(counts).sort().map(([code,n])=>
        "<tr><td>"+code+"</td><td>"+n+"</td></tr>").join("");
      send(200,page("Local event summary","<p>Only HTTP status totals are collected in this process. "+
        "No source IPs, user agents, credentials, body text, cookie values or full URLs are stored.</p>"+
        '<table><thead><tr><th>HTTP status</th><th>Count</th></tr></thead><tbody>'+rows+"</tbody></table>"));return;
    }
    send(404,page("Not found","<p>Use the visible navigation routes in this training lab.</p>"));
  });
  server.requestTimeout=5000;
  server.headersTimeout=5000;
  server.maxHeadersCount=30;
  return {
    async start(){
      if(server.listening)throw Error("Local lab already started");
      await new Promise((resolve,reject)=>{
        server.once("error",reject);
        server.listen(port,LAB_HOST,()=>{
          server.off("error",reject);
          activePort=server.address().port;
          resolve();
        });
      });
      return "http://"+LAB_HOST+":"+activePort;
    },
    async stop(){if(!server.listening)return;await new Promise((resolve,reject)=>
      server.close(e=>e?reject(e):resolve()));},
    address(){return server.listening?"http://"+LAB_HOST+":"+activePort:null;},
    server,
    getAggregates(){
      const counts={};
      for(const e of events)counts[String(e.status)]=(counts[String(e.status)]??0)+1;
      return {requests:events.length,statusCounts:counts,loopbackOnly:true};
    }
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const lab=createLocalDefenseLab();
  lab.start().then(url=>{
    process.stdout.write("OpenPenguin manual defense lab: "+url+"\n"+
      "Bound to 127.0.0.1 only. Demo accounts, no real identities. Ctrl+C to stop.\n");
  }).catch(e=>{process.stderr.write("Cannot start the isolated lab: "+e.message+"\n");process.exitCode=1;});
}
