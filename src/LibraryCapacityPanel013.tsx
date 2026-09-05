import type {LibraryPolicy013,LibraryVariantPlan013} from './libraryResourcePolicy013';
import './library-capacity013.css';

type Row={id:string;label:string;quantization?:string;sizeBytes?:number;plan:LibraryVariantPlan013};
type Props={
  chip:string;
  memoryBytes:number;
  freeStorageBytes:number;
  installedCount:number;
  installedBytes:number;
  context:number;
  policy:LibraryPolicy013;
  reserveGb:number;
  rows:Row[];
  onContext:(value:number)=>void;
  onPolicy:(value:LibraryPolicy013)=>void;
  onReserve:(value:number)=>void;
  onRefresh:()=>void;
  refreshing:boolean;
};
const GB=1024**3;
const fmt=(n?:number|null)=>n==null?'—':`${(n/GB).toFixed(n>=10*GB?1:2)} GB`;
const stateLabel=(s:LibraryVariantPlan013['state'])=>s==='feasible'?'FEASIBLE':s==='runtime-constrained'?'RUNTIME LIMIT':s==='storage-constrained'?'STORAGE LIMIT':s==='both-constrained'?'BOTH LIMITED':'UNKNOWN';

export default function LibraryCapacityPanel013(p:Props){
  const feasible=p.rows.filter(r=>r.plan.state==='feasible'),storageBlocked=p.rows.filter(r=>!r.plan.canInstall&&r.plan.state!=='unknown'),runtimeBlocked=p.rows.filter(r=>!r.plan.canRun&&r.plan.state!=='unknown');
  const largest=[...feasible].sort((a,b)=>(b.sizeBytes??0)-(a.sizeBytes??0))[0];
  return <section className="lc13">
    <div className="lc13-head"><div><span>GLOBAL LIBRARY ULTRA · 0.13</span><h4>Capacity planning</h4><p>Separate download feasibility from runtime feasibility. Storage reserve, peak import headroom and the validated 0.11 memory envelope remain explicit constraints.</p></div><button onClick={p.onRefresh} disabled={p.refreshing}>{p.refreshing?'Reading…':'Refresh capacity'}</button></div>
    <div className="lc13-kpis"><div><small>Machine</small><b>{p.chip||'Mac'}</b><span>{fmt(p.memoryBytes)} memory</span></div><div><small>Free storage</small><b>{fmt(p.freeStorageBytes)}</b><span>{p.reserveGb} GB protected reserve</span></div><div><small>Installed inventory</small><b>{p.installedCount}</b><span>{fmt(p.installedBytes)} indexed footprint</span></div><div><small>Feasible variants</small><b>{feasible.length}/{p.rows.length}</b><span>{largest?`largest feasible ${fmt(largest.sizeBytes)}`:'no complete feasible point'}</span></div></div>
    <div className="lc13-controls"><label>Target context<select value={p.context} onChange={e=>p.onContext(Number(e.target.value))}>{[4096,8192,16384,32768,65536].map(n=><option value={n} key={n}>{n/1024}K</option>)}</select></label><label>Memory policy<select value={p.policy} onChange={e=>p.onPolicy(e.target.value as LibraryPolicy013)}><option value="safe">Safe</option><option value="balanced">Balanced</option><option value="maximum">Maximum</option></select></label><label>Protected free storage<select value={p.reserveGb} onChange={e=>p.onReserve(Number(e.target.value))}>{[5,10,20,30].map(n=><option value={n} key={n}>{n} GB</option>)}</select></label></div>
    <div className="lc13-status"><span className={storageBlocked.length?'warn':'ok'}><b>{storageBlocked.length}</b> storage constrained</span><span className={runtimeBlocked.length?'warn':'ok'}><b>{runtimeBlocked.length}</b> runtime constrained</span><em>“Largest feasible” means largest file size inside the current constraints—not highest model quality.</em></div>
    {p.rows.length?<div className="lc13-table"><div className="lc13-row head"><span>Variant</span><span>State</span><span>File</span><span>Peak install</span><span>Runtime</span><span>Memory margin</span><span>Post-install free</span></div>{p.rows.map(r=><div className={`lc13-row ${r.plan.state}`} key={r.id}><div><b>{r.label}</b><small>{r.quantization||'quantization unknown'}</small></div><strong>{stateLabel(r.plan.state)}</strong><span>{fmt(r.sizeBytes)}</span><span>{fmt(r.plan.peakInstallBytes)}</span><span>{fmt(r.plan.projectedRuntimeBytes)}</span><span>{r.plan.runtimeMarginPct==null?'—':`${r.plan.runtimeMarginPct>=0?'+':''}${r.plan.runtimeMarginPct.toFixed(0)}%`}</span><span>{fmt(r.plan.postInstallFreeBytes)}</span></div>)}</div>:<div className="lc13-empty">Load downloadable variants to build a capacity frontier.</div>}
    <p className="lc13-note">For Hugging Face GGUF imports, peak headroom models the temporary downloaded GGUF and Ollama blob coexisting during import, plus the backend's 2 GB safety allowance. Ollama pulls use indexed final size because the current backend streams directly to the runtime-managed store. These are feasibility estimates, not performance benchmarks.</p>
  </section>
}
