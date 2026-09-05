import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {task} from './taskBus';
import './performance09.css';
type Mode='bundled'|'external';
type Model={name:string;size:number;details?:{parameter_size?:string;quantization_level?:string;family?:string}};
type Active={name:string;size_vram?:number;context_length?:number};
const GB=1024**3;
const fmt=(n=0)=>n?`${(n/GB).toFixed(n>10*GB?1:2)} GB`:'—';
const api=(mode:Mode,method:string,path:string,body?:unknown)=>invoke<any>('ollama_json',{mode,method,path,body:body??null});
function params(s=''){const m=s.toLowerCase().match(/([\d.]+)\s*b/);return m?Number(m[1]):0}
function plan(m:Model|undefined,memory:number){if(!m||!memory)return{recommended:4096,ceiling:8192,head:0};const usable=memory*.76,head=Math.max(0,usable-m.size*1.08),p=params(m.details?.parameter_size);const per=Math.max(32*1024,Math.min(360*1024,(p||4)*11*1024)),raw=Math.floor(head/per),levels=[4096,8192,16384,32768,65536,131072],ceiling=levels.filter(x=>x<=raw).pop()||4096,recommended=Math.min(ceiling,head>4*GB?32768:head>2*GB?16384:8192);return{recommended,ceiling,head}}
export default function RuntimeControl09({mode,memoryBytes}:{mode:Mode;memoryBytes:number}){
 const [models,setModels]=useState<Model[]>([]),[active,setActive]=useState<Active[]>([]),[target,setTarget]=useState(''),[ttl,setTtl]=useState('10m'),[busy,setBusy]=useState(''),[status,setStatus]=useState(''),[verified,setVerified]=useState('');
 async function refresh(){try{const[t,p]=await Promise.all([api(mode,'GET','/api/tags'),api(mode,'GET','/api/ps')]);const nextModels=t.models??[],nextActive=p.models??[];setModels(nextModels);setActive(nextActive);if(!target&&nextModels[0])setTarget(nextModels[0].name);return nextActive as Active[]}catch(e){setStatus(String(e));return null}}
 useEffect(()=>{refresh();const id=setInterval(()=>{if(!document.hidden)refresh()},4000);return()=>clearInterval(id)},[mode]);
 const m=models.find(x=>x.name===target),p=plan(m,memoryBytes),margin=memoryBytes?Math.max(0,p.head/memoryBytes*100):0;
 async function action(kind:'load'|'unload'){
  if(!target)return;const id=`runtime:${kind}:${target}`;setBusy(kind);setVerified('');
  task({id,title:`${kind==='load'?'Preload':'Unload'} ${target}`,source:'Runtime Control',detail:'Sending request to Ollama…',state:'running',percent:8,progressKind:'stage'});
  try{
   task({id,title:`${kind==='load'?'Preload':'Unload'} ${target}`,source:'Runtime Control',detail:kind==='load'?`Loading model · keep alive ${ttl}`:'Releasing model memory',state:'running',percent:38,progressKind:'stage'});
   await api(mode,'POST','/api/generate',{model:target,prompt:'',stream:false,keep_alive:kind==='unload'?0:ttl});
   task({id,title:`${kind==='load'?'Preload':'Unload'} ${target}`,source:'Runtime Control',detail:'Verifying /api/ps runtime state…',state:'running',percent:82,progressKind:'stage'});
   const ps=await api(mode,'GET','/api/ps'),next=(ps.models??[]) as Active[];setActive(next);
   const resident=next.some(x=>x.name===target||x.name.startsWith(`${target}:`));
   if(kind==='load'&&!resident)throw new Error('Preload request returned, but the model did not appear in /api/ps.');
   if(kind==='unload'&&resident)throw new Error('Unload request returned, but the model is still resident in /api/ps.');
   const msg=kind==='unload'?`${target} unload verified; model is no longer resident.`:`${target} preload verified; model is resident for ${ttl}.`;
   setStatus(msg);setVerified(kind);task({id,title:`${kind==='load'?'Preload':'Unload'} ${target}`,source:'Runtime Control',detail:msg,state:'done',percent:100,progressKind:'stage'});
  }catch(e){setStatus(String(e));task({id,title:`${kind==='load'?'Preload':'Unload'} ${target}`,source:'Runtime Control',detail:String(e),state:'failed',percent:100,progressKind:'stage'})}finally{setBusy('')}
 }
 return <div className="p09-grid"><section className="p09-card"><div className="p09-head"><div><span>RUNTIME CONTROL</span><h3>Load, keep alive, or release memory</h3></div><small>{active.length} resident</small></div><label>Model<select value={target} onChange={e=>{setTarget(e.target.value);setVerified('')}}>{models.map(x=><option key={x.name}>{x.name}</option>)}</select></label><label>Keep alive<select value={ttl} onChange={e=>setTtl(e.target.value)}><option value="1m">1 minute</option><option value="5m">5 minutes</option><option value="10m">10 minutes</option><option value="30m">30 minutes</option><option value="1h">1 hour</option></select></label><div className="p09-actions"><button disabled={!!busy} onClick={()=>action('load')}>{busy==='load'?'Loading…':'Preload'}</button><button disabled={!!busy} onClick={()=>action('unload')}>{busy==='unload'?'Unloading…':'Unload'}</button></div>{status&&<p className="p09-status">{verified?'✓ ':''}{status}</p>}<div className="p09-resident">{active.map(a=><div key={a.name}><b>{a.name}</b><span>{fmt(a.size_vram??0)} · {(a.context_length??0).toLocaleString()} ctx</span></div>)}</div></section><section className="p09-card"><div className="p09-head"><div><span>CONTEXT OPTIMIZER</span><h3>Conservative hardware-aware context</h3></div><small>{margin.toFixed(0)}% estimated headroom</small></div><div className="p09-context"><div><small>Recommended</small><b>{p.recommended.toLocaleString()}</b><span>tokens</span></div><div><small>Estimated ceiling</small><b>{p.ceiling.toLocaleString()}</b><span>tokens</span></div></div><div className="p09-meter"><i style={{width:`${Math.min(100,p.recommended/131072*100)}%`}}/></div><p>{fmt(p.head)} estimated headroom after model weights. This is a planning estimate; Observatory runtime measurements remain authoritative. Runtime Control now verifies preload/unload actions against live <code>/api/ps</code> state.</p></section></div>
}
