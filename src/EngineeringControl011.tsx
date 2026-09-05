import {useEffect,useMemo,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import './engineering-control011.css';

type Snapshot={
  os:string;arch:string;chip:string;totalMemoryBytes:number;estimatedAvailableMemoryBytes:number;
  memoryFreePercent?:number;swapUsedBytes:number;freeStorageBytes:number;logicalCores:number;
  thermalState:string;sensorQuality:string;
};
type Plan={
  status:string;requestedContext:number;recommendedContext:number;estimatedModelResidentBytes:number;
  estimatedKvCacheBytes:number;projectedTotalBytes:number;runtimeMemoryBudgetBytes:number;
  systemReserveBytes:number;keepAlive:string;unloadOtherModels:boolean;controlPolicy:string;reason:string;
};
type Check={id:string;label:string;status:string;detail:string;repairable:boolean};
type Doctor={ok:boolean;score:number;checks:Check[]};

const GB=1024**3;
const fmt=(n?:number)=>n==null?'—':`${(n/GB).toFixed(n>=10*GB?1:2)} GB`;
const ctx=(n?:number)=>!n?'—':n>=1024?`${Math.round(n/1024)}K`:`${n}`;

export default function EngineeringControl011(){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [doctor,setDoctor]=useState<Doctor|null>(null);
  const [plan,setPlan]=useState<Plan|null>(null);
  const [modelGb,setModelGb]=useState(4.7);
  const [requested,setRequested]=useState(16384);
  const [profile,setProfile]=useState('balanced');
  const [workload,setWorkload]=useState('coding');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function refresh(){
    setBusy(true);setError('');
    try{
      const [s,d]=await Promise.all([
        invoke<Snapshot>('adaptive_system_snapshot'),
        invoke<Doctor>('penguin_doctor')
      ]);
      setSnapshot(s);setDoctor(d);
    }catch(e){setError(String(e))}finally{setBusy(false)}
  }

  async function analyze(){
    setBusy(true);setError('');
    try{
      const p=await invoke<Plan>('adaptive_runtime_plan',{
        modelSizeBytes:Math.max(.25,modelGb)*GB,
        requestedContext:requested,
        workload,
        profile
      });
      setPlan(p);
    }catch(e){setError(String(e))}finally{setBusy(false)}
  }

  useEffect(()=>{refresh().then(()=>analyze())},[]);
  const pass=useMemo(()=>doctor?.checks.filter(x=>x.status==='pass').length??0,[doctor]);
  const warn=useMemo(()=>doctor?.checks.filter(x=>x.status==='warn').length??0,[doctor]);

  return <section className="eng011">
    <div className="eng011-head">
      <div><span>SYSTEM ENGINEERING CONTROL LOOP · 0.11</span><h3>Sense → Estimate → Decide → Verify</h3><p>OpenPenguin now treats local inference as a constrained engineering system: macOS telemetry becomes state estimates, the runtime planner applies a memory policy, and Penguin Doctor verifies the operating envelope.</p></div>
      <div className="eng011-score"><b>{doctor?.score??'—'}</b><span>Doctor score</span><small>{pass} pass · {warn} warning</small></div>
    </div>

    <div className="eng011-flow">
      <div><i>1</i><b>Sense</b><span>Unified memory · swap · storage · thermal</span></div>
      <div><i>2</i><b>Estimate</b><span>Model residency · KV cache · headroom</span></div>
      <div><i>3</i><b>Control</b><span>Context · keep-alive · unload policy</span></div>
      <div><i>4</i><b>Verify</b><span>Runtime · app data · service health</span></div>
    </div>

    <div className="eng011-grid">
      <article>
        <div className="eng011-title"><b>Hardware state</b><button onClick={refresh} disabled={busy}>Refresh</button></div>
        <dl>
          <div><dt>Chip</dt><dd>{snapshot?.chip??'—'}</dd></div>
          <div><dt>Unified memory</dt><dd>{fmt(snapshot?.totalMemoryBytes)}</dd></div>
          <div><dt>Estimated available</dt><dd>{fmt(snapshot?.estimatedAvailableMemoryBytes)}</dd></div>
          <div><dt>Swap used</dt><dd>{fmt(snapshot?.swapUsedBytes)}</dd></div>
          <div><dt>Memory free</dt><dd>{snapshot?.memoryFreePercent!=null?`${snapshot.memoryFreePercent.toFixed(0)}%`:'—'}</dd></div>
          <div><dt>Thermal</dt><dd>{snapshot?.thermalState??'—'}</dd></div>
        </dl>
      </article>

      <article>
        <div className="eng011-title"><b>Adaptive runtime planner</b><span className={`eng011-state ${plan?.status??''}`}>{plan?.status??'idle'}</span></div>
        <div className="eng011-form">
          <label>Model size <input type="number" min="0.25" step="0.1" value={modelGb} onChange={e=>setModelGb(Number(e.target.value)||0)}/><span>GB</span></label>
          <label>Context <select value={requested} onChange={e=>setRequested(Number(e.target.value))}>{[4096,8192,16384,32768,65536].map(n=><option value={n} key={n}>{ctx(n)}</option>)}</select></label>
          <label>Workload <select value={workload} onChange={e=>setWorkload(e.target.value)}><option value="general">General</option><option value="coding">Coding</option><option value="long-context">Long context</option><option value="research">Research</option></select></label>
          <label>Policy <select value={profile} onChange={e=>setProfile(e.target.value)}><option value="safe">Safe</option><option value="balanced">Balanced</option><option value="maximum">Maximum</option></select></label>
          <button onClick={analyze} disabled={busy}>Analyze operating point</button>
        </div>
        {plan&&<div className="eng011-plan">
          <span><small>Recommended context</small><b>{ctx(plan.recommendedContext)}</b></span>
          <span><small>Projected runtime</small><b>{fmt(plan.projectedTotalBytes)}</b></span>
          <span><small>Runtime budget</small><b>{fmt(plan.runtimeMemoryBudgetBytes)}</b></span>
          <span><small>Keep alive</small><b>{plan.keepAlive==='0'?'Unload':plan.keepAlive}</b></span>
          <p>{plan.reason}</p>
          {plan.unloadOtherModels&&<em>Memory Guard recommends unloading other models before launch.</em>}
        </div>}
      </article>
    </div>

    {doctor&&<div className="eng011-doctor">
      <div className="eng011-title"><b>Penguin Doctor</b><span>{doctor.ok?'Operating envelope valid':'Action recommended'}</span></div>
      <div className="eng011-checks">{doctor.checks.map(c=><div key={c.id} className={`eng011-check ${c.status}`}><i>{c.status==='pass'?'✓':c.status==='warn'?'!':'×'}</i><span><b>{c.label}</b><small>{c.detail}</small></span>{c.repairable&&c.status!=='pass'&&<em>repairable</em>}</div>)}</div>
    </div>}
    {error&&<div className="eng011-error">{error}</div>}
  </section>
}
