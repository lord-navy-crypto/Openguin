import {useEffect,useMemo,useState} from 'react';
import {benchmarkMemoryEfficiency012,benchmarkParetoStatus012,type BenchmarkSession012} from './benchmarkTelemetry012';
import './benchmark-decision012.css';

type Props={sessions:BenchmarkSession012[];mode:'bundled'|'external'};
const GB=1024**3;
const ms=(n:number|null)=>n==null?'—':`${n.toFixed(n>=100?0:1)} ms`;
const rate=(n:number|null)=>n==null?'—':`${n.toFixed(1)} tok/s`;
const memory=(n:number|null|undefined)=>n==null?'—':`${(n/GB).toFixed(2)} GB`;
const scale=(value:number,min:number,max:number,start:number,end:number)=>max<=min?(start+end)/2:start+(value-min)/(max-min)*(end-start);

export default function BenchmarkDecision012({sessions,mode}:Props){
  const modeRows=useMemo(()=>sessions.filter(s=>s.mode===mode),[sessions,mode]);
  const contexts=useMemo(()=>[...new Set(modeRows.map(s=>s.context))].sort((a,b)=>a-b),[modeRows]);
  const [context,setContext]=useState<number>(contexts[0]??8192),[modelFilter,setModelFilter]=useState('all'),[selectedId,setSelectedId]=useState('');
  useEffect(()=>{if(contexts.length&&!contexts.includes(context))setContext(contexts[0])},[contexts,context]);
  const contextRows=useMemo(()=>modeRows.filter(s=>s.context===context),[modeRows,context]);
  const models=useMemo(()=>[...new Set(contextRows.map(s=>s.model))].sort(),[contextRows]);
  useEffect(()=>{if(modelFilter!=='all'&&!models.includes(modelFilter))setModelFilter('all')},[models,modelFilter]);
  const rows=useMemo(()=>contextRows.filter(s=>modelFilter==='all'||s.model===modelFilter),[contextRows,modelFilter]);
  const selected=rows.find(s=>s.id===selectedId)??rows[0];
  useEffect(()=>{if(rows.length&&!rows.some(s=>s.id===selectedId))setSelectedId(rows[0].id)},[rows,selectedId]);
  if(!sessions.length)return null;
  return <section className="bd12">
    <div className="bd12-head"><div><span>DECISION ANALYSIS</span><h3>Measured Pareto map + raw-sample distribution</h3><p>Compare only measured sessions. Context is fixed before Pareto analysis so responsiveness, throughput, variability and memory remain meaningful constraints rather than mixed operating conditions.</p></div><div className="bd12-filters"><label>Context<select value={context} onChange={e=>setContext(Number(e.target.value))}>{contexts.map(c=><option key={c} value={c}>{(c/1024).toFixed(0)}K</option>)}</select></label><label>Model<select value={modelFilter} onChange={e=>setModelFilter(e.target.value)}><option value="all">All models</option>{models.map(m=><option key={m}>{m}</option>)}</select></label></div></div>
    {rows.length?<div className="bd12-grid"><ParetoMap rows={rows} all={sessions} selectedId={selected?.id??''} onSelect={setSelectedId}/><SampleMap session={selected}/></div>:<div className="bd12-empty">No sessions match this context/model filter yet.</div>}
    {selected&&<div className="bd12-summary"><div><small>Selected</small><b>{selected.model}</b><span>{(selected.context/1024).toFixed(0)}K · {selected.mode}</span></div><div><small>Pareto</small><b>{benchmarkParetoStatus012(selected,sessions)}</b><span>same mode/context comparator</span></div><div><small>Runtime</small><b>{memory(selected.resource?.runtimeBytes)}</b><span>{selected.resource?.residencyFactor==null?'residency unavailable':`${selected.resource.residencyFactor.toFixed(2)}× residency`}</span></div><div><small>Memory efficiency</small><b>{benchmarkMemoryEfficiency012(selected)==null?'—':`${benchmarkMemoryEfficiency012(selected)!.toFixed(1)} tok/s/GB`}</b><span>decode ÷ runtime GB</span></div></div>}
  </section>
}

function ParetoMap({rows,all,selectedId,onSelect}:{rows:BenchmarkSession012[];all:BenchmarkSession012[];selectedId:string;onSelect:(id:string)=>void}){
  const valid=rows.filter(r=>r.summary.ttftMedianMs!=null&&r.summary.decodeTokSMedian!=null);
  if(!valid.length)return <div className="bd12-chart"><div className="bd12-empty">Need valid TTFT and decode telemetry.</div></div>;
  const xs=valid.map(r=>r.summary.ttftMedianMs as number),ys=valid.map(r=>r.summary.decodeTokSMedian as number),mem=valid.map(r=>r.resource?.runtimeBytes??0);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),maxMem=Math.max(...mem,1);
  return <div className="bd12-chart"><div className="bd12-chart-title"><b>Pareto map</b><span>← lower TTFT · higher decode ↑</span></div><svg viewBox="0 0 620 260" role="img" aria-label="Benchmark sessions by TTFT and decode throughput"><line className="axis" x1="52" y1="224" x2="598" y2="224"/><line className="axis" x1="52" y1="20" x2="52" y2="224"/>{valid.map(r=>{const x=scale(r.summary.ttftMedianMs as number,minX,maxX,72,578),y=scale(r.summary.decodeTokSMedian as number,minY,maxY,204,38),radius=6+Math.min(10,((r.resource?.runtimeBytes??0)/maxMem)*10),p=benchmarkParetoStatus012(r,all);return <g key={r.id} className={`point ${p} ${selectedId===r.id?'selected':''}`} onClick={()=>onSelect(r.id)} tabIndex={0} role="button"><circle cx={x} cy={y} r={radius}/><title>{`${r.model} · TTFT ${ms(r.summary.ttftMedianMs)} · decode ${rate(r.summary.decodeTokSMedian)} · CV ${r.summary.decodeTokSCvPct?.toFixed(1)??'—'}% · runtime ${memory(r.resource?.runtimeBytes)} · ${p}`}</title></g>})}<text x="325" y="248">Observed TTFT</text><text x="15" y="128" transform="rotate(-90 15 128)">Decode throughput</text></svg><p>Circle size represents measured runtime memory. Pareto status also considers decode CV and runtime memory, so a point may be non-dominated even when another point looks better on these two visible axes.</p></div>
}

function SampleMap({session}:{session:BenchmarkSession012|undefined}){
  if(!session)return <div className="bd12-chart"><div className="bd12-empty">Select a session.</div></div>;
  const valid=session.samples.filter(s=>s.observedTtftMs!=null&&s.decodeTokS!=null);
  if(!valid.length)return <div className="bd12-chart"><div className="bd12-empty">Selected session has no paired raw samples.</div></div>;
  const xs=valid.map(s=>s.observedTtftMs as number),ys=valid.map(s=>s.decodeTokS as number),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return <div className="bd12-chart"><div className="bd12-chart-title"><b>Raw-sample scatter</b><span>{valid.length} controlled samples</span></div><svg viewBox="0 0 620 260" role="img" aria-label="Raw benchmark sample TTFT and decode throughput"><line className="axis" x1="52" y1="224" x2="598" y2="224"/><line className="axis" x1="52" y1="20" x2="52" y2="224"/>{valid.map(s=>{const x=scale(s.observedTtftMs as number,minX,maxX,72,578),y=scale(s.decodeTokS as number,minY,maxY,204,38);return <g key={s.index} className="sample"><circle cx={x} cy={y} r="7"/><text x={x+9} y={y+3}>{s.index}</text><title>{`Sample ${s.index} · TTFT ${ms(s.observedTtftMs)} · decode ${rate(s.decodeTokS)}`}</title></g>})}<text x="325" y="248">Observed TTFT</text><text x="15" y="128" transform="rotate(-90 15 128)">Decode throughput</text></svg><p>Raw points make within-session dispersion visible instead of hiding every run behind a median. This supports quality/reliability analysis and experiment review.</p></div>
}
