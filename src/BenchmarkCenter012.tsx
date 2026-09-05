import {useEffect,useMemo,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {task} from './taskBus';
import BenchmarkDecision012 from './BenchmarkDecision012';
import {captureBenchmarkProvenance012,describeCalibrationLink012} from './benchmarkProvenance012';
import {addBenchmarkSession012,benchmarkMemoryEfficiency012,benchmarkParetoStatus012,benchmarkTailRatio012,clearBenchmarkSessions012,downloadBenchmarkSessions012,loadBenchmarkSessions012,summarizeBenchmark012,type BenchmarkResource012,type BenchmarkSample012,type BenchmarkSession012} from './benchmarkTelemetry012';
import './benchmark-center012.css';

type Mode='bundled'|'external';
type Model={name:string;size:number;details?:{parameter_size?:string;quantization_level?:string;family?:string}};
type Active={name?:string;model?:string;size?:number;size_vram?:number;context_length?:number};
type StreamEvent={requestId:string;thinking:string;content:string;done:boolean;doneReason?:string;totalDuration?:number;loadDuration?:number;promptEvalCount?:number;promptEvalDuration?:number;evalCount?:number;evalDuration?:number;error?:string};
const api=(mode:Mode,method:string,path:string,body?:unknown)=>invoke<any>('ollama_json',{mode,method,path,body:body??null});
const GB=1024**3;
const ms=(n:number|null)=>n==null?'—':`${n.toFixed(n>=100?0:1)} ms`;
const rate=(n:number|null)=>n==null?'—':`${n.toFixed(1)} tok/s`;
const bytes=(n:number|null|undefined)=>n==null?'—':`${(n/GB).toFixed(n>=10*GB?1:2)} GB`;
const sleep=(n:number)=>new Promise(r=>setTimeout(r,n));
const sameModel=(value:string|undefined,target:string)=>Boolean(value&&(value===target||value.startsWith(`${target}:`)||target.startsWith(`${value}:`)));
const syntheticContext=Array.from({length:18},(_,i)=>`Segment ${i+1}: local inference benchmark context measures deterministic prompt processing, memory residency, and decode stability.`).join(' ');
const PROMPT=`${syntheticContext}\n\nOutput the integers 1 through 32 separated by single spaces and nothing else.`;

async function verifyWarm(mode:Mode,model:string){
  await api(mode,'POST','/api/generate',{model,prompt:'',stream:false,keep_alive:'10m'});
  for(let i=0;i<12;i++){
    const p=await api(mode,'GET','/api/ps');
    if((p.models??[]).some((m:Active)=>sameModel(m.name??m.model,model)))return true;
    await sleep(250);
  }
  throw new Error('Warm-state precondition failed: model did not appear in /api/ps after preload.');
}

async function captureResource(mode:Mode,model:string):Promise<BenchmarkResource012>{
  const p=await api(mode,'GET','/api/ps'),rows=(p.models??[]) as Active[];
  const target=rows.find(m=>sameModel(m.name??m.model,model));
  const runtimeBytes=target?.size_vram??null,modelBytes=target?.size??null;
  return{
    runtimeBytes,
    modelBytes,
    residencyFactor:runtimeBytes!=null&&modelBytes!=null&&modelBytes>0?runtimeBytes/modelBytes:null,
    loadedModels:rows.length,
    measuredContext:target?.context_length??null,
  };
}

async function controlledSample(mode:Mode,model:string,context:number,index:number):Promise<BenchmarkSample012>{
  const requestId=crypto.randomUUID();
  let start=0,firstAt:number|null=null,unlisten:(()=>void)|null=null,timeout:number|undefined;
  return await new Promise<BenchmarkSample012>(async(resolve,reject)=>{
    let settled=false;
    const finish=(error?:unknown,sample?:BenchmarkSample012)=>{
      if(settled)return;settled=true;
      if(timeout!==undefined)window.clearTimeout(timeout);
      unlisten?.();
      if(error)reject(error);else if(sample)resolve(sample);else reject(new Error('Benchmark sample ended without telemetry.'));
    };
    try{
      unlisten=await listen<StreamEvent>('modeldock://chat-stream',event=>{
        const p=event.payload;if(p.requestId!==requestId)return;
        if(p.error){finish(new Error(p.error));return}
        if(firstAt==null&&(p.content||p.thinking))firstAt=performance.now();
        if(!p.done)return;
        const promptTokens=p.promptEvalCount??0,outputTokens=p.evalCount??0;
        const promptTokS=p.promptEvalDuration&&promptTokens?promptTokens/(p.promptEvalDuration/1e9):null;
        const decodeTokS=p.evalDuration&&outputTokens?outputTokens/(p.evalDuration/1e9):null;
        finish(undefined,{
          index,
          observedTtftMs:firstAt==null?null:firstAt-start,
          totalMs:p.totalDuration?p.totalDuration/1e6:performance.now()-start,
          loadMs:p.loadDuration?p.loadDuration/1e6:null,
          promptMs:p.promptEvalDuration?p.promptEvalDuration/1e6:null,
          decodeMs:p.evalDuration?p.evalDuration/1e6:null,
          promptTokens,outputTokens,promptTokS,decodeTokS,doneReason:p.doneReason??'',
        });
      });
      start=performance.now();
      timeout=window.setTimeout(()=>finish(new Error('Controlled benchmark timed out after 180 seconds.')),180000);
      void invoke('chat_stream',{mode,requestId,body:{
        model,
        messages:[{role:'user',content:PROMPT}],
        keep_alive:'10m',
        think:false,
        options:{num_ctx:context,num_predict:96,temperature:0,seed:42,top_k:1,top_p:1,repeat_penalty:1},
      }}).catch(e=>finish(e));
    }catch(e){finish(e)}
  });
}

export default function BenchmarkCenter012({mode}:{mode:Mode}){
  const [models,setModels]=useState<Model[]>([]),[target,setTarget]=useState(''),[context,setContext]=useState(8192),[repeats,setRepeats]=useState(3),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
  const [sessions,setSessions]=useState<BenchmarkSession012[]>(()=>loadBenchmarkSessions012());
  async function refreshModels(){try{const r=await api(mode,'GET','/api/tags');const rows=(r.models??[]) as Model[];setModels(rows);setTarget(v=>v&&rows.some(m=>m.name===v)?v:rows[0]?.name??'')}catch(e){setStatus(`Model inventory unavailable: ${e}`)}}
  useEffect(()=>{void refreshModels()},[mode]);
  const latest=sessions[0];
  const previous=useMemo(()=>latest?sessions.slice(1).find(s=>s.model===latest.model&&s.context===latest.context&&s.mode===latest.mode):undefined,[sessions,latest]);
  const variation=latest?.summary.decodeTokSCvPct??null;
  const quality=variation==null?'insufficient':variation<=10?'low variation':variation<=20?'moderate variation':'high variation';
  const qualityClass=variation==null||variation<=10?'':variation<=20?'watch':'high';
  async function run(){
    if(!target||busy)return;
    const id=`bench:012:${crypto.randomUUID()}`;setBusy(true);setStatus('Preloading model and verifying warm state…');
    task({id,title:`Benchmark Center · ${target}`,source:'Observatory Ultra',detail:'Preloading and verifying warm state',state:'running',percent:5,progressKind:'stage'});
    try{
      const warm=await verifyWarm(mode,target),samples:BenchmarkSample012[]=[];
      for(let i=0;i<repeats;i++){
        const pct=Math.round(15+i/repeats*68);setStatus(`Controlled sample ${i+1}/${repeats}…`);
        task({id,title:`Benchmark Center · ${target}`,source:'Observatory Ultra',detail:`Controlled sample ${i+1}/${repeats}`,state:'running',percent:pct,progressKind:'stage'});
        samples.push(await controlledSample(mode,target,context,i+1));
        if(i<repeats-1)await sleep(350);
      }
      setStatus('Capturing resource and environment provenance…');
      task({id,title:`Benchmark Center · ${target}`,source:'Observatory Ultra',detail:'Capturing resource + environment provenance',state:'running',percent:88,progressKind:'stage'});
      const resource=await captureResource(mode,target);
      const {environment,calibrationLink}=await captureBenchmarkProvenance012(mode,target,context,resource);
      const row:BenchmarkSession012={schema:'openguin.observatory.benchmark.v1',id:crypto.randomUUID(),at:new Date().toISOString(),model:target,mode,context,repeats,preset:'deterministic-short',warmStateVerified:warm,resource,environment,calibrationLink,samples,summary:summarizeBenchmark012(samples)};
      const next=addBenchmarkSession012(row);setSessions(next);
      setStatus(`Saved ${samples.length} controlled samples · median TTFT ${ms(row.summary.ttftMedianMs)} · decode ${rate(row.summary.decodeTokSMedian)} · runtime ${bytes(resource.runtimeBytes)} · calibration ${calibrationLink?.confidence??'unlinked'}.`);
      task({id,title:`Benchmark Center · ${target}`,source:'Observatory Ultra',detail:`${samples.length} samples + resource/environment provenance saved`,state:'done',percent:100,progressKind:'stage'});
    }catch(e){setStatus(String(e));task({id,title:`Benchmark Center · ${target}`,source:'Observatory Ultra',detail:String(e),state:'failed',percent:100,progressKind:'stage'})}finally{setBusy(false);void refreshModels()}
  }
  function clear(){if(!sessions.length||!confirm(`Clear ${sessions.length} benchmark session${sessions.length===1?'':'s'}?`))return;setSessions(clearBenchmarkSessions012());setStatus('Benchmark session history cleared.')}
  const ttftDelta=latest?.summary.ttftMedianMs!=null&&previous?.summary.ttftMedianMs!=null?latest.summary.ttftMedianMs-previous.summary.ttftMedianMs:null;
  const decodeDelta=latest?.summary.decodeTokSMedian!=null&&previous?.summary.decodeTokSMedian!=null?latest.summary.decodeTokSMedian-previous.summary.decodeTokSMedian:null;
  const efficiency=latest?benchmarkMemoryEfficiency012(latest):null,tailRatio=latest?benchmarkTailRatio012(latest):null,pareto=latest?benchmarkParetoStatus012(latest,sessions):'insufficient';
  return <section className="b12">
    <div className="b12-head"><div><span>OBSERVATORY ULTRA · 0.12</span><h3>Benchmark Center</h3><p>Controlled warm-state streaming trials with fixed prompt, seed and sampling. TTFT is measured at the OpenPenguin UI boundary; Ollama durations, `/api/ps` resources and environment provenance support repeatability, efficiency and multi-objective decision analysis.</p></div><div className="b12-badge">{sessions.length} sessions</div></div>
    <div className="b12-controls">
      <label>Installed model<select value={target} onChange={e=>setTarget(e.target.value)}>{models.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select></label>
      <label>Context<select value={context} onChange={e=>setContext(Number(e.target.value))}>{[4096,8192,16384,32768].map(n=><option key={n} value={n}>{(n/1024).toFixed(0)}K</option>)}</select></label>
      <label>Repeats<select value={repeats} onChange={e=>setRepeats(Number(e.target.value))}>{[2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label>
      <button className="primary" disabled={busy||!target} onClick={run}>{busy?'Running…':'Run benchmark'}</button>
    </div>
    {status&&<p className="b12-status">{status}</p>}
    {latest?<>
      <div className="b12-kpis">
        <Kpi label="Median TTFT" value={ms(latest.summary.ttftMedianMs)} sub={ttftDelta==null?'observed UI-boundary latency':`${ttftDelta>=0?'+':''}${ttftDelta.toFixed(1)} ms vs prior matching session`}/>
        <Kpi label="P95 TTFT" value={ms(latest.summary.ttftP95Ms)} sub={`${latest.repeats} controlled samples`}/>
        <Kpi label="Prompt prefill" value={rate(latest.summary.promptTokSMedian)} sub={`median · ${latest.context.toLocaleString()} context`}/>
        <Kpi label="Decode" value={rate(latest.summary.decodeTokSMedian)} sub={decodeDelta==null?'median output throughput':`${decodeDelta>=0?'+':''}${decodeDelta.toFixed(1)} tok/s vs prior`}/>
        <Kpi label="Runtime memory" value={bytes(latest.resource?.runtimeBytes)} sub={latest.resource?.residencyFactor==null?'resource snapshot unavailable':`${latest.resource.residencyFactor.toFixed(2)}× residency factor`}/>
        <Kpi label="Memory efficiency" value={efficiency==null?'—':`${efficiency.toFixed(1)} tok/s/GB`} sub="decode throughput ÷ runtime GB"/>
        <Kpi label="Tail ratio" value={tailRatio==null?'—':`${tailRatio.toFixed(2)}×`} sub="P95 TTFT ÷ median TTFT"/>
        <Kpi label="Environment" value={latest.environment?.chip||'—'} sub={latest.environment?`${latest.environment.quantization||'quant?'} · Ollama ${latest.environment.runtimeVersion||'?'}`:'legacy session without provenance'}/>
      </div>
      <div className={`b12-quality ${qualityClass}`}><i/><strong>{quality}</strong><span>{variation==null?'Need at least two valid decode samples for CV.':`Decode throughput CV ${variation.toFixed(1)}%. This is a repeatability signal, not a universal performance score.`}</span></div>
      <div className={`b12-decision ${pareto}`}><div><span>IOE DECISION SUPPORT</span><b>{pareto==='pareto'?'Pareto-efficient operating point':pareto==='dominated'?'Dominated by a comparable session':'Need more comparable evidence'}</b></div><p>Comparison is limited to the same runtime mode and context. Objectives stay separate: lower TTFT, higher decode throughput, lower variability and lower runtime memory. OpenPenguin deliberately does not collapse these tradeoffs into one opaque score.</p></div>
      <div className={`b12-evidence ${latest.calibrationLink?.confidence??'unlinked'}`}><div><span>ENGINEERING EVIDENCE LINK</span><b>{latest.calibrationLink?`${latest.calibrationLink.confidence} calibration correlation`:'No comparable calibration point'}</b></div><p>{describeCalibrationLink012(latest.calibrationLink)} The link is evidence provenance only; it never changes planner/controller settings automatically.</p></div>
    </>:<div className="b12-empty">No Observatory Ultra benchmark session yet.</div>}
    <div className="b12-actions"><button disabled={!sessions.length} onClick={()=>downloadBenchmarkSessions012('json',sessions)}>Export JSON</button><button disabled={!sessions.length} onClick={()=>downloadBenchmarkSessions012('csv',sessions)}>Export CSV</button><button disabled={!sessions.length} onClick={clear}>Clear sessions</button><button onClick={refreshModels}>Refresh models</button></div>
    {sessions.length?<div className="b12-table"><div className="b12-row head"><span>Model</span><span>Context</span><span>TTFT med</span><span>Decode</span><span>CV</span><span>Runtime</span><span>tok/s/GB</span><span>Tail</span><span>Pareto</span></div>{sessions.slice(0,10).map(s=>{const e=benchmarkMemoryEfficiency012(s),tail=benchmarkTailRatio012(s),p=benchmarkParetoStatus012(s,sessions);return <div className="b12-row" key={s.id}><b title={s.model}>{s.model}</b><span>{(s.context/1024).toFixed(0)}K</span><span>{ms(s.summary.ttftMedianMs)}</span><span>{rate(s.summary.decodeTokSMedian)}</span><span>{s.summary.decodeTokSCvPct==null?'—':`${s.summary.decodeTokSCvPct.toFixed(1)}%`}</span><span>{bytes(s.resource?.runtimeBytes)}</span><span>{e==null?'—':e.toFixed(1)}</span><span>{tail==null?'—':`${tail.toFixed(2)}×`}</span><span>{p}</span></div>})}</div>:null}
    <BenchmarkDecision012 sessions={sessions} mode={mode}/>
    <p className="b12-note">Method: pre-load target model → verify residency through `/api/ps` → run 2–5 fixed streaming trials with temperature 0 / seed 42 → capture `/api/ps` resource state + hardware/runtime/model provenance → optionally correlate a sufficiently comparable 0.11 Engineering calibration point → report median/P95 TTFT, prefill/decode rates, CV, runtime-memory efficiency and Pareto status. Evidence correlation is never automatic actuation.</p>
  </section>
}

function Kpi({label,value,sub}:{label:string,value:string,sub:string}){return <div className="b12-kpi"><span>{label}</span><b>{value}</b><small>{sub}</small></div>}
