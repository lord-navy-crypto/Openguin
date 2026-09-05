import {useEffect,useMemo,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {TaskState,TaskUpdate} from './taskBus';
import {applyTaskUpdate,isTaskActive,taskOperationsSummary,taskQueueWaitMs,taskServiceMs,type OperationalTaskRow} from './taskOperations';
import './task-center.css';

type Row=OperationalTaskRow;
type PullEvent={model:string;status:string;percent?:number;done:boolean;cancelled:boolean;error?:string};
type ImportEvent={importId:string;repoId:string;filename:string;model:string;stage:string;status:string;percent?:number;done:boolean;cancelled:boolean;error?:string};
type Filter='all'|'active'|'issues';
const STALL_MS=15000;
const STORE='openguin-task-center-v2';
const now=()=>Date.now();
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
const elapsed=(ms:number)=>ms<1000?'0s':ms<60000?`${Math.floor(ms/1000)}s`:`${Math.floor(ms/60000)}m ${Math.floor(ms/1000)%60}s`;
const metric=(ms:number|null)=>ms==null?'—':elapsed(ms);
const isActive=(s:TaskState)=>isTaskActive(s);
function loadRows():Row[]{try{const raw=JSON.parse(localStorage.getItem(STORE)||'[]');if(!Array.isArray(raw))return[];return raw.slice(0,40).map((r:Row)=>{const base={...r,priority:r.priority??'normal',resourceClass:r.resourceClass??'unclassified',createdAt:r.createdAt||now(),updatedAt:r.updatedAt||now()} as Row;return isActive(base.state)?{...base,state:'stalled' as TaskState,detail:`${base.detail||'Task interrupted'} · restored after UI restart`,cancellable:false}:base})}catch{return[]}}

export default function TaskCenter(){
 const [rows,setRows]=useState<Row[]>(loadRows),[open,setOpen]=useState(true),[tick,setTick]=useState(0),[filter,setFilter]=useState<Filter>('all');
 function upsert(u:TaskUpdate){setRows(prev=>{const i=prev.findIndex(x=>x.id===u.id),t=now();if(i<0){const row=applyTaskUpdate(undefined,{...u,percent:u.percent===undefined?undefined:clamp(u.percent)},t);return[row,...prev].slice(0,40)}const next=[...prev],old=next[i];next[i]=applyTaskUpdate(old,{...u,percent:u.percent===undefined?old.percent:clamp(u.percent)},t);return next})}
 useEffect(()=>{localStorage.setItem(STORE,JSON.stringify(rows.slice(0,40)))},[rows]);
 useEffect(()=>{const h=(e:Event)=>upsert((e as CustomEvent<TaskUpdate>).detail);document.addEventListener('openguin:task',h);const uns:Promise<()=>void>[]=[];uns.push(listen<PullEvent>('modeldock://pull-progress',e=>{const p=e.payload;upsert({id:`pull:${p.model}`,title:`Install ${p.model}`,source:'Library',detail:p.error||p.status,state:p.cancelled?'cancelled':p.error?'failed':p.done?'done':'running',percent:p.done?100:p.percent,progressKind:'real',cancellable:!p.done&&!p.error&&!p.cancelled,cancelKind:'pull',cancelTarget:p.model,priority:'normal',resourceClass:'mixed'})}));uns.push(listen<ImportEvent>('modeldock://import-progress',e=>{const p=e.payload;upsert({id:`import:${p.importId}`,title:`Import ${p.model}`,source:'Hugging Face GGUF',detail:p.error||`${p.stage} · ${p.status}`,state:p.cancelled?'cancelled':p.error?'failed':p.done?'done':'running',percent:p.done?100:p.percent,progressKind:'real',cancellable:!p.done&&!p.error&&!p.cancelled,cancelKind:'import',cancelTarget:p.importId,priority:'normal',resourceClass:'mixed'})}));const interval=setInterval(()=>setTick(x=>x+1),1000);return()=>{document.removeEventListener('openguin:task',h);uns.forEach(x=>x.then(f=>f()));clearInterval(interval)}},[]);
 const normalized=useMemo(()=>rows.map(r=>r.state==='running'&&now()-r.updatedAt>STALL_MS?{...r,state:'stalled' as TaskState}:r),[rows,tick]);
 const active=normalized.filter(r=>isActive(r.state)),issues=normalized.filter(r=>r.state==='failed'||r.state==='stalled'),finished=normalized.filter(r=>!isActive(r.state));
 const shown=normalized.filter(r=>filter==='all'||filter==='active'&&isActive(r.state)||filter==='issues'&&(r.state==='failed'||r.state==='stalled'));
 const ops=useMemo(()=>taskOperationsSummary(normalized),[normalized]);
 const activeClasses=Object.entries(ops.activeByClass).filter(([,count])=>count>0);
 function dismiss(id:string){setRows(v=>v.filter(r=>r.id!==id))}
 async function cancelOrDismiss(r:Row){
  const activeState=isActive(r.state);
  const canBackendCancel=activeState&&r.cancellable&&r.cancelKind&&r.cancelTarget;
  if(!canBackendCancel){dismiss(r.id);return}
  try{
   if(r.cancelKind==='pull')await invoke('cancel_pull',{model:r.cancelTarget});else await invoke('cancel_hf_import',{importId:r.cancelTarget});
   upsert({...r,state:'cancelled',detail:'Cancellation requested',percent:r.percent,cancellable:false});
  }catch(e){upsert({...r,state:'failed',detail:`Cancel failed: ${e}`,cancellable:false})}
 }
 function clearFinished(){setRows(v=>v.filter(r=>isActive(r.state)))}
 function clearIssues(){setRows(v=>v.filter(r=>r.state!=='failed'&&r.state!=='stalled'))}
 return <div className={`task-center ${open?'open':'closed'}`}><button className="task-toggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}><span className={issues.length?'issue':active.length?'pulse':''}/><b>Tasks</b><em>{active.length}</em></button>{open&&<section className="task-panel"><header><div><b>Activity</b><small>{active.length?`${active.length} active · ${issues.length} issue${issues.length===1?'':'s'}`:issues.length?`${issues.length} issue${issues.length===1?'':'s'} need attention`:'All tasks complete'}</small></div><div className="task-head-actions"><button onClick={clearIssues} disabled={!issues.length}>Clear issues</button><button onClick={clearFinished} disabled={!finished.length}>Clear finished</button></div></header><div className="task-filters"><button className={filter==='all'?'on':''} onClick={()=>setFilter('all')}>All {normalized.length}</button><button className={filter==='active'?'on':''} onClick={()=>setFilter('active')}>Active {active.length}</button><button className={filter==='issues'?'on':''} onClick={()=>setFilter('issues')}>Issues {issues.length}</button></div><section className="task-ops"><div className="task-ops-head"><div><span>OPERATIONS OBSERVATORY</span><b>Queue / service evidence</b></div><em>observational only · no automatic scheduler</em></div><div className="task-ops-grid"><div><small>Queued now</small><b>{ops.queued}</b><span>explicit queued state</span></div><div><small>Running now</small><b>{ops.running}</b><span>{ops.stalled} stalled</span></div><div><small>Median queue wait</small><b>{metric(ops.queueWaitMedianMs)}</b><span>{ops.queueWaitSamples} measured transition{ops.queueWaitSamples===1?'':'s'}</span></div><div><small>Median service time</small><b>{metric(ops.serviceMedianMs)}</b><span>{ops.serviceSamples} completed sample{ops.serviceSamples===1?'':'s'}</span></div><div><small>Classified active</small><b>{ops.classifiedActive}/{ops.active}</b><span>{activeClasses.length?activeClasses.map(([name,count])=>`${name} ${count}`).join(' · '):'no classified active tasks'}</span></div></div><p>Queue wait is reported only when OpenPenguin actually observes <code>queued → running</code>. Service time is reported only when it observes <code>running → terminal</code>. Tasks that begin directly in running state do not receive a fabricated zero queue wait.</p></section><div className="task-list">{shown.length?shown.map(r=>{const activeState=isActive(r.state);const realCancel=activeState&&r.cancellable&&r.cancelKind&&r.cancelTarget;const wait=taskQueueWaitMs(r),service=taskServiceMs(r);return <article key={r.id} className={`task-row ${r.state}`}><div className="task-top"><div><b>{r.title}</b><small>{r.source||'Openguin'} · {r.priority} priority · {r.resourceClass} · {elapsed(now()-r.createdAt)}</small></div><span>{r.state}</span></div><div className="task-detail" title={r.detail||'Working…'}>{r.detail||'Working…'}</div><div className={`task-progress ${r.progressKind==='indeterminate'?'indeterminate':''}`}><i style={r.percent===undefined?undefined:{width:`${r.percent}%`}}/></div><div className="task-bottom"><small>{r.progressKind==='real'?'Measured progress':r.progressKind==='stage'?'Stage progress':'Waiting for progress data'}{r.state==='stalled'?' · no update for 15s':''}{wait!=null?` · queue ${metric(wait)}`:''}{service!=null?` · service ${metric(service)}`:''}{r.state==='queued'&&r.queuedAt!=null?` · waiting ${elapsed(now()-r.queuedAt)}`:''}</small><div>{r.percent!==undefined&&<b>{Math.round(r.percent)}%</b>}<button onClick={()=>cancelOrDismiss(r)}>{realCancel?'Cancel':activeState?'Dismiss':'Remove'}</button></div></div></article>}):<div className="task-empty">{filter==='issues'?'No stalled or failed tasks.':filter==='active'?'No active tasks.':'No tasks yet. Long-running actions will appear here as soon as you click them.'}</div>}</div></section>}</div>
}
