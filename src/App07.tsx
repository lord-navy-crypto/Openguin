import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './app07.css';
import BrandMark from './BrandMark';
import Observatory from './Observatory';
import MegaLibrary from './MegaLibrary';
import DeveloperStudio010 from './DeveloperStudio010';
import RuntimeInstallerCard from './RuntimeInstallerCard';
import AdvancedSettings010 from './AdvancedSettings010';
import FullLogs from './FullLogs';
import { task } from './taskBus';

// OPENGUIN_011_STATIC_COMPOSITION
// Production UI composition lives in source control. Legacy prepare scripts may
// verify compatibility, but must not rewrite this core state machine.

type Mode='bundled'|'external';
type Tab='overview'|'observatory'|'models'|'lab'|'library'|'diagnostics'|'developer';
type Profile={os:string;arch:string;chip:string;memoryBytes:number;logicalCores:number;freeStorageBytes:number};
type Runtime={bundledAvailable:boolean;bundledRunning:boolean;externalInstalled:boolean;externalRunning:boolean;externalPath?:string;externalVersion?:string;recommendedMode:Mode;reason:string};
type Model={name:string;size:number;modified_at?:string;details?:{parameter_size?:string;quantization_level?:string;family?:string}};
type Show={capabilities?:string[];details?:{family?:string;parameter_size?:string;quantization_level?:string};model_info?:Record<string,unknown>;license?:string;modelfile?:string;parameters?:string};
type PullEvent={model:string;status:string;percent?:number;done:boolean;cancelled:boolean;error?:string};
type ImportEvent={importId:string;repoId:string;filename:string;model:string;stage:string;status:string;percent?:number;done:boolean;cancelled:boolean;error?:string;sha256?:string};
type StreamEvent={requestId:string;thinking:string;content:string;done:boolean;doneReason?:string;totalDuration?:number;loadDuration?:number;promptEvalCount?:number;promptEvalDuration?:number;evalCount?:number;evalDuration?:number;error?:string};
type Bench={at:string;model:string;ctx:number;temperature:number;tokS:number;tokens:number;mode:Mode;thinking:boolean;loadMs?:number;promptMs?:number;decodeMs?:number;promptTokens?:number;doneReason?:string};
type Log={at:string;level:'info'|'warn'|'error';message:string};
type EngineSnapshot={version:string;models:Model[]};

const GB=1024**3;
const fmt=(n=0)=>n?`${(n/GB).toFixed(n>=10*GB?1:2)} GB`:'—';
const api=(mode:Mode,method:string,path:string,body?:unknown)=>invoke<any>('ollama_json',{mode,method,path,body:body??null});

function parseParam(s=''){const m=s.toLowerCase().match(/([\d.]+)\s*b/);return m?Number(m[1]):0;}
function contextMax(info?:Record<string,unknown>){for(const [k,v] of Object.entries(info??{})){if(k.endsWith('.context_length')&&typeof v==='number')return v}return 32768;}
function fit(model:Model|undefined,memory:number,ctx:number){
 if(!model||!memory)return{score:0,label:'Unknown',estimate:0,confidence:'low'};
 const params=parseParam(model.details?.parameter_size),base=model.size*1.08;
 const kvPerToken=params?Math.max(18,Math.min(180,params*5.5))*1024:48*1024;
 const kv=ctx*kvPerToken*2.2,estimate=base+kv+0.45*GB,usable=memory*.78,ratio=estimate/usable;
 const score=Math.max(10,Math.min(99,Math.round(108-ratio*66)));
 return{score,label:ratio<.62?'Excellent':ratio<.8?'Recommended':ratio<1?'Heavy':'Not ideal',estimate,confidence:params?'medium':'low'};
}
function load<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'') as T}catch{return fallback}}
function save(key:string,value:unknown){localStorage.setItem(key,JSON.stringify(value));}

export default function App07(){
 const [tab,setTab]=useState<Tab>('overview'),modeRef=useRef<Mode>('bundled');
 const refreshSeq=useRef(0),discoverSeq=useRef(0),modeSeq=useRef(0),inspectSeq=useRef(0);
 const modeTransitionRef=useRef(false),activeGenerationRef=useRef('');
 const [mode,setMode]=useState<Mode>('bundled'),[modeBusy,setModeBusy]=useState(false),[profile,setProfile]=useState<Profile|null>(null),[runtime,setRuntime]=useState<Runtime|null>(null);
 const [online,setOnline]=useState(false),[version,setVersion]=useState(''),[models,setModels]=useState<Model[]>([]),[selected,setSelected]=useState(''),[show,setShow]=useState<Show|null>(null);
 const [notice,setNotice]=useState('');
 const [ctx,setCtx]=useState(8192),[temp,setTemp]=useState(.7),[topP,setTopP]=useState(.9),[maxOut,setMaxOut]=useState(512),[prompt,setPrompt]=useState('Explain why local inference is useful.'),[system,setSystem]=useState('You are a concise, accurate local assistant.');
 const [topK,setTopK]=useState(40),[minP,setMinP]=useState(0),[repeatPenalty,setRepeatPenalty]=useState(1.1),[seed,setSeed]=useState(-1),[keepAlive,setKeepAlive]=useState('5m');
 const [thinking,setThinking]=useState(false),[thinkLevel,setThinkLevel]=useState<'low'|'medium'|'high'>('medium'),[answer,setAnswer]=useState(''),[trace,setTrace]=useState(''),[generation,setGeneration]=useState({running:false,phase:'Idle',progress:0,tokens:0,speed:0});
 const [bench,setBench]=useState<Bench[]>(()=>load('modeldock-benchmarks',[])),[logs,setLogs]=useState<Log[]>(()=>load('modeldock-logs',[]));
 const memory=profile?.memoryBytes??0,selectedModel=models.find(m=>m.name===selected),hardware=fit(selectedModel,memory,ctx),caps=show?.capabilities??[],canThink=caps.includes('thinking'),gptOss=selected.toLowerCase().startsWith('gpt-oss'),maxCtx=Math.min(131072,contextMax(show?.model_info));
 const best=useMemo(()=>models.map(m=>({m,f:fit(m,memory,8192)})).sort((a,b)=>b.f.score-a.f.score)[0],[models,memory]);
 const log=(level:Log['level'],message:string)=>setLogs(prev=>{const next=[{at:new Date().toISOString(),level,message},...prev].slice(0,300);save('modeldock-logs',next);return next});

 async function probeEngine(which:Mode):Promise<EngineSnapshot>{
  const [v,t]=await Promise.all([api(which,'GET','/api/version'),api(which,'GET','/api/tags')]);
  return{version:v.version??'',models:(t.models??[]) as Model[]};
 }
 function applyEngineSnapshot(which:Mode,s:EngineSnapshot){
  if(which!==modeRef.current)return;
  setOnline(true);setVersion(s.version);setModels(s.models);
  setSelected(current=>current&&s.models.some(m=>m.name===current)?current:(s.models[0]?.name??''));
 }
 async function discover(){
  const token=++discoverSeq.current;
  try{const d=await invoke<Runtime>('runtime_discovery');if(token!==discoverSeq.current)return null;setRuntime(d);return d}catch(e){if(token===discoverSeq.current)log('error',`Runtime discovery: ${e}`);return null}
 }
 async function refresh(which=modeRef.current){
  const token=++refreshSeq.current;
  try{const snapshot=await probeEngine(which);if(token!==refreshSeq.current||which!==modeRef.current)return false;applyEngineSnapshot(which,snapshot);return true}catch(e){if(token!==refreshSeq.current||which!==modeRef.current)return false;setOnline(false);setNotice(String(e));log('warn',`${which} refresh failed: ${e}`);return false}
 }
 async function switchMode(next:Mode){
  if(modeTransitionRef.current){setNotice('A runtime transition is already in progress.');return}
  if(activeGenerationRef.current){setNotice('Finish the current generation before switching runtimes.');return}
  if(next===modeRef.current&&online){await refresh(next);return}
  const taskId=`runtime:switch:${next}`;
  task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'Probing target runtime…',state:'running',percent:8,progressKind:'stage'});
  modeTransitionRef.current=true;const token=++modeSeq.current;setModeBusy(true);setNotice('');refreshSeq.current++;inspectSeq.current++;
  try{
   let snapshot:EngineSnapshot;
   if(next==='bundled'){
    task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'Starting private Ollama…',state:'running',percent:30,progressKind:'stage'});
    await invoke('start_bundled_ollama');
    if(token!==modeSeq.current)return;
    snapshot=await probeEngine('bundled');
   }else{
    snapshot=await probeEngine('external');
    if(token!==modeSeq.current)return;
    task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'External runtime passed readiness; releasing private runtime…',state:'running',percent:70,progressKind:'stage'});
    try{await invoke('stop_bundled_ollama')}catch(e){log('warn',`Bundled stop during external switch: ${e}`)}
   }
   if(token!==modeSeq.current)return;
   modeRef.current=next;setMode(next);setShow(null);setThinking(false);applyEngineSnapshot(next,snapshot);
   log('info',`${next==='bundled'?'Private bundled':'External'} Ollama passed readiness and became active.`);
   task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'Target runtime ready and committed',state:'done',percent:100,progressKind:'stage'});
  }catch(e){
   if(token!==modeSeq.current)return;
   if(next==='bundled'){
    try{await invoke('stop_bundled_ollama')}catch{}
    try{
     const fallback=await probeEngine('external');
     if(token!==modeSeq.current)return;
     modeRef.current='external';setMode('external');setShow(null);setThinking(false);applyEngineSnapshot('external',fallback);
     setNotice('Private runtime failed readiness; OpenPenguin kept service available by switching to your running external Ollama.');
     log('warn',`Bundled readiness failed; external fallback active: ${e}`);
     task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'Private runtime failed; external fallback kept service online',state:'failed',percent:100,progressKind:'stage'});
    }catch(fallbackError){
     setOnline(false);setNotice(`Private runtime failed readiness and no external fallback was ready. ${e}`);log('error',`Runtime transition failed: bundled=${e}; external=${fallbackError}`);
     task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:String(e),state:'failed',percent:100,progressKind:'stage'});
    }
   }else{
    setNotice(`External Ollama did not pass readiness; the current runtime was left unchanged. ${e}`);log('warn',`External runtime switch rejected before commit: ${e}`);await refresh(modeRef.current);
    task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'Target failed readiness; current runtime left unchanged',state:'failed',percent:100,progressKind:'stage'});
   }
  }finally{
   if(token===modeSeq.current){modeTransitionRef.current=false;setModeBusy(false);await discover()}
  }
 }
 async function inspectModel(name=selected){
  const token=++inspectSeq.current,which=modeRef.current;
  if(!name){setShow(null);return}
  try{const d=await api(which,'POST','/api/show',{model:name}) as Show;if(token!==inspectSeq.current||which!==modeRef.current)return;setShow(d);const max=contextMax(d.model_info);setCtx(v=>Math.min(v,max));if(!(d.capabilities??[]).includes('thinking'))setThinking(false);log('info',`Inspected ${name}: ${(d.capabilities??[]).join(', ')||'no capabilities reported'}`)}catch(e){if(token!==inspectSeq.current||which!==modeRef.current)return;setShow(null);log('warn',`Model inspect failed: ${e}`)}
 }
 async function initialize(){
  try{setProfile(await invoke('system_profile'))}catch(e){log('error',`Hardware detection failed: ${e}`)}
  const d=await discover();if(d?.bundledAvailable!==false)await switchMode('bundled');else if(d?.externalRunning)await switchMode('external');else setNotice('No local Ollama runtime is ready.');
 }
 useEffect(()=>{
  void initialize();const unsubs:Promise<()=>void>[]=[];
  unsubs.push(listen<PullEvent>('modeldock://pull-progress',e=>{if(e.payload.done){log(e.payload.error?'error':'info',`Pull ${e.payload.model}: ${e.payload.error||e.payload.status}`);void refresh()}}));
  unsubs.push(listen<ImportEvent>('modeldock://import-progress',e=>{if(e.payload.done){log(e.payload.error?'error':'info',`HF import ${e.payload.model}: ${e.payload.error||e.payload.status}`);void refresh()}}));
  return()=>{refreshSeq.current++;discoverSeq.current++;inspectSeq.current++;unsubs.forEach(x=>x.then(f=>f()))}
 },[]);
 useEffect(()=>{if(selected)void inspectModel(selected);else setShow(null)},[selected,mode]);

 async function runStream(){
  if(!selected||activeGenerationRef.current)return;
  const requestId=crypto.randomUUID(),taskId=`chat:${requestId}`;
  const runModel=selected,runMode=modeRef.current,runCtx=ctx,runTemp=temp,runTopP=topP,runTopK=topK,runMinP=minP,runRepeatPenalty=repeatPenalty,runSeed=seed,runKeepAlive=keepAlive,runMaxOut=maxOut,runPrompt=prompt,runSystem=system,runThinking=thinking&&canThink,runThink=gptOss&&canThink?thinkLevel:(canThink?thinking:false);
  activeGenerationRef.current=requestId;setNotice('');setAnswer('');setTrace('');setGeneration({running:true,phase:canThink&&thinking?'Thinking':'Starting',progress:2,tokens:0,speed:0});let chunks=0;const start=performance.now();let unlisten:(()=>void)|null=null;
  task({id:taskId,title:`Generate · ${runModel}`,source:'Model Lab',detail:`${runMode} · ${runCtx.toLocaleString()} ctx`,state:'running',percent:2,progressKind:'stage'});
  try{
   unlisten=await listen<StreamEvent>('modeldock://chat-stream',e=>{
    const p=e.payload;if(p.requestId!==requestId||activeGenerationRef.current!==requestId)return;
    if(p.error){setNotice(p.error);log('error',p.error);setGeneration(g=>({...g,running:false,phase:'Failed'}));activeGenerationRef.current='';task({id:taskId,title:`Generate · ${runModel}`,source:'Model Lab',detail:p.error,state:'failed',percent:100,progressKind:'stage'});unlisten?.();return}
    if(p.thinking){setTrace(v=>v+p.thinking);setGeneration(g=>({...g,phase:'Thinking'}));task({id:taskId,title:`Generate · ${runModel}`,source:'Model Lab',detail:'Thinking…',state:'running',percent:10,progressKind:'stage'})}
    if(p.content){setAnswer(v=>v+p.content);chunks++;const pct=Math.min(96,4+chunks/Math.max(1,runMaxOut)*92);setGeneration(g=>({...g,phase:'Answering',progress:pct,tokens:chunks}));task({id:taskId,title:`Generate · ${runModel}`,source:'Model Lab',detail:'Streaming answer…',state:'running',percent:pct,progressKind:'stage'})}
    if(p.done){
     const tokens=p.evalCount??chunks,speed=p.evalDuration?tokens/(p.evalDuration/1e9):tokens/Math.max(.001,(performance.now()-start)/1000);
     setGeneration({running:false,phase:'Done',progress:100,tokens,speed});
     const b:Bench={at:new Date().toISOString(),model:runModel,ctx:runCtx,temperature:runTemp,tokS:speed,tokens,mode:runMode,thinking:runThinking,loadMs:p.loadDuration?p.loadDuration/1e6:undefined,promptMs:p.promptEvalDuration?p.promptEvalDuration/1e6:undefined,decodeMs:p.evalDuration?p.evalDuration/1e6:undefined,promptTokens:p.promptEvalCount,doneReason:p.doneReason};
     setBench(prev=>{const next=[b,...prev].slice(0,40);save('modeldock-benchmarks',next);return next});log('info',`Inference ${runModel}: ${tokens} tokens, ${speed.toFixed(1)} tok/s`);activeGenerationRef.current='';task({id:taskId,title:`Generate · ${runModel}`,source:'Model Lab',detail:`${tokens} tokens · ${speed.toFixed(1)} tok/s`,state:'done',percent:100,progressKind:'stage'});unlisten?.()
    }
   });
   await invoke('chat_stream',{mode:runMode,requestId,body:{model:runModel,messages:[{role:'system',content:runSystem},{role:'user',content:runPrompt}],think:runThink,options:{num_ctx:runCtx,num_predict:runMaxOut,temperature:runTemp,top_p:runTopP,top_k:runTopK,min_p:runMinP,repeat_penalty:runRepeatPenalty,...(runSeed>=0?{seed:runSeed}:{})},keep_alive:runKeepAlive}});
  }catch(e){unlisten?.();if(activeGenerationRef.current===requestId)activeGenerationRef.current='';setGeneration(g=>({...g,running:false,phase:'Failed'}));setNotice(String(e));log('error',`Inference failed: ${e}`);task({id:taskId,title:`Generate · ${runModel}`,source:'Model Lab',detail:String(e),state:'failed',percent:100,progressKind:'stage'})}
 }

 async function removeModel(name:string){
  if(!confirm(`Delete ${name}?`))return;const taskId=`model:delete:${name}`;task({id:taskId,title:`Delete ${name}`,source:'My Models',detail:'Removing model from active runtime…',state:'running',percent:20,progressKind:'stage'});
  try{await api(modeRef.current,'DELETE','/api/delete',{model:name});log('info',`Deleted ${name}`);await refresh();task({id:taskId,title:`Delete ${name}`,source:'My Models',detail:'Model removed',state:'done',percent:100,progressKind:'stage'})}catch(e){setNotice(String(e));task({id:taskId,title:`Delete ${name}`,source:'My Models',detail:String(e),state:'failed',percent:100,progressKind:'stage'})}
 }

 return <div className="v07-shell">
  <aside className="v07-side"><div className="v07-brand"><span className="openguin-brand-mark"><BrandMark size={34}/></span><div>Openguin<small>Desktop Alpha 0.10.1</small></div></div>{(['overview','observatory','models','lab','library','diagnostics','developer'] as Tab[]).map(t=><button className={tab===t?'active':''} key={t} onClick={()=>setTab(t)}>{({overview:'Overview',observatory:'Observatory',models:'My Models',lab:'Model Lab',library:'Library',diagnostics:'Diagnostics',developer:'Developer'} as Record<Tab,string>)[t]}</button>)}<div className="v07-spacer"/><div className="v07-runtime"><div><i className={online?'green':'red'}/>{online?`Ollama ${version}`:'Engine offline'}</div><small>{modeBusy?'Switching runtime…':mode==='bundled'?'Private bundled :11435':'Existing Ollama :11434'}</small><div className="v07-segment"><button disabled={modeBusy||generation.running} className={mode==='bundled'?'active':''} onClick={()=>switchMode('bundled')}>Bundled</button><button disabled={modeBusy||generation.running} className={mode==='external'?'active':''} onClick={()=>switchMode('external')}>External</button></div></div></aside>
  <main className="v07-main"><header><div><h1>{({overview:'Control Center',observatory:'Runtime Observatory',models:'Model Passports',lab:'Model Lab',library:'Unified Library',diagnostics:'Diagnostics & Usage',developer:'Developer Studio'} as Record<Tab,string>)[tab]}</h1><p>{profile?.chip||'Detecting hardware'} · {fmt(memory)} memory · {fmt(profile?.freeStorageBytes)} free</p></div><button disabled={modeBusy} onClick={()=>{void refresh();void discover()}}>Refresh</button></header>{notice&&<div className="v07-notice" onClick={()=>setNotice('')}>{notice}</div>}

  {tab==='overview'&&<RuntimeInstallerCard runtime={runtime} onReady={()=>switchMode('bundled')}/>} 
  {tab==='overview'&&<div className="v07-page"><section className="v07-hero"><div><span className="eyebrow">LOCAL-FIRST · HARDWARE-AWARE · PROVENANCE-AWARE</span><h2>One desktop home for local models.</h2><p>Openguin manages an isolated Ollama runtime, detects existing Ollama automatically, and keeps model discovery, tuning, benchmarks, licensing and diagnostics in one place.</p></div><div className="hero-score"><small>Best installed fit</small><b>{best?.m.name||'No model yet'}</b><strong>{best?.f.score??'—'}</strong></div></section><div className="v07-grid4"><Stat label="Bundled" value={runtime?.bundledRunning?'Running':runtime?.bundledAvailable?'Included':'Unavailable'}/><Stat label="Existing Ollama" value={runtime?.externalRunning?'Running':runtime?.externalInstalled?'Installed':'Not detected'}/><Stat label="Models" value={String(models.length)}/><Stat label="Bench runs" value={String(bench.length)}/></div><section className="v07-card"><h3>Runtime health</h3><p>{runtime?.reason||'Detecting runtimes…'}</p><div className="runtime-detail"><span>Bundled sidecar <b>{runtime?.bundledAvailable?'included':'missing'}</b></span><span>External version <b>{runtime?.externalVersion||'—'}</b></span><span>External path <b>{runtime?.externalPath||'—'}</b></span></div></section></div>}

  {tab==='observatory'&&<Observatory mode={mode} memoryBytes={memory} installedCount={models.length} online={online}/>} 

  {tab==='models'&&<div className="v07-page two"><section className="v07-card list">{models.map(m=><button key={m.name} className={selected===m.name?'selected':''} onClick={()=>setSelected(m.name)}><div><b>{m.name}</b><small>{fmt(m.size)} · {m.details?.parameter_size||'?'} · {m.details?.quantization_level||'?'}</small></div><span>{fit(m,memory,8192).score}</span></button>)}{!models.length&&<Empty text="No models installed in this engine."/>}</section><section className="v07-card passport">{selectedModel?<><div className="passport-head"><div><span className="eyebrow">MODEL PASSPORT</span><h2>{selectedModel.name}</h2></div><strong>{hardware.score}</strong></div><div className="cap-row">{caps.map(c=><span key={c}>{c}</span>)}{!caps.length&&<span>capabilities not reported</span>}</div><div className="v07-grid4"><Stat label="Disk" value={fmt(selectedModel.size)}/><Stat label="Est. runtime" value={fmt(hardware.estimate)}/><Stat label="Max context" value={maxCtx.toLocaleString()}/><Stat label="Fit confidence" value={hardware.confidence}/></div><p className="fine">Hardware Fit 3 combines weight size, model parameter metadata when available, context/KV allowance and OS headroom. It is an estimate, not a benchmark.</p><div className="actions"><button onClick={()=>setTab('lab')}>Open in Lab</button><button className="danger" onClick={()=>removeModel(selectedModel.name)}>Delete</button></div></>:<Empty text="Select a model to inspect it."/>}</section></div>}

  {tab==='lab'&&<AdvancedSettings010 topK={topK} setTopK={setTopK} minP={minP} setMinP={setMinP} repeatPenalty={repeatPenalty} setRepeatPenalty={setRepeatPenalty} seed={seed} setSeed={setSeed} keepAlive={keepAlive} setKeepAlive={setKeepAlive} canThink={canThink} thinking={thinking}/>} 
  {tab==='lab'&&<div className="v07-page lab"><section className="v07-card controls"><h3>Model controls</h3><label>Model<select disabled={generation.running} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select model</option>{models.map(m=><option key={m.name}>{m.name}</option>)}</select></label><div className="cap-row">{caps.map(c=><span key={c}>{c}</span>)}</div><Slider label="Context" value={ctx} min={2048} max={maxCtx} step={1024} set={setCtx}/><Slider label="Max output" value={maxOut} min={64} max={4096} step={64} set={setMaxOut}/><Slider label="Temperature" value={temp} min={0} max={2} step={.05} set={setTemp}/><Slider label="Top P" value={topP} min={.1} max={1} step={.05} set={setTopP}/><div className="think"><div><b>Thinking</b><small>{canThink?'Supported by installed model':'Unavailable for this model'}</small></div>{gptOss&&canThink?<select disabled={generation.running} value={thinkLevel} onChange={e=>setThinkLevel(e.target.value as any)}><option>low</option><option>medium</option><option>high</option></select>:<button disabled={!canThink||generation.running} className={thinking?'on':''} onClick={()=>setThinking(v=>canThink?!v:false)}>{canThink?(thinking?'ON':'OFF'):'Unavailable'}</button>}</div><div className="memory"><span>Estimated runtime memory</span><b>{fmt(hardware.estimate)} · {hardware.label}</b></div></section><section className="v07-card playground"><div className="play-head"><div><h3>Streaming playground</h3><small>{generation.phase}</small></div>{generation.speed>0&&<b>{generation.speed.toFixed(1)} tok/s</b>}</div><textarea className="system" value={system} onChange={e=>setSystem(e.target.value)}/><textarea className="prompt" value={prompt} onChange={e=>setPrompt(e.target.value)}/><button className="primary" disabled={!selected||generation.running||modeBusy} onClick={runStream}>{generation.running?'Generating…':'Run'}</button><div className="gen-progress"><div><span>{generation.phase}</span><b>{generation.progress.toFixed(0)}% {generation.tokens?`· ${generation.tokens} tokens`:''}</b></div><i><em style={{width:`${generation.progress}%`}}/></i><small>Progress is estimated while streaming; final tokens/s use Ollama eval_count/eval_duration.</small></div>{trace&&<details open><summary>Thinking trace</summary><pre>{trace}</pre></details>}<div className="answer">{answer||'The response will stream here.'}</div></section></div>}

  {tab==='library'&&<MegaLibrary mode={mode} memoryBytes={memory}/>} 

  {tab==='diagnostics'&&<div className="v07-page"><div className="v07-grid4"><Stat label="Sessions" value={String(load<number>('modeldock-sessions',1))}/><Stat label="Bench runs" value={String(bench.length)}/><Stat label="Avg speed" value={bench.length?`${(bench.reduce((s,b)=>s+b.tokS,0)/bench.length).toFixed(1)} tok/s`:'—'}/><Stat label="Log entries" value={String(logs.length)}/></div><section className="v07-card"><div className="diag-head"><div><h3>Local background log</h3><p>No prompts or model answers are stored here.</p></div><div><button onClick={()=>navigator.clipboard.writeText(logs.map(l=>`${l.at} [${l.level}] ${l.message}`).join('\n'))}>Copy logs</button><button onClick={()=>{setLogs([]);save('modeldock-logs',[])}}>Clear</button></div></div><div className="log-list">{logs.map((l,i)=><div key={`${l.at}-${i}`} className={l.level}><time>{new Date(l.at).toLocaleTimeString()} </time><b>{l.level}</b><span>{l.message}</span></div>)}</div></section><FullLogs/><section className="v07-card"><h3>Benchmark history</h3>{bench.map((b,i)=><div className="bench" key={`${b.at}-${i}`}><span>{b.model}</span><span>{b.ctx/1024}K ctx · {b.mode}</span><b>{b.tokS.toFixed(1)} tok/s</b></div>)}</section></div>}

  {tab==='developer'&&<DeveloperStudio010/>}
  </main>
 </div>
}

function Stat({label,value}:{label:string,value:string}){return <div className="stat"><span>{label}</span><b>{value}</b></div>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}
function Slider({label,value,min,max,step,set}:{label:string,value:number,min:number,max:number,step:number,set:(n:number)=>void}){return <label className="slider"><div><span>{label}</span><b>{Number.isInteger(value)?value.toLocaleString():value.toFixed(2)}</b></div><input type="range" value={value} min={min} max={max} step={step} onChange={e=>set(Number(e.target.value))}/></label>}
