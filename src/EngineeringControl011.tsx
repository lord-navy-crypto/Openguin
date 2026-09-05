import {useEffect,useMemo,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import './engineering-control011.css';
import {ENGINEERING_CALIBRATION_EVENT,ENGINEERING_CALIBRATION_KEY,loadEngineeringCalibration,type EngineeringCalibration} from './engineeringTelemetry011';

type Profile={os:string;arch:string;chip:string;memoryBytes:number;logicalCores:number;freeStorageBytes:number};
type Runtime={bundledAvailable:boolean;bundledRunning:boolean;externalInstalled:boolean;externalRunning:boolean;externalPath?:string;externalVersion?:string;recommendedMode:'bundled'|'external';reason:string};
type Check={id:string;label:string;status:'pass'|'warn'|'fail';detail:string;repairable:boolean};
type Plan={status:'safe'|'balanced'|'constrained';requestedContext:number;recommendedContext:number;resident:number;kv:number;projected:number;budget:number;reserve:number;keepAlive:string;unloadOtherModels:boolean;reason:string};
type EnvelopeState='safe'|'constrained'|'outside';

const GB=1024**3;
const MB=1024**2;
const fmt=(n?:number)=>n==null?'—':`${(n/GB).toFixed(n>=10*GB?1:2)} GB`;
const ctx=(n?:number)=>!n?'—':n>=1024?`${Math.round(n/1024)}K`:`${n}`;
const envelopeFootprints=[2,4,7,10,14];
const envelopeContexts=[65536,32768,16384,8192,4096];

function projected(size:number,context:number){
  const resident=size*1.18+.25*GB;
  const kv=Math.max(size*.10,384*MB)*(Math.max(context,1024)/8192);
  return {resident,kv,total:resident+kv+384*MB};
}

function memoryBudget(memory:number,policy:string){
  const total=Math.max(memory,8*GB),reserve=Math.max(total*.25,3*GB),raw=total-reserve;
  const ratio=policy==='safe'?.82:policy==='maximum'?.96:.90;
  return {total,reserve,ratio,budget:raw*ratio};
}

function envelopeState(memory:number,modelGb:number,context:number,policy:string):EnvelopeState{
  const {budget}=memoryBudget(memory,policy);
  const load=projected(Math.max(.25,modelGb)*GB,context).total/budget;
  return load<=.70?'safe':load<=1?'constrained':'outside';
}

function runtimePlan(memory:number,modelGb:number,requested:number,profile:string,workload:string):Plan{
  const {reserve,ratio,budget}=memoryBudget(memory,profile);
  const size=Math.max(.25,modelGb)*GB;
  const target=workload==='research'||workload==='long-context'?32768:workload==='coding'?16384:8192;
  const req=requested||target;
  let recommended=2048;
  for(const c of [2048,4096,8192,16384,32768,65536])if(projected(size,c).total<=budget)recommended=c;
  const chosen=projected(size,req).total<=budget?req:recommended;
  const p=projected(size,chosen);
  const unload=p.total>budget*.78;
  const status=p.total<=budget*.70?'safe':p.total<=budget?'balanced':'constrained';
  return {status,requestedContext:req,recommendedContext:chosen,resident:p.resident,kv:p.kv,projected:p.total,budget,reserve,keepAlive:unload?'0':profile==='safe'?'2m':'5m',unloadOtherModels:unload,reason:`Heuristic controller reserves ${fmt(reserve)} for macOS, then keeps estimated model residency + KV cache inside a ${Math.round(ratio*100)}% runtime budget. If the requested context does not fit, it automatically recommends a smaller operating point.`};
}

function doctor(profile:Profile|null,runtime:Runtime|null):{score:number;ok:boolean;checks:Check[]}{
  const checks:Check[]=[];
  if(profile){
    checks.push({id:'platform',label:'macOS platform',status:profile.os==='macos'?'pass':'fail',detail:`${profile.os} / ${profile.arch}`,repairable:false});
    checks.push({id:'silicon',label:'Apple Silicon path',status:profile.arch==='aarch64'?'pass':'warn',detail:profile.arch==='aarch64'?'Native arm64 path detected.':'Non-arm64 path detected; acceleration assumptions need review.',repairable:false});
    checks.push({id:'memory',label:'Unified memory envelope',status:profile.memoryBytes>=16*GB?'pass':profile.memoryBytes>=8*GB?'warn':'fail',detail:`${fmt(profile.memoryBytes)} total memory`,repairable:false});
    checks.push({id:'storage',label:'Model storage headroom',status:profile.freeStorageBytes>=15*GB?'pass':profile.freeStorageBytes>=6*GB?'warn':'fail',detail:`${fmt(profile.freeStorageBytes)} free storage`,repairable:true});
  }
  if(runtime){
    checks.push({id:'private-runtime',label:'Private Ollama runtime',status:runtime.bundledAvailable?'pass':'warn',detail:runtime.bundledAvailable?'Private runtime is available.':'Private runtime can be installed/repaired from Overview.',repairable:true});
    checks.push({id:'engine',label:'Inference service',status:runtime.bundledRunning||runtime.externalRunning?'pass':'warn',detail:runtime.bundledRunning?'Private runtime is running on OpenPenguin.':runtime.externalRunning?'External Ollama service is running.':'No local inference service is currently running.',repairable:true});
  }
  const weighted=checks.reduce((s,c)=>s+(c.status==='pass'?1:c.status==='warn'?.5:0),0);
  const score=checks.length?Math.round(weighted/checks.length*100):0;
  return {score,ok:checks.every(c=>c.status!=='fail'),checks};
}

export default function EngineeringControl011(){
  const [open,setOpen]=useState(false);
  const [machine,setMachine]=useState<Profile|null>(null);
  const [runtime,setRuntime]=useState<Runtime|null>(null);
  const [calibration,setCalibration]=useState<EngineeringCalibration|null>(()=>loadEngineeringCalibration());
  const [modelGb,setModelGb]=useState(4.7);
  const [requested,setRequested]=useState(16384);
  const [profile,setProfile]=useState('balanced');
  const [workload,setWorkload]=useState('coding');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    const update=(event:Event)=>{const value=(event as CustomEvent<EngineeringCalibration>).detail;if(value)setCalibration(value)};
    const storage=(event:StorageEvent)=>{if(event.key===ENGINEERING_CALIBRATION_KEY)setCalibration(loadEngineeringCalibration())};
    window.addEventListener(ENGINEERING_CALIBRATION_EVENT,update);
    window.addEventListener('storage',storage);
    return()=>{window.removeEventListener(ENGINEERING_CALIBRATION_EVENT,update);window.removeEventListener('storage',storage)};
  },[]);

  async function refresh(){
    setBusy(true);setError('');
    try{
      const [p,r]=await Promise.all([invoke<Profile>('system_profile'),invoke<Runtime>('runtime_discovery')]);
      setMachine(p);setRuntime(r);setCalibration(loadEngineeringCalibration());
    }catch(e){setError(String(e))}finally{setBusy(false)}
  }

  async function toggle(){
    const next=!open;setOpen(next);
    if(next&&!machine)await refresh();
  }

  const report=useMemo(()=>doctor(machine,runtime),[machine,runtime]);
  const memory=machine?.memoryBytes??16*GB;
  const plan=useMemo(()=>runtimePlan(memory,modelGb,requested,profile,workload),[memory,modelGb,requested,profile,workload]);
  const pass=report.checks.filter(x=>x.status==='pass').length;
  const warn=report.checks.filter(x=>x.status==='warn').length;
  const controlMargin=Math.round(Math.max(-100,Math.min(100,(plan.budget-plan.projected)/Math.max(plan.budget,1)*100)));
  const calibratedResident=calibration?Math.max(.25,modelGb)*GB*calibration.residencyFactor:null;
  const calibratedProjected=calibratedResident==null?null:calibratedResident+Math.max(0,plan.projected-plan.resident);
  const calibrationDelta=calibratedProjected==null?null:(calibratedProjected-plan.projected)/Math.max(plan.projected,1)*100;
  const calibrationAge=calibration?Math.max(0,Date.now()-new Date(calibration.at).getTime()):null;
  const calibrationFresh=calibrationAge!=null&&calibrationAge<30*60*1000;
  const calibrationContext=calibration?.contexts.length?Math.max(...calibration.contexts):0;

  return <div className={`eng011-host ${open?'open':''}`}>
    <button className="eng011-launch" onClick={toggle}><span>ENG</span><b>Engineering</b><i>{report.score||'0'}</i></button>
    {open&&<section className="eng011">
      <div className="eng011-head">
        <div><span>SYSTEM ENGINEERING CONTROL LOOP · 0.11</span><h3>Sense → Estimate → Decide → Verify</h3><p>OpenPenguin treats local inference as a constrained engineering system: machine data becomes a state estimate, the runtime planner applies a memory policy, and Observatory measurements close the feedback loop without enabling unvalidated automatic control.</p></div>
        <div className="eng011-head-actions"><button onClick={refresh} disabled={busy}>{busy?'Reading…':'Refresh sensors'}</button><button onClick={()=>setOpen(false)}>Close</button></div>
      </div>

      <div className="eng011-flow">
        <div><i>1</i><b>Sense</b><span>Chip · unified memory · storage · runtime</span></div>
        <div><i>2</i><b>Estimate</b><span>Model residency · KV cache · headroom</span></div>
        <div><i>3</i><b>Control</b><span>Context · keep-alive · unload policy</span></div>
        <div><i>4</i><b>Verify</b><span>Observatory measurement · runtime health</span></div>
      </div>

      <div className="eng011-grid">
        <article>
          <div className="eng011-title"><b>Hardware state</b><span>{machine?.arch??'detecting'}</span></div>
          <dl>
            <div><dt>Chip</dt><dd>{machine?.chip??'—'}</dd></div>
            <div><dt>Unified memory</dt><dd>{fmt(machine?.memoryBytes)}</dd></div>
            <div><dt>Free storage</dt><dd>{fmt(machine?.freeStorageBytes)}</dd></div>
            <div><dt>Logical cores</dt><dd>{machine?.logicalCores??'—'}</dd></div>
            <div><dt>Runtime</dt><dd>{runtime?.bundledRunning?'Private running':runtime?.externalRunning?'External running':runtime?.bundledAvailable?'Private ready':'Offline'}</dd></div>
            <div><dt>Recommended engine</dt><dd>{runtime?.recommendedMode??'—'}</dd></div>
          </dl>
        </article>

        <article>
          <div className="eng011-title"><b>Adaptive runtime planner</b><span className={`eng011-state ${plan.status}`}>{plan.status}</span></div>
          <div className="eng011-form">
            <label>Model size <input type="number" min="0.25" step="0.1" value={modelGb} onChange={e=>setModelGb(Number(e.target.value)||0)}/><span>GB</span></label>
            <label>Context <select value={requested} onChange={e=>setRequested(Number(e.target.value))}>{[4096,8192,16384,32768,65536].map(n=><option value={n} key={n}>{ctx(n)}</option>)}</select></label>
            <label>Workload <select value={workload} onChange={e=>setWorkload(e.target.value)}><option value="general">General</option><option value="coding">Coding</option><option value="long-context">Long context</option><option value="research">Research</option></select></label>
            <label>Policy <select value={profile} onChange={e=>setProfile(e.target.value)}><option value="safe">Safe</option><option value="balanced">Balanced</option><option value="maximum">Maximum</option></select></label>
          </div>
          <div className="eng011-plan">
            <span><small>Recommended context</small><b>{ctx(plan.recommendedContext)}</b></span>
            <span><small>Projected runtime</small><b>{fmt(plan.projected)}</b></span>
            <span><small>Runtime budget</small><b>{fmt(plan.budget)}</b></span>
            <span><small>Control margin</small><b>{controlMargin}%</b></span>
            <p>{plan.reason}</p>
            {plan.unloadOtherModels&&<em>Memory Guard recommends unloading other models before launch. Keep-alive policy: {plan.keepAlive==='0'?'unload immediately':plan.keepAlive}.</em>}
          </div>
        </article>
      </div>

      <div className="eng011-calibration">
        <div className="eng011-title"><div><b>Plan vs Measured</b><small>Observatory feedback · advisory calibration only</small></div><span>{calibration?`${calibrationFresh?'fresh':'stale'} · ${calibration.mode}`:'waiting for measurement'}</span></div>
        {calibration?<>
          <div className="eng011-cal-grid">
            <span><small>Heuristic projection</small><b>{fmt(plan.projected)}</b></span>
            <span><small>Latest measured runtime</small><b>{fmt(calibration.runtimeBytes)}</b></span>
            <span><small>Observed residency factor</small><b>{calibration.residencyFactor.toFixed(2)}×</b></span>
            <span><small>Calibrated projection</small><b>{fmt(calibratedProjected??undefined)}</b></span>
            <span><small>Observed memory pressure</small><b>{calibration.memoryPressurePct.toFixed(0)}%</b></span>
            <span><small>Measured model footprint</small><b>{fmt(calibration.modelBytes)}</b></span>
            <span><small>Loaded models</small><b>{calibration.loadedModels}</b></span>
            <span><small>Largest measured context</small><b>{ctx(calibrationContext)}</b></span>
          </div>
          <p>Latest `/api/ps` snapshot: {new Date(calibration.at).toLocaleTimeString()}. Applying its residency factor to the current planner input changes the projection by <b>{calibrationDelta==null?'—':`${calibrationDelta>=0?'+':''}${calibrationDelta.toFixed(1)}%`}</b>. This does not automatically change the controller because the measured snapshot may represent a different model or context.</p>
        </>:<p>Load a model and open Observatory to capture a real runtime-residency snapshot. Engineering will then compare the heuristic with measured allocation while keeping control decisions advisory.</p>}
      </div>

      <div className="eng011-envelope">
        <div className="eng011-title"><div><b>Operating Envelope</b><small>Estimated model footprint × context on this Mac · click a cell to load that operating point</small></div><span>{profile} policy</span></div>
        <div className="eng011-envelope-scroll">
          <div className="eng011-matrix" style={{gridTemplateColumns:`72px repeat(${envelopeFootprints.length},minmax(82px,1fr))`}}>
            <div className="axis corner">Context</div>{envelopeFootprints.map(g=><div className="axis" key={`h-${g}`}>{g} GB</div>)}
            {envelopeContexts.map(c=><div className="eng011-matrix-row" key={c} style={{display:'contents'}}><div className="axis">{ctx(c)}</div>{envelopeFootprints.map(g=>{const state=envelopeState(memory,g,c,profile);return <button key={`${c}-${g}`} className={`env-cell ${state} ${requested===c&&Math.abs(modelGb-g)<.01?'selected':''}`} onClick={()=>{setRequested(c);setModelGb(g)}} aria-label={`${g} GB at ${ctx(c)} context: ${state}`}><b>{state==='safe'?'SAFE':state==='constrained'?'TIGHT':'OUT'}</b><small>{Math.round(projected(g*GB,c).total/GB*10)/10} GB</small></button>})}</div>)}
          </div>
        </div>
        <div className="eng011-legend"><span><i className="safe"/>Safe</span><span><i className="constrained"/>Constrained</span><span><i className="outside"/>Outside recommended envelope</span><em>Engineering estimate, not a benchmark. Plan-vs-Measured uses Observatory snapshots for calibration but does not silently actuate runtime settings.</em></div>
      </div>

      <div className="eng011-doctor">
        <div className="eng011-title"><b>Penguin Doctor · {report.score}/100</b><span>{pass} pass · {warn} warning</span></div>
        <div className="eng011-checks">{report.checks.map(c=><div key={c.id} className={`eng011-check ${c.status}`}><i>{c.status==='pass'?'✓':c.status==='warn'?'!':'×'}</i><span><b>{c.label}</b><small>{c.detail}</small></span>{c.repairable&&c.status!=='pass'&&<em>repairable</em>}</div>)}</div>
      </div>
      {error&&<div className="eng011-error">{error}</div>}
    </section>}
  </div>
}
