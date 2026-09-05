import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './observatory.css';
import RuntimeControl09 from './RuntimeControl09';
import CompareBench09 from './CompareBench09';

// OPENGUIN_011_STATIC_OBSERVATORY

type Mode='bundled'|'external';
type ActiveModel={name:string;model?:string;size:number;size_vram?:number;context_length?:number;expires_at?:string;details?:{parameter_size?:string;quantization_level?:string;family?:string}};
type Bench={at:string;model:string;ctx:number;temperature:number;tokS:number;tokens:number;mode:Mode;thinking:boolean;loadMs?:number;promptMs?:number;decodeMs?:number;promptTokens?:number;doneReason?:string};
type Props={mode:Mode;memoryBytes:number;installedCount:number;online:boolean};
const GB=1024**3;
const fmt=(n=0)=>n?`${(n/GB).toFixed(n>=10*GB?1:2)} GB`:'—';
const pct=(a=0,b=1)=>Math.max(0,Math.min(100,b?100*a/b:0));
function readBench():Bench[]{for(const key of ['openguin-benchmarks','modeldock-benchmarks']){try{const v=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(v)&&v.length)return v}catch{}}return[]}
function variation(values:number[]){if(values.length<2)return 0;const mean=values.reduce((a,b)=>a+b,0)/values.length;if(!mean)return 0;const variance=values.reduce((s,v)=>s+(v-mean)**2,0)/(values.length-1);return Math.sqrt(variance)/mean*100}

export default function Observatory({mode,memoryBytes,installedCount,online}:Props){
 const [active,setActive]=useState<ActiveModel[]>([]),[error,setError]=useState(''),[updated,setUpdated]=useState<Date|null>(null),[live,setLive]=useState(true),[benchTick,setBenchTick]=useState(0);
 const bench=useMemo(()=>readBench(),[benchTick]);
 async function refresh(){try{const r=await invoke<any>('ollama_json',{mode,method:'GET',path:'/api/ps',body:null});setActive(r.models??[]);setError('');setUpdated(new Date());setBenchTick(x=>x+1)}catch(e){setActive([]);setError(String(e));}}
 useEffect(()=>{refresh();if(!live)return;const id=setInterval(refresh,2000);return()=>clearInterval(id)},[mode,live]);
 const totalVram=active.reduce((s,m)=>s+(m.size_vram??0),0),baseSize=active.reduce((s,m)=>s+(m.size??0),0),latest=bench[0],recent=[...bench].slice(0,20).reverse();
 const avg=bench.length?bench.reduce((s,b)=>s+(b.tokS||0),0)/bench.length:0,pressure=pct(totalVram,memoryBytes),residencyFactor=baseSize?totalVram/baseSize:0;
 const recentSpeeds=bench.slice(0,10).map(b=>b.tokS).filter(v=>v>0),cv=variation(recentSpeeds);
 const health=error||!online?'fault':pressure>=78?'high':pressure>=62?'watch':'good';
 const healthText=health==='fault'?'Telemetry/runtime attention needed':health==='high'?'Memory pressure risk':health==='watch'?'Reduced memory headroom':'Operating envelope healthy';
 return <div className="obs-page">
  <section className="obs-hero"><div><span>LIVE RUNTIME OBSERVATORY</span><h2>See what local AI is actually doing.</h2><p>Real Ollama process data, allocated context, runtime memory and measured inference history — refreshed locally without telemetry upload.</p></div><div className="obs-live"><i className={online?'on':''}/><b>{online?'ENGINE ONLINE':'ENGINE OFFLINE'}</b><small>{mode==='bundled'?'Openguin private runtime · :11435':'Existing Ollama · :11434'}</small></div></section>
  <div className="obs-kpis"><Kpi label="Loaded now" value={String(active.length)} sub={`${installedCount} installed`}/><Kpi label="Runtime memory" value={fmt(totalVram)} sub={`${pressure.toFixed(0)}% of system memory`}/><Kpi label="Average decode" value={avg?`${avg.toFixed(1)} tok/s`:'—'} sub={`${bench.length} measured runs`}/><Kpi label="Last refresh" value={updated?updated.toLocaleTimeString():'—'} sub={live?'Live · every 2s':'Paused'}/></div>
  <section className={`obs-health ${health}`}><div><span>SYSTEM HEALTH</span><b>{healthText}</b><small>{pressure.toFixed(0)}% runtime allocation · {Math.max(0,100-pressure).toFixed(0)}% raw memory headroom</small></div><div className="obs-health-signals"><Health label="Residency factor" value={residencyFactor?`${residencyFactor.toFixed(2)}×`:'—'} note="measured allocation ÷ model size" state={residencyFactor>1.35?'watch':'good'}/><Health label="Decode variation" value={recentSpeeds.length>1?`${cv.toFixed(1)}%`:'—'} note="CV across last 10 runs" state={cv>20?'watch':'good'}/><Health label="Telemetry" value={error?'Fault':live?'Live':'Paused'} note={error?'runtime query failed':live?'2 s cadence':'manual refresh'} state={error?'fault':'good'}/></div></section>
  {error&&<div className="obs-error">Runtime telemetry unavailable: {error}</div>}
  <div className="obs-two">
   <section className="obs-card"><div className="obs-head"><div><h3>Loaded models</h3><p>Backed by Ollama <code>/api/ps</code>.</p></div><div className="obs-actions"><button onClick={()=>setLive(v=>!v)}>{live?'Pause':'Resume'}</button><button onClick={refresh}>Refresh</button></div></div>{active.length?active.map(m=><Active key={m.name} m={m} memory={memoryBytes}/>):<div className="obs-empty">No model is currently resident in memory. Run a prompt in Model Lab to load one.</div>}</section>
   <section className="obs-card"><h3>Runtime memory map</h3><p className="obs-muted">Loaded model memory compared with unified/system memory.</p><div className="memory-donut" style={{'--p':`${pressure}%`} as React.CSSProperties}><div><b>{pressure.toFixed(0)}%</b><span>allocated</span></div></div><div className="memory-legend"><span><i/>Models <b>{fmt(totalVram)}</b></span><span><i/>Available headroom <b>{fmt(Math.max(0,memoryBytes-totalVram))}</b></span></div><p className="obs-note">On Apple Silicon, CPU and GPU share unified memory. Residency factor is therefore measured against Ollama's allocation instead of pretending there is separate VRAM; it can later calibrate the Engineering operating-envelope estimator.</p></section>
  </div>
  <div className="obs-two">
   <section className="obs-card"><h3>Decode performance trend</h3><p className="obs-muted">Measured output-token throughput from recent Model Lab runs. Variation above ~20% is flagged as a stability signal, not automatically treated as a fault.</p><Spark rows={recent}/><div className="trend-footer"><span>slowest <b>{bench.length?Math.min(...bench.map(b=>b.tokS)).toFixed(1):'—'}</b></span><span>average <b>{avg?avg.toFixed(1):'—'}</b></span><span>fastest <b>{bench.length?Math.max(...bench.map(b=>b.tokS)).toFixed(1):'—'}</b> tok/s</span></div></section>
   <section className="obs-card"><h3>Last generation pipeline</h3><p className="obs-muted">Load → prompt prefill → token decode. Values appear after a telemetry-enabled run.</p>{latest?<Pipeline b={latest}/>:<div className="obs-empty">No benchmark telemetry yet.</div>}</section>
  </div>
  <RuntimeControl09 mode={mode} memoryBytes={memoryBytes}/>
  <CompareBench09 mode={mode}/>
  <section className="obs-card"><h3>Context residency</h3><p className="obs-muted">Actual context allocated to every model currently loaded by Ollama.</p><div className="ctx-grid">{active.map(m=><div className="ctx-item" key={m.name}><div><b>{m.name}</b><span>{m.details?.quantization_level||'quantization unknown'}</span></div><strong>{(m.context_length??0).toLocaleString()}</strong><small>tokens allocated</small><div className="ctx-scale"><i style={{width:`${Math.min(100,(m.context_length??0)/131072*100)}%`}}/></div></div>)}{!active.length&&<div className="obs-empty">Context allocation appears when a model is loaded.</div>}</div></section>
 </div>
}

function Kpi({label,value,sub}:{label:string,value:string,sub:string}){return <div className="obs-kpi"><span>{label}</span><b>{value}</b><small>{sub}</small></div>}
function Health({label,value,note,state}:{label:string,value:string,note:string,state:'good'|'watch'|'fault'}){return <div className={`obs-health-signal ${state}`}><span>{label}</span><b>{value}</b><small>{note}</small></div>}
function Active({m,memory}:{m:ActiveModel,memory:number}){const v=m.size_vram??0,share=pct(v,memory);let until='resident';if(m.expires_at){const d=new Date(m.expires_at).getTime()-Date.now();until=d>0?`${Math.max(1,Math.round(d/60000))} min keep-alive`:'expiring'}return <div className="active-model"><div className="active-top"><div><b>{m.name}</b><span>{m.details?.parameter_size||'?'} · {m.details?.quantization_level||'?'} · {m.details?.family||'unknown family'}</span></div><strong>{fmt(v)}</strong></div><div className="active-bar"><i style={{width:`${share}%`}}/></div><div className="active-meta"><span>{share.toFixed(1)}% of memory</span><span>{(m.context_length??0).toLocaleString()} ctx</span><span>{until}</span></div></div>}
function Spark({rows}:{rows:Bench[]}){if(rows.length<2)return <div className="obs-empty">Run at least two Model Lab generations to draw a trend.</div>;const vals=rows.map(r=>r.tokS||0),max=Math.max(...vals,1),min=Math.min(...vals),span=Math.max(1,max-min),w=640,h=170,p=14;const points=vals.map((v,i)=>`${p+i*(w-2*p)/Math.max(1,vals.length-1)},${h-p-(v-min)/span*(h-2*p)}`).join(' ');return <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Recent decode tokens per second trend"><line x1="14" y1="156" x2="626" y2="156"/><polyline points={points}/>{vals.map((v,i)=><circle key={i} cx={p+i*(w-2*p)/Math.max(1,vals.length-1)} cy={h-p-(v-min)/span*(h-2*p)} r="3"><title>{rows[i].model}: {v.toFixed(1)} tok/s</title></circle>)}</svg>}
function Pipeline({b}:{b:Bench}){const load=b.loadMs??0,prompt=b.promptMs??0,decode=b.decodeMs??0,total=Math.max(1,load+prompt+decode);return <div className="pipeline"><div className="pipe"><i style={{width:`${load/total*100}%`}}/><i style={{width:`${prompt/total*100}%`}}/><i style={{width:`${decode/total*100}%`}}/></div><div className="pipe-legend"><span><i/>Load <b>{load?`${load.toFixed(0)} ms`:'—'}</b></span><span><i/>Prefill <b>{prompt?`${prompt.toFixed(0)} ms`:'—'}</b></span><span><i/>Decode <b>{decode?`${decode.toFixed(0)} ms`:'—'}</b></span></div><div className="pipe-stats"><span>Input <b>{b.promptTokens??'—'} tokens</b></span><span>Output <b>{b.tokens} tokens</b></span><span>Stop <b>{b.doneReason||'—'}</b></span><span>Context <b>{b.ctx.toLocaleString()}</b></span></div></div>}
