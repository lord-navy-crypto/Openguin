import {useEffect,useMemo,useState} from 'react';
import type {EngineeringCalibration} from './engineeringTelemetry011';
import {ENGINEERING_DATASET_EVENT,clearEngineeringDataset,copyEngineeringDataset,downloadEngineeringDataset,loadEngineeringDataset,recordEngineeringPoint,type EngineeringCalibrationPoint} from './engineeringCalibrationDataset011';
import './calibration-recorder011.css';

type Props={
  calibration:EngineeringCalibration|null;
  modelGb:number;
  requestedContext:number;
  recommendedContext:number;
  policy:string;
  workload:string;
  heuristicProjectedBytes:number;
  calibratedProjectedBytes:number|null;
  runtimeBudgetBytes:number;
};
const GB=1024**3;
const fmt=(n:number)=>`${(n/GB).toFixed(n>=10*GB?1:2)} GB`;
const ctx=(n:number)=>n>=1024?`${Math.round(n/1024)}K`:`${n}`;

export default function CalibrationRecorder011(props:Props){
  const [rows,setRows]=useState<EngineeringCalibrationPoint[]>(()=>loadEngineeringDataset());
  const [note,setNote]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{const sync=(event:Event)=>setRows((event as CustomEvent<EngineeringCalibrationPoint[]>).detail||loadEngineeringDataset());window.addEventListener(ENGINEERING_DATASET_EVENT,sync);return()=>window.removeEventListener(ENGINEERING_DATASET_EVENT,sync)},[]);
  const latest=rows[0],coverage=useMemo(()=>new Set(rows.map(r=>`${Math.round(r.modelGb*10)/10}:${r.requestedContext}`)).size,[rows]);
  const canRecord=Boolean(props.calibration&&props.calibratedProjectedBytes!=null);
  function record(){
    if(!props.calibration||props.calibratedProjectedBytes==null){setMessage('Load a model and refresh Observatory before recording.');return}
    const {rows:next}=recordEngineeringPoint({calibration:props.calibration,modelGb:props.modelGb,requestedContext:props.requestedContext,recommendedContext:props.recommendedContext,policy:props.policy,workload:props.workload,heuristicProjectedBytes:props.heuristicProjectedBytes,calibratedProjectedBytes:props.calibratedProjectedBytes,runtimeBudgetBytes:props.runtimeBudgetBytes,note});
    setRows(next);setNote('');setMessage(`Recorded point ${next.length} · ${props.modelGb.toFixed(1)} GB @ ${ctx(props.requestedContext)}`);
  }
  async function copy(format:'json'|'csv'){try{await copyEngineeringDataset(format,rows);setMessage(`${format.toUpperCase()} copied to clipboard.`)}catch(e){setMessage(`Copy failed: ${e}`)}}
  function clear(){if(!rows.length||!confirm(`Clear ${rows.length} calibration point${rows.length===1?'':'s'}?`))return;setRows(clearEngineeringDataset());setMessage('Calibration dataset cleared.')}
  return <section className="eng011-recorder">
    <div className="eng011-title"><div><b>Calibration Recorder</b><small>Physical-Mac dataset · local only</small></div><span>{rows.length} points · {coverage} operating points</span></div>
    <div className="eng011-rec-actions">
      <input value={note} maxLength={240} onChange={e=>setNote(e.target.value)} placeholder="Optional note: model/quantization/test condition"/>
      <button disabled={!canRecord} onClick={record}>Record point</button>
      <button disabled={!rows.length} onClick={()=>downloadEngineeringDataset('json',rows)}>Download JSON</button>
      <button disabled={!rows.length} onClick={()=>downloadEngineeringDataset('csv',rows)}>Download CSV</button>
      <button disabled={!rows.length} onClick={()=>copy('json')}>Copy JSON</button>
      <button disabled={!rows.length} onClick={()=>copy('csv')}>Copy CSV</button>
      <button disabled={!rows.length} onClick={clear}>Clear</button>
    </div>
    {message&&<div className="eng011-rec-message">{message}</div>}
    {latest?<div className="eng011-rec-table">
      <div className="head"><span>Recorded</span><span>Planner point</span><span>Measured</span><span>Factor</span><span>Error vs heuristic</span><span>Note</span></div>
      {rows.slice(0,6).map(r=>{const delta=(r.calibratedProjectedBytes-r.heuristicProjectedBytes)/Math.max(1,r.heuristicProjectedBytes)*100;return <div key={r.id}><span>{new Date(r.recordedAt).toLocaleTimeString()}</span><span>{r.modelGb.toFixed(1)} GB · {ctx(r.requestedContext)}</span><span>{fmt(r.measuredRuntimeBytes)}</span><span>{r.residencyFactor.toFixed(2)}×</span><span>{delta>=0?'+':''}{delta.toFixed(1)}%</span><span title={r.note}>{r.note||'—'}</span></div>})}
    </div>:<p className="eng011-rec-empty">No recorded points yet. Keep Observatory open with a resident model, choose the matching planner model size/context, then record a point. Recording is explicit so a 2-second telemetry poll cannot flood or bias the dataset.</p>}
  </section>
}
