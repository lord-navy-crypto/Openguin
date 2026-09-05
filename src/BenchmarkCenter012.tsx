import {useEffect,useMemo,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {task} from './taskBus';
import {addBenchmarkSession012,clearBenchmarkSessions012,downloadBenchmarkSessions012,loadBenchmarkSessions012,summarizeBenchmark012,type BenchmarkSample012,type BenchmarkSession012} from './benchmarkTelemetry012';
import './benchmark-center012.css';

type Mode='bundled'|'external';
type Model={name:string;size:number;details?:{parameter_size?:string;quantization_level?:string;family?:string}};
type Active={name?:string;model?:string};
type StreamEvent={requestId:string;thinking:string;content:string;done:boolean;doneReason?:string;totalDuration?:number;loadDuration?:number;promptEvalCount?:number;promptEvalDuration?:number;evalCount?:number;evalDuration?:number;error?:string};
const api=(mode:Mode,method:string,path:string,body?:unknown)=>invoke<any>('ollama_json',{mode,method,path,body:body??null});
const ms=(n:number|null)=>n==null?'—':`${n.toFixed(n>=100?0:1)} ms`;
const rate=(n:number|null)=>n==null?'—':`${n.toFixed(1)} tok/s`;
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
        const pct=Math.round(15+i/repeats*75);setStatus(`Controlled sample ${i+1}/${repeats}…`);
        task({id,title:`Benchmark Center · ${target}`,source:'Observatory Ultra',detail:`Controlled sample ${i+1}/${repeats}`,state:'running',percent:pct,progressKind:'stage'});
        samples.push(await controlledSample(mode,target,context,i+1));
        if(i<repeats-1)await sleep(350);
      }
      const row:BenchmarkSession012={schema:'openguin.observatory.benchmark.v1',id:crypto.randomUUID(),at:new Date().toISOString(),model:target,mode,context,repeats,preset:'deterministic-short',warmStateVerified:warm,samples,summary:summarizeBenchmark012(samples)};
      const next=addBenchmarkSession012(row);setSessions(next);
      setStatus(`Saved ${samples.length} controlled samples · median TTFT ${ms(row.summary.ttftMedianMs)} · median decode ${rate(row.summary.decodeTokSMedian)}.`);
      task({id,title:`Benchmark Center · ${target}`,source:'Observatory Ultra',detail:`${samples.length} samples saved`,state:'done',percent:100,progressKind:'stage'});
    }catch(e){setStatus(String(e));task({id,title:`Benchmark Center · ${target}`,source:'Observatory Ultra',detail:String(e),state:'failed',percent:100,progressKind:'stage'})}finally{setBusy(false);void refreshModels()}
  }
  function clear(){if(!sessions.length||!confirm(`Clear ${sessions.length} benchmark session${sessions.length===1?'':'s'}?`))return;setSessions(clearBenchmarkSessions012());setStatus('Benchmark session history cleared.')}
  const ttftDelta=latest?.summary.ttftMedianMs!=null&&previous?.summary.ttftMedianMs!=null?latest.summary.ttftMedianMs-previous.summary.ttftMedianMs:null;
  const decodeDelta=latest?.summary.decodeTokSMedian!=null&&previous?.summary.decodeTokSMedian!=null?latest.summary.decodeTokSMedian-previous.summary.decodeTokSMedian:null;
  return <section className="b12">
    <div className="b12-head"><div><span>OBSERVATORY ULTRA · 0.12</span><h3>Benchmark Center</h3><p>Controlled warm-state streaming trials with fixed prompt, seed and sampling. TTFT is measured at the OpenPenguin UI boundary; Ollama durations provide load, prefill and decode telemetry.</p></div><div className="b12-badge">{sessions.length} sessions</div></div>
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
        <Kpi label="Load" value={ms(latest.summary.loadMedianMs)} sub="median warm-state load duration"/>
      </div>
      <div className={`b12-quality ${qualityClass}`}><i/><strong>{quality}</strong><span>{variation==null?'Need at least two valid decode samples for CV.':`Decode throughput CV ${variation.toFixed(1)}%. This is a repeatability signal, not a universal performance score.`}</span></div>
    </>:<div className="b12-empty">No Observatory Ultra benchmark session yet.</div>}
    <div className="b12-actions"><button disabled={!sessions.length} onClick={()=>downloadBenchmarkSessions012('json',sessions)}>Export JSON</button><button disabled={!sessions.length} onClick={()=>downloadBenchmarkSessions012('csv',sessions)}>Export CSV</button><button disabled={!sessions.length} onClick={clear}>Clear sessions</button><button onClick={refreshModels}>Refresh models</button></div>
    {sessions.length?<div className="b12-table"><div className="b12-row head"><span>Model</span><span>Context</span><span>Samples</span><span>TTFT med</span><span>TTFT P95</span><span>Prefill</span><span>Decode</span><span>Decode CV</span></div>{sessions.slice(0,10).map(s=><div className="b12-row" key={s.id}><b title={s.model}>{s.model}</b><span>{(s.context/1024).toFixed(0)}K</span><span>{s.samples.length}</span><span>{ms(s.summary.ttftMedianMs)}</span><span>{ms(s.summary.ttftP95Ms)}</span><span>{rate(s.summary.promptTokSMedian)}</span><span>{rate(s.summary.decodeTokSMedian)}</span><span>{s.summary.decodeTokSCvPct==null?'—':`${s.summary.decodeTokSCvPct.toFixed(1)}%`}</span></div>)}</div>:null}
    <p className="b12-note">Method: pre-load target model → verify residency through `/api/ps` → run 2–5 fixed streaming trials with temperature 0 / seed 42 → report median and P95 TTFT plus median prefill/decode rates and decode CV. Observed TTFT includes OpenPenguin IPC/HTTP delivery overhead by design, so it represents user-visible latency rather than a model-kernel-only timer.</p>
  </section>
}

function Kpi({label,value,sub}:{label:string,value:string,sub:string}){return <div className="b12-kpi"><span>{label}</span><b>{value}</b><small>{sub}</small></div>}
