/**
 * OpenPenguin Manual Localhost Defense Lab
 * Standalone educational HTTP server. Binds ONLY to IPv4 loopback.
 * No outbound requests, proxying, target URL inputs, attack automation,
 * passwords, actual user databases, or stored user-supplied content.
 */
import http from "node:http";
import {randomBytes,timingSafeEqual} from "node:crypto";
import {pathToFileURL} from "node:url";

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
    '<a href="/form">Form</a> · <a href="/rate-check">Rate check</a> · <a href="/events">Local event summary</a> · <a href="/access-log">Download log</a></nav></header>'+
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
  let activePort=port;
  const record=(route,status)=>{
    const safeRoute=new Set(["/","/health","/session","/logout","/member","/admin","/form","/rate-check","/events","/access-log"]);
    events.push({at:new Date(now()).toISOString(),route:safeRoute.has(route)?route:"other",
      method:["GET","POST","HEAD"].includes(req.method)?req.method:"OTHER",status});
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
      record(route,status);
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
      sessions.set(token,{role:nextRole,expiresAt:now()+sessionTtlMs});
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
