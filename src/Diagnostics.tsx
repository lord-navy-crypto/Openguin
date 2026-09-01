import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

type RuntimeDiscovery={bundledAvailable:boolean;bundledRunning:boolean;externalInstalled:boolean;externalRunning:boolean;externalVersion?:string};
type LogEntry={at:string;level:'info'|'warn'|'error';message:string};
type Bench={at:string;model:string;ctx:number;temperature:number;tokS:number};

const KEY='modeldock-diagnostics-log';
const SESSION_KEY='modeldock-session-count';
const MAX_LOGS=300;

function loadLogs():LogEntry[]{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
function saveLogs(v:LogEntry[]){localStorage.setItem(KEY,JSON.stringify(v.slice(-MAX_LOGS)))}

export default function Diagnostics(){
  const [open,setOpen]=useState(false);
  const [logs,setLogs]=useState<LogEntry[]>(loadLogs);
  const [runtime,setRuntime]=useState<RuntimeDiscovery|null>(null);
  const [sessions,setSessions]=useState(()=>Number(localStorage.getItem(SESSION_KEY)||'0'));
  const [bench,setBench]=useState<Bench[]>(()=>{try{return JSON.parse(localStorage.getItem('modeldock-benchmarks')||'[]')}catch{return[]}});

  const add=(level:LogEntry['level'],message:string)=>setLogs(prev=>{const next=[...prev,{at:new Date().toISOString(),level,message}].slice(-MAX_LOGS);saveLogs(next);return next});

  useEffect(()=>{
    const next=sessions+1; setSessions(next); localStorage.setItem(SESSION_KEY,String(next)); add('info','ModelDock session started');
    const onError=(e:ErrorEvent)=>add('error',`UI error: ${e.message}`);
    const onReject=(e:PromiseRejectionEvent)=>add('error',`Unhandled promise rejection: ${String(e.reason)}`);
    window.addEventListener('error',onError); window.addEventListener('unhandledrejection',onReject);

    const unsubs:Promise<()=>void>[]=[];
    unsubs.push(listen<any>('modeldock://pull-progress',e=>{const p=e.payload;if(p?.done)add(p.error?'error':'info',`Model pull ${p.error?'failed':'finished'}: ${p.model}${p.error?` — ${p.error}`:''}`)}));
    unsubs.push(listen<any>('modeldock://import-progress',e=>{const p=e.payload;if(p?.done)add(p.error?'error':'info',`GGUF import ${p.error?'failed':'finished'}: ${p.model}${p.error?` — ${p.error}`:''}`)}));

    let last='';
    const poll=async()=>{
      try{
        const r=await invoke<RuntimeDiscovery>('runtime_discovery'); setRuntime(r);
        const sig=`${r.bundledRunning}/${r.externalRunning}/${r.externalVersion||''}`;
        if(last&&sig!==last)add('info',`Runtime changed: bundled=${r.bundledRunning?'running':'stopped'}, external=${r.externalRunning?'running':'stopped'}`);
        last=sig;
      }catch(e){add('error',`Runtime discovery failed: ${String(e)}`)}
      try{setBench(JSON.parse(localStorage.getItem('modeldock-benchmarks')||'[]'))}catch{}
    };
    poll(); const timer=window.setInterval(poll,5000);
    return()=>{window.clearInterval(timer);window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onReject);unsubs.forEach(p=>p.then(f=>f()))};
  },[]);

  const usage=useMemo(()=>{
    const valid=bench.filter(b=>Number.isFinite(b.tokS));
    const avg=valid.length?valid.reduce((s,b)=>s+b.tokS,0)/valid.length:0;
    const models=new Set(valid.map(b=>b.model));
    return{runs:valid.length,models:models.size,avg};
  },[bench]);

  const copy=()=>navigator.clipboard.writeText(logs.map(l=>`${l.at} [${l.level.toUpperCase()}] ${l.message}`).join('\n'));
  const clear=()=>{setLogs([]);localStorage.removeItem(KEY)};

  return <>
    <button onClick={()=>setOpen(!open)} style={{position:'fixed',right:18,bottom:18,zIndex:9998,border:'1px solid #3a3d46',borderRadius:10,padding:'9px 13px',background:'#17191f',color:'#fff',fontWeight:700,cursor:'pointer'}}>Diagnostics</button>
    {open&&<div style={{position:'fixed',right:18,bottom:62,width:480,maxWidth:'calc(100vw - 36px)',height:560,maxHeight:'calc(100vh - 100px)',zIndex:9999,background:'#111318',border:'1px solid #343741',borderRadius:14,boxShadow:'0 18px 50px rgba(0,0,0,.45)',color:'#eef0f4',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{padding:'14px 16px',borderBottom:'1px solid #2a2d35',display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><b>Background Logs & Usage</b><div style={{fontSize:12,color:'#9ba1ad'}}>Local only · prompts and answers are not logged</div></div><button onClick={()=>setOpen(false)} style={{background:'transparent',color:'#fff',border:0,fontSize:20,cursor:'pointer'}}>×</button></div>
      <div style={{padding:14,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
        <div style={{background:'#1b1e25',padding:10,borderRadius:9}}><small>Sessions</small><div style={{fontSize:20,fontWeight:800}}>{sessions}</div></div>
        <div style={{background:'#1b1e25',padding:10,borderRadius:9}}><small>Bench runs</small><div style={{fontSize:20,fontWeight:800}}>{usage.runs}</div></div>
        <div style={{background:'#1b1e25',padding:10,borderRadius:9}}><small>Avg speed</small><div style={{fontSize:20,fontWeight:800}}>{usage.avg?`${usage.avg.toFixed(1)} tok/s`:'—'}</div></div>
      </div>
      <div style={{padding:'0 14px 12px',fontSize:12,color:'#aeb4bf'}}>Bundled: <b>{runtime?.bundledRunning?'running':'stopped'}</b> · External: <b>{runtime?.externalRunning?'running':'stopped'}</b>{runtime?.externalVersion?` · v${runtime.externalVersion}`:''} · Models benchmarked: <b>{usage.models}</b></div>
      <div style={{padding:'0 14px 10px',display:'flex',gap:8}}><button onClick={copy}>Copy logs</button><button onClick={clear}>Clear</button></div>
      <div style={{margin:'0 14px 14px',padding:10,border:'1px solid #2b2e36',borderRadius:9,overflow:'auto',flex:1,fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace',fontSize:11,lineHeight:1.5,background:'#0b0d11'}}>{logs.length?logs.slice().reverse().map((l,i)=><div key={`${l.at}-${i}`} style={{marginBottom:5,color:l.level==='error'?'#ff9b9b':l.level==='warn'?'#ffd48a':'#c5cad3'}}><span style={{color:'#777f8d'}}>{new Date(l.at).toLocaleTimeString()} </span>[{l.level}] {l.message}</div>):<div style={{color:'#777f8d'}}>No diagnostic events yet.</div>}</div>
    </div>}
  </>;
}
