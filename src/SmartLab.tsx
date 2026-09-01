import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Mode='bundled'|'external';
type Installed={name:string;size:number;details?:{parameter_size?:string;quantization_level?:string}};
type Show={capabilities?:string[];details?:{family?:string;parameter_size?:string;quantization_level?:string};model_info?:Record<string,unknown>};
type Catalog={name:string;tags:string[];sizes:string;description:string};

const OFFICIAL:Catalog[]=[
 {name:'qwen3.8-flash-next',tags:['vision','tools','thinking'],sizes:'latest',description:'Experimental Qwen next-generation preview.'},
 {name:'qwen3.8',tags:['vision','tools','thinking'],sizes:'27b',description:'Qwen multimodal reasoning and agentic family.'},
 {name:'qwen3-vl',tags:['vision','tools','thinking'],sizes:'2b · 4b · 8b · 30b · 32b · 235b',description:'Qwen vision-language family.'},
 {name:'qwen3-next',tags:['tools','thinking'],sizes:'80b',description:'Efficient Qwen3-Next family.'},
 {name:'qwen3-coder',tags:['tools'],sizes:'30b · 480b',description:'Qwen long-context coding models.'},
 {name:'deepseek-r1',tags:['tools','thinking'],sizes:'1.5b · 7b · 8b · 14b · 32b · 70b · 671b',description:'Open reasoning model family.'},
 {name:'deepseek-v3.1',tags:['tools','thinking'],sizes:'671b',description:'Hybrid thinking/non-thinking model.'},
 {name:'gpt-oss',tags:['tools','thinking'],sizes:'20b · 120b',description:'Open-weight reasoning and agentic models.'},
 {name:'granite4.2',tags:['tools','thinking'],sizes:'3b · 8b · 30b',description:'IBM Granite enterprise-ready family.'},
 {name:'llama3.1',tags:['tools'],sizes:'8b · 70b · 405b',description:'Meta Llama 3.1 family.'},
 {name:'llama3.2',tags:[],sizes:'1b · 3b',description:'Compact Meta Llama 3.2 family.'},
 {name:'llama3.2-vision',tags:['vision'],sizes:'11b · 90b',description:'Meta Llama 3.2 vision family.'},
 {name:'llama3.3',tags:[],sizes:'70b',description:'Meta Llama 3.3 multilingual model.'},
 {name:'gemma3',tags:['vision'],sizes:'270m · 1b · 4b · 12b · 27b',description:'Google Gemma 3 family.'},
 {name:'mistral',tags:['tools'],sizes:'7b',description:'Mistral general-purpose model.'},
 {name:'mistral-nemo',tags:['tools'],sizes:'12b',description:'Mistral/NVIDIA 128K-context model.'},
 {name:'mistral-small3.2',tags:['vision','tools'],sizes:'24b',description:'Mistral Small update for tools and vision.'},
 {name:'mixtral',tags:['tools'],sizes:'8x7b · 8x22b',description:'Mistral mixture-of-experts family.'},
 {name:'qwq',tags:['thinking'],sizes:'32b',description:'Qwen reasoning model.'},
 {name:'nomic-embed-text',tags:['embedding'],sizes:'latest',description:'Text embedding model.'},
 {name:'embeddinggemma',tags:['embedding'],sizes:'300m',description:'Google compact embedding model.'},
 {name:'all-minilm',tags:['embedding'],sizes:'22m · 33m',description:'Sentence embedding family.'},
 {name:'smollm',tags:[],sizes:'135m · 360m · 1.7b',description:'Small local language model family.'},
 {name:'glm-5.3-flash',tags:['vision','tools','thinking','cloud'],sizes:'latest',description:'Z.ai multimodal agentic model.'},
 {name:'glm-5.3',tags:['tools','thinking','cloud'],sizes:'latest',description:'Z.ai flagship coding/agentic model.'},
 {name:'nemotron-3.5-lightning',tags:['tools','thinking'],sizes:'30b',description:'NVIDIA efficient agent model.'},
 {name:'muse-glimmer',tags:['vision','tools','thinking'],sizes:'30b',description:'Open model for local agents.'},
];

const api=(mode:Mode,method:string,path:string,body?:unknown)=>invoke<any>('ollama_json',{mode,method,path,body:body??null});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

export default function SmartLab(){
 const [open,setOpen]=useState(false),[page,setPage]=useState<'lab'|'library'>('lab');
 const [mode,setMode]=useState<Mode>('bundled'),[models,setModels]=useState<Installed[]>([]),[model,setModel]=useState('');
 const [caps,setCaps]=useState<string[]>([]),[ctx,setCtx]=useState(8192),[maxOut,setMaxOut]=useState(512),[temp,setTemp]=useState(.7);
 const [thinking,setThinking]=useState(false),[thinkLevel,setThinkLevel]=useState<'low'|'medium'|'high'>('medium');
 const [prompt,setPrompt]=useState('Explain this clearly and concisely.'),[answer,setAnswer]=useState(''),[trace,setTrace]=useState('');
 const [running,setRunning]=useState(false),[progress,setProgress]=useState(0),[generated,setGenerated]=useState(0),[phase,setPhase]=useState('Idle'),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[installing,setInstalling]=useState('');
 const canThink=caps.includes('thinking');
 const gptOss=model.toLowerCase().startsWith('gpt-oss');
 const filtered=useMemo(()=>OFFICIAL.filter(x=>`${x.name} ${x.tags.join(' ')} ${x.description}`.toLowerCase().includes(query.toLowerCase())),[query]);

 async function refresh(){
  for(const candidate of [mode,mode==='bundled'?'external':'bundled'] as Mode[]){
   try{const t=await api(candidate,'GET','/api/tags');setMode(candidate);setModels(t.models??[]);if(!model&&t.models?.[0])setModel(t.models[0].name);setError('');return}catch{}
  }
  setError('No Ollama runtime is responding yet.');
 }
 async function inspect(name:string){
  if(!name){setCaps([]);return}
  try{const d=await api(mode,'POST','/api/show',{model:name}) as Show;setCaps(d.capabilities??[]);const info=d.model_info??{};const contextEntry=Object.entries(info).find(([k])=>k.endsWith('.context_length'));if(contextEntry&&typeof contextEntry[1]==='number')setCtx(Math.min(Number(contextEntry[1]),32768));setThinking((d.capabilities??[]).includes('thinking'));setError('')}catch(e){setCaps([]);setError(String(e))}
 }
 useEffect(()=>{if(open)refresh()},[open]);
 useEffect(()=>{if(model)inspect(model)},[model,mode]);

 async function streamRun(){
  if(!model||running)return;setRunning(true);setAnswer('');setTrace('');setGenerated(0);setProgress(1);setPhase(canThink&&thinking?'Thinking':'Starting');setError('');
  const port=mode==='bundled'?11435:11434;
  const thinkValue=gptOss?thinkLevel:(canThink?thinking:false);
  try{
   const response=await fetch(`http://127.0.0.1:${port}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:prompt}],stream:true,think:thinkValue,options:{num_ctx:ctx,num_predict:maxOut,temperature:temp}})});
   if(!response.ok||!response.body)throw new Error(`Ollama stream failed: HTTP ${response.status}`);
   const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',chunks=0;
   while(true){
    const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});
    while(pending.includes('\n')){const i=pending.indexOf('\n'),line=pending.slice(0,i).trim();pending=pending.slice(i+1);if(!line)continue;const part=JSON.parse(line);const t=part.message?.thinking||'',c=part.message?.content||'';if(t){setPhase('Thinking');setTrace(v=>v+t)}if(c){setPhase('Answering');setAnswer(v=>v+c)}if(t||c){chunks++;setGenerated(chunks);setProgress(Math.min(96,Math.max(2,(chunks/maxOut)*100)))}if(part.done){const exact=Number(part.eval_count||chunks);setGenerated(exact);setProgress(100);setPhase(`Done · ${exact} tokens`);if(part.eval_duration){const tokS=exact/(Number(part.eval_duration)/1e9);window.dispatchEvent(new CustomEvent('modeldock:diagnostic',{detail:{level:'info',message:`Smart Lab completed ${model}: ${exact} tokens, ${tokS.toFixed(1)} tok/s`}}))}}}
   }
  }catch(e){setError(String(e));setPhase('Failed');
   try{const fallback=await api(mode,'POST','/api/chat',{model,messages:[{role:'user',content:prompt}],stream:false,think:thinkValue,options:{num_ctx:ctx,num_predict:maxOut,temperature:temp}});setTrace(fallback.message?.thinking||'');setAnswer(fallback.message?.content||fallback.response||'');setGenerated(fallback.eval_count??0);setProgress(100);setPhase('Done · non-stream fallback');setError('Direct stream was unavailable, so ModelDock used its secure Tauri bridge.')}catch(e2){setError(`${e} / fallback: ${e2}`)}
  }finally{setRunning(false)}
 }
 async function install(name:string){setInstalling(name);setError('');try{invoke('pull_model',{mode,model:name}).catch(e=>setError(String(e)));for(let i=0;i<120;i++){await sleep(1000);try{const t=await api(mode,'GET','/api/tags');if((t.models??[]).some((m:Installed)=>m.name===name||m.name.startsWith(`${name}:`))){setModels(t.models??[]);setInstalling('');return}}catch{}}setError('Install is still running in the background. Check Library/Diagnostics.')}finally{setInstalling('')}}

 return <>
  <button className="smartlab-fab" onClick={()=>setOpen(v=>!v)}>Lab+</button>
  {open&&<div className="smartlab-panel">
   <div className="smartlab-head"><div><b>Smart Lab</b><small> capability-aware · streaming</small></div><button onClick={()=>setOpen(false)}>×</button></div>
   <div className="smartlab-tabs"><button className={page==='lab'?'active':''} onClick={()=>setPage('lab')}>Model Lab</button><button className={page==='library'?'active':''} onClick={()=>setPage('library')}>Official Library</button></div>
   {error&&<div className="smartlab-error">{error}</div>}
   {page==='lab'?<div className="smartlab-body">
    <label>Engine<select value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="bundled">Bundled :11435</option><option value="external">External :11434</option></select></label>
    <label>Model<select value={model} onChange={e=>setModel(e.target.value)}><option value="">Select model</option>{models.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select></label>
    <div className="smartlab-caps"><span>Capabilities</span>{caps.length?caps.map(c=><b key={c}>{c}</b>):<em>not reported</em>}</div>
    <label>Context <b>{ctx.toLocaleString()}</b><input type="range" min="2048" max="32768" step="1024" value={ctx} onChange={e=>setCtx(Number(e.target.value))}/></label>
    <label>Max output <b>{maxOut}</b><input type="range" min="64" max="2048" step="64" value={maxOut} onChange={e=>setMaxOut(Number(e.target.value))}/></label>
    <label>Temperature <b>{temp.toFixed(2)}</b><input type="range" min="0" max="2" step="0.05" value={temp} onChange={e=>setTemp(Number(e.target.value))}/></label>
    <div className="thinking-control"><div><b>Thinking mode</b><small>{canThink?'Supported by this model':'This model does not report thinking capability'}</small></div>{gptOss&&canThink?<select value={thinkLevel} onChange={e=>setThinkLevel(e.target.value as any)}><option>low</option><option>medium</option><option>high</option></select>:<button disabled={!canThink} className={thinking&&canThink?'on':''} onClick={()=>canThink&&setThinking(v=>!v)}>{canThink?(thinking?'ON':'OFF'):'Unavailable'}</button>}</div>
    <textarea className="smartlab-prompt" value={prompt} onChange={e=>setPrompt(e.target.value)} />
    <button className="smartlab-run" disabled={!model||running} onClick={streamRun}>{running?'Generating…':'Run streaming'}</button>
    <div className="generation-status"><div><span>{phase}</span><b>{progress.toFixed(0)}% · {generated}/{maxOut} output tokens*</b></div><div className="smartlab-progress"><i style={{width:`${progress}%`}}/></div><small>*During streaming this is an estimate from received chunks; the final token count uses Ollama eval_count.</small></div>
    {trace&&<details className="thinking-trace" open><summary>Thinking trace</summary><pre>{trace}</pre></details>}
    <div className="smartlab-answer">{answer||'The answer will stream here as it is generated.'}</div>
   </div>:<div className="smartlab-body"><div className="official-note">Official Ollama catalog seed · refreshed from the public Ollama library for this release. Search by model or capability.</div><input className="catalog-search" placeholder="Search qwen, thinking, vision…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="catalog-grid">{filtered.map(m=><div className="catalog-card" key={m.name}><div><b>{m.name}</b><small>{m.sizes}</small></div><p>{m.description}</p><div className="catalog-tags">{m.tags.map(t=><span key={t}>{t}</span>)}</div><button disabled={installing===m.name} onClick={()=>install(m.name)}>{installing===m.name?'Installing…':'Install'}</button></div>)}</div></div>}
  </div>}
 </>;
}
