import test from "node:test";
import http from "node:http";
import {analyzeAccessLog} from "../.network-test/server-access-log.mjs";
import assert from "node:assert/strict";
import {createLocalDefenseLab,LAB_HOST} from "../scripts/localhost-defense-lab.mjs";

async function setup(t,opts={}){
  const lab=createLocalDefenseLab({port:0,...opts});
  const url=await lab.start();
  t.after(async()=>{await lab.stop()});
  return {lab,url};
}
async function get(url,options={}){
  return fetch(url,{redirect:"manual",...options});
}
async function rawGet(url,hostHeader){
  return new Promise((resolve,reject)=>{
    const req=http.request(url,{method:"GET",headers:{Host:hostHeader}},res=>{
      const chunks=[];
      res.on("data",chunk=>chunks.push(chunk));
      res.on("end",()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString("utf8")}));
    });
    req.once("error",reject);req.end();
  });
}
function cookieHeader(response,name){
  const value=response.headers.get("set-cookie")??"";
  const m=new RegExp("(?:^|[, ]+)("+name+"=[a-z0-9]+)","i").exec(value);
  assert(m,"missing "+name+" cookie");
  return m[1];
}
async function initialContext(url){
  const home=await get(url+"/");
  assert.equal(home.status,200);
  const cookie=cookieHeader(home,"lab_csrf");
  const html=await home.text();
  const token=/name="csrf" value="([a-f0-9]+)"/.exec(html)?.[1];
  assert(token);
  assert.equal(cookie.slice("lab_csrf=".length),token);
  return {cookie,token};
}
async function session(url,role){
  const init=await initialContext(url);
  const result=await get(url+"/session",{
    method:"POST",headers:{"Cookie":init.cookie,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:init.token,role}).toString()
  });
  assert.equal(result.status,303);
  return {cookie:init.cookie+"; "+cookieHeader(result,"lab_session"),token:init.token};
}

test("lab binds exclusively to IPv4 loopback and carries security headers",async t=>{
  const {lab,url}=await setup(t);
  assert.equal(lab.server.address().address,LAB_HOST);
  assert(url.startsWith("http://127.0.0.1:"));
  const health=await get(url+"/health");
  assert.equal(health.status,200);
  assert.equal(health.headers.get("x-content-type-options"),"nosniff");
  assert.equal(health.headers.get("x-frame-options"),"DENY");
  assert.equal(health.headers.get("access-control-allow-origin"),null);
  assert.equal((await health.json()).networkScope,"127.0.0.1");
});
test("untrusted Host, Origin and unsupported methods are refused",async t=>{
  const {url}=await setup(t);
  const host=await rawGet(url+"/health","attacker.example");
  assert.equal(host.status,400);
  const origin=await get(url+"/",{headers:{"Origin":"https://unrelated.example"}});
  assert.equal(origin.status,403);
  assert.equal((await get(url+"/",{method:"PUT"})).status,405);
  assert.equal((await get(url+"/?sensitive=anything")).status,400);
  assert.equal((await get(url+"/unknown")).status,404);
});
test("member role gets protected pages but not admin page",async t=>{
  const {url}=await setup(t);
  assert.equal((await get(url+"/member")).status,401);
  assert.equal((await get(url+"/admin")).status,401);
  const s=await session(url,"member");
  assert.equal((await get(url+"/member",{headers:{Cookie:s.cookie}})).status,200);
  assert.equal((await get(url+"/admin",{headers:{Cookie:s.cookie}})).status,403);
  assert.equal((await get(url+"/form",{headers:{Cookie:s.cookie}})).status,200);
});
test("demo administrator can visit admin resource; role change is not authentication",async t=>{
  const {url}=await setup(t);
  const s=await session(url,"admin");
  const admin=await get(url+"/admin",{headers:{Cookie:s.cookie}});
  assert.equal(admin.status,200);
  const doc=await admin.text();
  assert(!doc.includes("real password"));
});
test("forms require session, anti-CSRF token and basic server-side validation",async t=>{
  const {url}=await setup(t);
  assert.equal((await get(url+"/form",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"label=test"})).status,401);
  const s=await session(url,"member");
  const send=(body,more={})=>get(url+"/form",{method:"POST",
    headers:{"Cookie":s.cookie,"Content-Type":"application/x-www-form-urlencoded",...more},
    body:new URLSearchParams(body).toString()});
  assert.equal((await send({label:"Test"})).status,403);
  assert.equal((await send({label:"bad<>",csrf:s.token})).status,422);
  const success=await send({label:"Normal Note",csrf:s.token});
  assert.equal(success.status,200);
  assert(!(await success.text()).includes("Normal Note"));
  assert.equal((await get(url+"/form",{method:"POST",headers:{"Cookie":s.cookie,"Content-Type":"application/json"},body:'{"label":"x"}'})).status,415);
});
test("expired invented sessions are rejected",async t=>{
  let clock=1700000000000;
  const {url}=await setup(t,{now:()=>clock,sessionTtlMs:100});
  const s=await session(url,"member");
  assert.equal((await get(url+"/member",{headers:{Cookie:s.cookie}})).status,200);
  clock+=101;
  assert.equal((await get(url+"/member",{headers:{Cookie:s.cookie}})).status,401);
});
test("manual rate-check demonstrates 429 with a tiny bounded example",async t=>{
  const {url}=await setup(t);
  for(let i=0;i<4;i++)assert.equal((await get(url+"/rate-check")).status,200);
  const limited=await get(url+"/rate-check");
  assert.equal(limited.status,429);
  assert.equal(limited.headers.get("retry-after"),"30");
});
test("demonstrates logout and does not keep user-submitted body in aggregates",async t=>{
  const {url,lab}=await setup(t);
  const s=await session(url,"member");
  const out=await get(url+"/logout",{method:"POST",headers:{"Cookie":s.cookie,
    "Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:s.token}).toString()});
  assert.equal(out.status,303);
  assert.equal((await get(url+"/member",{headers:{Cookie:s.cookie}})).status,401);
  const summary=JSON.stringify(lab.getAggregates());
  assert.equal(summary.includes("lab_session="),false);
  assert.equal(summary.includes("lab_csrf="),false);
  assert.equal(summary.includes("127.0.0.1:"),false);
  assert.equal((await get(url+"/events")).status,200);
});
test("unexpected role, path and body are bounded and never executed",async t=>{
  const {url}=await setup(t);
  const init=await initialContext(url);
  const invalid=await get(url+"/session",{method:"POST",headers:{"Cookie":init.cookie,
    "Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:init.token,role:"outside"}).toString()});
  assert.equal(invalid.status,422);
  const long=await get(url+"/session",{method:"POST",headers:{"Cookie":init.cookie,
    "Content-Type":"application/x-www-form-urlencoded"},
    body:"a".repeat(2100)});
  assert.equal(long.status,413);
  assert.equal((await get(url+"/admin/../member?x=1")).status,400);
});

test("invented client-side CSRF cookie does not bypass server-issued verification",async t=>{
  const {url}=await setup(t);
  const forged="a".repeat(48);
  const r=await get(url+"/session",{method:"POST",
    headers:{"Cookie":"lab_csrf="+forged,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:forged,role:"admin"}).toString()});
  assert.equal(r.status,403);
});

test("real localhost outcomes export an anonymized Apache-compatible access.log",async t=>{
  const {url}=await setup(t);
  assert.equal((await get(url+"/member")).status,401);
  assert.equal((await get(url+"/health")).status,200);
  const download=await get(url+"/access-log");
  assert.equal(download.status,200);
  assert(download.headers.get("content-disposition")?.includes("attachment"));
  const text=await download.text();
  const parsed=analyzeAccessLog(text);
  assert.equal(parsed.parsedLines,2);
  assert.equal(parsed.clientResponses,1);
  assert(!text.includes("lab_session="));
  assert(!text.includes("lab_csrf="));
  assert(!text.includes("attacker.example"));
  assert(text.includes("127.0.0.1"));
});


test("manual console renders a browser operated, no-password defense workflow",async t=>{
  const {url}=await setup(t);
  const r=await get(url+"/manual-console");
  assert.equal(r.status,200);
  const html=await r.text();
  assert(html.includes('action="/manual-attempt"'));
  assert(html.includes('action="/manual-capacity"'));
  assert(html.includes('action="/manual-reset"'));
  assert(!html.includes('name="password"'));
  assert(!html.includes('targetHost'));
});
test("single-click synthetic identity failures demonstrate 401 then 429 without a password",async t=>{
  const {url,lab}=await setup(t);
  const s=await initialContext(url);
  const post=()=>get(url+"/manual-attempt",{
    method:"POST",headers:{"Cookie":s.cookie,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:s.token}).toString()
  });
  for(let i=0;i<3;i++)assert.equal((await post()).status,401);
  const limited=await post();
  assert.equal(limited.status,429);
  assert.equal(limited.headers.get("retry-after"),"60");
  const records=lab.getAggregates();
  assert.equal(records.statusCounts["429"],1);
  assert(!JSON.stringify(records).includes(s.token));
});
test("single-click capacity simulation returns conceptual 503 without allocating real load",async t=>{
  const {url}=await setup(t);
  const s=await initialContext(url);
  const post=()=>get(url+"/manual-capacity",{
    method:"POST",headers:{"Cookie":s.cookie,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:s.token}).toString()
  });
  for(let i=0;i<3;i++)assert.equal((await post()).status,200);
  for(let i=0;i<2;i++)assert.equal((await post()).status,503);
  const clear=await get(url+"/manual-reset",{method:"POST",
    headers:{"Cookie":s.cookie,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:s.token}).toString()});
  assert.equal(clear.status,200);
  assert.equal((await post()).status,200);
});
test("manual controls require a server-issued CSRF token and never accept arbitrary destinations",async t=>{
  const {url}=await setup(t);
  const fake="d".repeat(48);
  const r=await get(url+"/manual-attempt",{method:"POST",
    headers:{"Cookie":"lab_csrf="+fake,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:fake}).toString()});
  assert.equal(r.status,403);
  assert.equal((await get(url+"/manual-capacity")).status,404);
  assert.equal((await get(url+"/manual-console?target=https://example.org")).status,400);
  const s=await initialContext(url);
  const missing=await get(url+"/manual-reset",{method:"POST",
    headers:{"Cookie":s.cookie,"Content-Type":"application/x-www-form-urlencoded"},
    body:"not-a-csrf=value"});
  assert.equal(missing.status,403);
});
test("manual results are retained only as bounded sanitized route/status events",async t=>{
  const {url}=await setup(t);
  const s=await initialContext(url);
  await get(url+"/manual-attempt",{method:"POST",
    headers:{"Cookie":s.cookie,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:s.token}).toString()});
  const raw=await get(url+"/access-log");
  const text=await raw.text();
  assert.equal(raw.status,200);
  assert(text.includes("POST /manual-attempt HTTP/1.1"));
  assert(!text.includes("lab_csrf"));
  assert(!text.includes(s.token));
  assert(!text.includes("Content-Type"));
  assert.equal(analyzeAccessLog(text).ignoredLines,0);
});


test("HTTP workbench is served only from loopback with same-origin-only CSP",async t=>{
  const {url}=await setup(t);
  const r=await get(url+"/workbench");
  assert.equal(r.status,200);
  const csp=r.headers.get("content-security-policy")??"";
  assert(csp.includes("connect-src 'self'"));
  assert(csp.includes("script-src 'self'"));
  assert(csp.includes("default-src 'none'"));
  const page=await r.text();
  for(const id of ["health","member","admin","form","rate","csrf","validation","ordinary"])
    assert(page.includes('data-lab-action="'+id+'"'));
  assert(page.includes('src="/workbench-client"'));
  assert(!page.includes('name="password"'));
  assert(!page.includes('name="host"'));
  const client=await get(url+"/workbench-client");
  assert.equal(client.status,200);
  assert((client.headers.get("content-type")??"").includes("javascript"));
  assert((await client.text()).includes("credentials:\"same-origin\""));
});
test("HTTP inspector cannot choose remote hosts, query parameters or arbitrary methods",async t=>{
  const {url}=await setup(t);
  assert.equal((await get(url+"/workbench?target=https://example.net")).status,400);
  assert.equal((await get(url+"/workbench",{method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"target=remote"})).status,404);
  assert.equal((await get(url+"/workbench-client",{headers:{"Origin":"https://outside.example"}})).status,403);
});
test("workbench does not relax CSP for member, admin or other pages",async t=>{
  const {url}=await setup(t);
  const r=await get(url+"/");
  const csp=r.headers.get("content-security-policy")??"";
  assert(csp.includes("default-src 'none'"));
  assert(!csp.includes("script-src 'self'"));
  assert(!csp.includes("connect-src 'self'"));
});


test("fictional record ownership is enforced by default for members",async t=>{
  const {url}=await setup(t);
  assert.equal((await get(url+"/ownership-lab")).status,401);
  assert.equal((await get(url+"/record-other")).status,401);
  const s=await session(url,"member");
  const head={Cookie:s.cookie};
  const lab=await get(url+"/ownership-lab",{headers:head});
  assert.equal(lab.status,200);
  assert((await lab.text()).includes("OWNER CHECK ENABLED"));
  assert.equal((await get(url+"/record-own",{headers:head})).status,200);
  assert.equal((await get(url+"/record-other",{headers:head})).status,403);
});
test("opt-in educational missing-owner-check mode changes only fictional record response",async t=>{
  const {url}=await setup(t);
  const s=await session(url,"member");
  const headers={Cookie:s.cookie};
  const change=(mode)=>get(url+"/ownership-mode",{method:"POST",
    headers:{...headers,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:s.token,mode}).toString()});
  assert.equal((await change("invalid")).status,422);
  assert.equal((await change("training")).status,303);
  const exposed=await get(url+"/record-other",{headers});
  assert.equal(exposed.status,200);
  assert.equal(exposed.headers.get("x-openguin-lab-mode"),"deliberately-unprotected-fake-record");
  const body=await exposed.text();
  assert(body.includes("DEMO RECORD B"));
  assert(!body.includes("password"));
  assert.equal((await get(url+"/admin",{headers})).status,403);
  assert.equal((await change("protected")).status,303);
  const repaired=await get(url+"/record-other",{headers});
  assert.equal(repaired.status,403);
  assert.equal(repaired.headers.get("x-openguin-lab-mode"),null);
});
test("ownership teaching mode is per-session and cannot be enabled without local CSRF",async t=>{
  const {url}=await setup(t);
  const first=await session(url,"member"),second=await session(url,"member");
  const activate=()=>get(url+"/ownership-mode",{method:"POST",
    headers:{Cookie:first.cookie,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:first.token,mode:"training"}).toString()});
  assert.equal((await activate()).status,303);
  assert.equal((await get(url+"/record-other",{headers:{Cookie:first.cookie}})).status,200);
  assert.equal((await get(url+"/record-other",{headers:{Cookie:second.cookie}})).status,403);
  const noCsrf=await get(url+"/ownership-mode",{method:"POST",
    headers:{Cookie:second.cookie,"Content-Type":"application/x-www-form-urlencoded"},
    body:"mode=training"});
  assert.equal(noCsrf.status,403);
  assert.equal((await get(url+"/record-other",{headers:{Cookie:second.cookie}})).status,403);
  assert.equal((await get(url+"/ownership-lab?target=other.example")).status,400);
});
test("synthetic owner check produces real but sanitized Apache evidence",async t=>{
  const {url}=await setup(t);
  const s=await session(url,"member");
  const headers={Cookie:s.cookie};
  assert.equal((await get(url+"/record-other",{headers})).status,403);
  assert.equal((await get(url+"/ownership-mode",{method:"POST",
    headers:{...headers,"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({csrf:s.token,mode:"training"}).toString()})).status,303);
  assert.equal((await get(url+"/record-other",{headers})).status,200);
  const log=await (await get(url+"/access-log")).text();
  const parsed=analyzeAccessLog(log);
  assert.equal(parsed.ignoredLines,0);
  assert(log.includes('GET /record-other HTTP/1.1" 403'));
  assert(log.includes('GET /record-other HTTP/1.1" 200'));
  assert(!log.includes(s.token));
  assert(!log.includes("lab_session="));
});
