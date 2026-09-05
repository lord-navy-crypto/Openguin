import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { task } from './taskBus';

type Mode='bundled'|'external';
type Installed={name:string;size:number;details?:{parameter_size?:string;quantization_level?:string}};
type Show={capabilities?:string[];details?:{family?:string;parameter_size?:string;quantization_level?:string};model_info?:Record<string,unknown>};
type Catalog={name:string;description:string;capabilities:string[];sizes:string[];sourceUrl:string};
type StreamEvent={requestId:string;thinking:string;content:string;done:boolean;evalCount?:number;evalDuration?:number;error?:string};
type PullEvent={model:string;status:string;percent?:number;done:boolean;cancelled:boolean;error?:string};

const FALLBACK:Catalog[]=[
 {name:'qwen3.8',description:'Qwen multimodal reasoning and agentic family.',capabilities:['vision','tools','thinking'],sizes:['27b'],sourceUrl:'https://ollama.com/library/qwen3.8'},
 {name:'deepseek-r1',description:'Open reasoning model family.',capabilities:['tools','thinking'],sizes:['1.5b','7b','8b','14b','32b','70b'],sourceUrl:'https://ollama.com/library/deepseek-r1'},
 {name:'gpt-oss',description:'Open-weight reasoning and agentic models.',capabilities:['tools','thinking'],sizes:['20b','120b'],sourceUrl:'https://ollama.com/library/gpt-oss'},
 {name:'llama3.1',description:'Meta general-purpose model family.',capabilities:['tools'],sizes:['8b','70b'],sourceUrl:'https://ollama.com/library/llama3.1'},
 {name:'gemma3',description:'Google Gemma multimodal family.',capabilities:['vision'],sizes:['1b','4b','12b','27b'],sourceUrl:'https://ollama.com/library/gemma3'},
 {name:'nomic-embed-text',description:'Text embedding model.',capabilities:['embedding'],sizes:[],sourceUrl:'https://ollama.com/library/nomic-embed-text'},
];

const api=(mode:Mode,method:string,path:string,body?:unknown)=>invoke<any>('ollama_json',{mode,method,path,body:body??null});

export default function SmartLab(){
 const [open,setOpen]=useState(false),[page,setPage]=useState<'lab'|'library'>('lab');
 const [mode,setMode]=useState<Mode>('bundled'),modeRef=useRef<Mode>('bundled');
 const refreshSeq=useRef(0),inspectSeq=useRef(0),catalogSeq=useRef(0),activeGenerationRef=useRef(''),installingRef=useRef('');
 const [models,setModels]=useState<Installed[]>([]),[model,setModel]=useState('');
 const [caps,setCaps]=useState<string[]>([]),[ctx,setCtx]=useState(8192),[maxOut,setMaxOut]=useState(512),[temp,setTemp]=useState(.7);
 const [thinking,setThinking]=useState(false),[thinkLevel,setThinkLevel]=useState<'low'|'medium'|'high'>('medium');
 const [prompt,setPrompt]=useState('Explain this clearly and concisely.'),[answer,setAnswer]=useState(''),[trace,setTrace]=useState('');
 const [running,setRunning]=useState(false),[progress,setProgress]=useState(0),[generated,setGenerated]=useState(0),[speed,setSpeed]=useState(0),[phase,setPhase]=useState('Idle'),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[catalog,setCatalog]=useState<Catalog[]>(FALLBACK),[catalogBusy,setCatalogBusy]=useState(false),[installing,setInstalling]=useState('');
 const canThink=caps.includes('thinking'),gptOss=model.toLowerCase().startsWith('gpt-oss');
 const filtered=useMemo(()=>catalog.filter(x=>`${x.name} ${x.capabilities.join(' ')} ${x.description}`.toLowerCase().includes(query.toLowerCase())),[catalog,query]);

 function applyModels(rows:Installed[]){setModels(rows);setModel(current=>current&&rows.some(m=>m.name===current)?current:(rows[0]?.name??''));}
 async function probe(which:Mode){const t=await api(which,'GET','/api/tags');return(t.models??[]) as Installed[];}
 async function refresh(preferred=modeRef.current){
  const token=++refreshSeq.current;
  try{const rows=await probe(preferred);if(token!==refreshSeq.current)return;modeRef.current=preferred;setMode(preferred);applyModels(rows);setError('');return}
  catch(first){
   const fallback:Mode=preferred==='bundled'?'external':'bundled';
   try{const rows=await probe(fallback);if(token!==refreshSeq.current)return;modeRef.current=fallback;setMode(fallback);applyModels(rows);setError(`${preferred} runtime was unavailable; Smart Lab switched to ${fallback}.`)}
   catch{if(token===refreshSeq.current)setError(`No Ollama runtime is responding. ${first}`)}
  }
 }
 async function switchMode(next:Mode){
  if(running){setError('Finish the current generation before switching engines.');return}
  const token=++refreshSeq.current;setError('');
  try{const rows=await probe(next);if(token!==refreshSeq.current)return;modeRef.current=next;setMode(next);setCaps([]);setThinking(false);applyModels(rows)}catch(e){if(token===refreshSeq.current)setError(`${next} runtime is not ready, so Smart Lab kept ${modeRef.current}. ${e}`)}
 }
 async function inspect(name:string){
  const token=++inspectSeq.current,which=modeRef.current;
  if(!name){setCaps([]);return}
  try{const d=await api(which,'POST','/api/show',{model:name}) as Show;if(token!==inspectSeq.current||which!==modeRef.current)return;setCaps(d.capabilities??[]);const info=d.model_info??{};const contextEntry=Object.entries(info).find(([k])=>k.endsWith('.context_length'));if(contextEntry&&typeof contextEntry[1]==='number')setCtx(Math.min(Number(contextEntry[1]),32768));setThinking((d.capabilities??[]).includes('thinking'));setError('')}
  catch(e){if(token!==inspectSeq.current||which!==modeRef.current)return;setCaps([]);setError(String(e))}
 }
 async function loadCatalog(){
  const token=++catalogSeq.current;setCatalogBusy(true);
  try{const rows=await invoke<Catalog[]>('official_ollama_catalog',{sort:'popular',query:query||null});if(token!==catalogSeq.current)return;setCatalog(rows.length?rows:FALLBACK);setError('')}
  catch(e){if(token!==catalogSeq.current)return;setError(`Official catalog refresh failed; cached fallback remains available. ${e}`)}
  finally{if(token===catalogSeq.current)setCatalogBusy(false)}
 }
 useEffect(()=>{if(open)void refresh();else{refreshSeq.current++;inspectSeq.current++;catalogSeq.current++}},[open]);
 useEffect(()=>{
  let off:(()=>void)|undefined;
  listen<PullEvent>('modeldock://pull-progress',e=>{
   const p=e.payload,current=installingRef.current;
   if(!current||!(p.model===current||p.model.startsWith(`${current}:`)))return;
   if(p.done||p.error||p.cancelled){
    installingRef.current='';setInstalling('');
    if(p.error)setError(p.error);else if(p.cancelled)setError('Install cancelled.');else{setError('');void refresh(modeRef.current)}
   }
  }).then(x=>off=x);
  return()=>{refreshSeq.current++;inspectSeq.current++;catalogSeq.current++;off?.()}
 },[]);
 useEffect(()=>{if(model)void inspect(model);else setCaps([])},[model,mode]);

 async function streamRun(){
  if(!model||activeGenerationRef.current)return;
  const requestId=crypto.randomUUID(),runModel=model,runMode=modeRef.current,runCtx=ctx,runMax=maxOut,runTemp=temp;
  activeGenerationRef.current=requestId;setRunning(true);setAnswer('');setTrace('');setGenerated(0);setSpeed(0);setProgress(1);setPhase(canThink&&thinking?'Thinking':'Starting');setError('');
  const thinkValue=gptOss&&canThink?thinkLevel:(canThink?thinking:false);let chunks=0;let unlisten:(()=>void)|null=null;
  try{
   unlisten=await listen<StreamEvent>('modeldock://chat-stream',e=>{const p=e.payload;if(p.requestId!==requestId||activeGenerationRef.current!==requestId)return;if(p.error){setError(p.error);setPhase('Failed');setRunning(false);activeGenerationRef.current='';unlisten?.();return}if(p.thinking){setPhase('Thinking');setTrace(v=>v+p.thinking)}if(p.content){setPhase('Answering');setAnswer(v=>v+p.content);chunks++;setGenerated(chunks);setProgress(Math.min(96,Math.max(2,(chunks/runMax)*100)))}if(p.done){const exact=p.evalCount??chunks,tokS=p.evalDuration?exact/(p.evalDuration/1e9):0;setGenerated(exact);setSpeed(tokS);setProgress(100);setPhase(`Done · ${exact} tokens`);setRunning(false);activeGenerationRef.current='';task({id:`smartlab:${requestId}`,title:`Smart Lab · ${runModel}`,source:'Smart Lab',detail:tokS?`${exact} tokens · ${tokS.toFixed(1)} tok/s`:`${exact} tokens`,state:'done',percent:100,progressKind:'real'});unlisten?.()}});
   task({id:`smartlab:${requestId}`,title:`Smart Lab · ${runModel}`,source:'Smart Lab',detail:`${runMode} · ${runCtx.toLocaleString()} ctx`,state:'running',percent:2,progressKind:'stage'});
   await invoke('chat_stream',{mode:runMode,requestId,body:{model:runModel,messages:[{role:'user',content:prompt}],stream:true,think:thinkValue,options:{num_ctx:runCtx,num_predict:runMax,temperature:runTemp}}});
  }catch(e){unlisten?.();if(activeGenerationRef.current===requestId)activeGenerationRef.current='';setRunning(false);setError(String(e));setPhase('Failed');task({id:`smartlab:${requestId}`,title:`Smart Lab · ${runModel}`,source:'Smart Lab',detail:String(e),state:'failed',percent:100,progressKind:'stage'})}
 }
 async function install(name:string){
  if(installingRef.current){setError(`${installingRef.current} is already being installed.`);return}
  installingRef.current=name;setInstalling(name);setError('');task({id:`smartlab-install:${name}`,title:`Install ${name}`,source:'Smart Lab',detail:'Starting Ollama pull…',state:'running',percent:2,progressKind:'real',cancellable:true,cancelKind:'pull',cancelTarget:name});
  invoke('pull_model',{mode:modeRef.current,model:name}).catch(e=>{installingRef.current='';setInstalling('');setError(String(e));task({id:`smartlab-install:${name}`,title:`Install ${name}`,source:'Smart Lab',detail:String(e),state:'failed',percent:100,progressKind:'real'})});
 }

 return <>
  <button className="smartlab-fab" onClick={()=>setOpen(v=>!v)}>Lab+</button>
  {open&&<div className="smartlab-panel">
   <div className="smartlab-head"><div><b>Smart Lab</b><small> capability-aware · validated streaming</small></div><button onClick={()=>setOpen(false)}>×</button></div>
   <div className="smartlab-tabs"><button className={page==='lab'?'active':''} onClick={()=>setPage('lab')}>Model Lab</button><button className={page==='library'?'active':''} onClick={()=>{setPage('library');void loadCatalog()}}>Official Library</button></div>
   {error&&<div className="smartlab-error">{error}</div>}
   {page==='lab'?<div className="smartlab-body">
    <label>Engine<select disabled={running} value={mode} onChange={e=>void switchMode(e.target.value as Mode)}><option value="bundled">Bundled :11435</option><option value="external">External :11434</option></select></label>
    <label>Model<select disabled={running} value={model} onChange={e=>setModel(e.target.value)}><option value="">Select model</option>{models.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select></label>
    <div className="smartlab-caps"><span>Capabilities</span>{caps.length?caps.map(c=><b key={c}>{c}</b>):<em>not reported</em>}</div>
    <label>Context <b>{ctx.toLocaleString()}</b><input disabled={running} type="range" min="2048" max="32768" step="1024" value={ctx} onChange={e=>setCtx(Number(e.target.value))}/></label>
    <label>Max output <b>{maxOut}</b><input disabled={running} type="range" min="64" max="2048" step="64" value={maxOut} onChange={e=>setMaxOut(Number(e.target.value))}/></label>
    <label>Temperature <b>{temp.toFixed(2)}</b><input disabled={running} type="range" min="0" max="2" step="0.05" value={temp} onChange={e=>setTemp(Number(e.target.value))}/></label>
    <div className="thinking-control"><div><b>Thinking mode</b><small>{canThink?'Supported by this model':'This model does not report thinking capability'}</small></div>{gptOss&&canThink?<select disabled={running} value={thinkLevel} onChange={e=>setThinkLevel(e.target.value as any)}><option>low</option><option>medium</option><option>high</option></select>:<button disabled={!canThink||running} className={thinking&&canThink?'on':''} onClick={()=>canThink&&setThinking(v=>!v)}>{canThink?(thinking?'ON':'OFF'):'Unavailable'}</button>}</div>
    <textarea className="smartlab-prompt" value={prompt} onChange={e=>setPrompt(e.target.value)} />
    <button className="smartlab-run" disabled={!model||running} onClick={streamRun}>{running?'Generating…':'Run streaming'}</button>
    <div className="generation-status"><div><span>{phase}</span><b>{progress.toFixed(0)}% · {generated}/{maxOut} output tokens*{speed?` · ${speed.toFixed(1)} tok/s`:''}</b></div><div className="smartlab-progress"><i style={{width:`${progress}%`}}/></div><small>*Streaming progress uses received chunks; final token count and speed use Ollama eval_count/eval_duration.</small></div>
    {trace&&<details className="thinking-trace" open><summary>Thinking trace</summary><pre>{trace}</pre></details>}
    <div className="smartlab-answer">{answer||'The answer will stream here as it is generated.'}</div>
   </div>:<div className="smartlab-body"><div className="official-note">Official Ollama catalog through the same validated backend used by the main Library. Search by model or capability.</div><div className="catalog-search"><input placeholder="Search qwen, thinking, vision…" value={query} onChange={e=>setQuery(e.target.value)}/><button disabled={catalogBusy} onClick={()=>void loadCatalog()}>{catalogBusy?'Syncing…':'Sync'}</button></div><div className="catalog-grid">{filtered.map(m=><div className="catalog-card" key={m.name}><div><b>{m.name}</b><small>{m.sizes.join(' · ')||'default/latest'}</small></div><p>{m.description}</p><div className="catalog-tags">{m.capabilities.map(t=><span key={t}>{t}</span>)}</div><button disabled={!!installing} onClick={()=>install(m.name)}>{installing===m.name?'Installing…':'Install'}</button></div>)}</div></div>}
  </div>}
 </>;
}
