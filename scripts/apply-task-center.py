#!/usr/bin/env python3
from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
p=root/'src'/'App07.tsx'
t=p.read_text()

# macOS default filesystems are case-insensitive, so the event bus must not be
# named taskCenter.ts next to the TaskCenter.tsx component.
t=t.replace("import {task} from './taskCenter';","import {task} from './taskBus';")
if "import {task} from './taskBus';" not in t:
    t=t.replace("import './app07.css';", "import './app07.css';\nimport {task} from './taskBus';")

old="async function switchMode(next:Mode){modeRef.current=next;setMode(next);setNotice('');if(next==='bundled'){try{await invoke('start_bundled_ollama');await refresh('bundled');log('info','Bundled Ollama started and passed readiness check.')}catch(e){const d=await discover();if(d?.externalRunning){modeRef.current='external';setMode('external');await refresh('external');setNotice('Bundled runtime failed readiness; automatically switched to your running external Ollama.');log('warn',`Bundled failed, external fallback active: ${e}`)}else{setNotice(String(e));log('error',`Bundled startup failed: ${e}`)}}}else{try{await invoke('stop_bundled_ollama')}catch{}await refresh('external');log('info','Switched to external Ollama.')}await discover();}"
new="async function switchMode(next:Mode){const taskId=`runtime:switch:${next}`;task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'Starting runtime transition…',state:'running',percent:8,progressKind:'stage'});modeRef.current=next;setMode(next);setNotice('');if(next==='bundled'){try{task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'Starting bundled Ollama…',state:'running',percent:35,progressKind:'stage'});await invoke('start_bundled_ollama');task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'Checking readiness and models…',state:'running',percent:72,progressKind:'stage'});await refresh('bundled');log('info','Bundled Ollama started and passed readiness check.');task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'Bundled runtime ready',state:'done',percent:100,progressKind:'stage'})}catch(e){const d=await discover();if(d?.externalRunning){modeRef.current='external';setMode('external');await refresh('external');setNotice('Bundled runtime failed readiness; automatically switched to your running external Ollama.');log('warn',`Bundled failed, external fallback active: ${e}`);task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'Bundled failed; external fallback active',state:'failed',percent:100,progressKind:'stage'})}else{setNotice(String(e));log('error',`Bundled startup failed: ${e}`);task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:String(e),state:'failed',percent:100,progressKind:'stage'})}}}else{try{task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'Stopping private runtime…',state:'running',percent:42,progressKind:'stage'});await invoke('stop_bundled_ollama')}catch{}await refresh('external');log('info','Switched to external Ollama.');task({id:taskId,title:`Switch runtime → ${next}`,source:'Runtime selector',detail:'External Ollama selected',state:'done',percent:100,progressKind:'stage'})}await discover();}"
t=t.replace(old,new)

# These replacements are one-way: once instrumented, their original anchors no
# longer exist, so repeated desktop:prepare runs do not duplicate them.
t=t.replace("const requestId=crypto.randomUUID();setAnswer('');", "const requestId=crypto.randomUUID();const taskId=`chat:${requestId}`;task({id:taskId,title:`Generate · ${selected}`,source:'Model Lab',detail:'Preparing model request…',state:'running',percent:2,progressKind:'stage'});setAnswer('');")
t=t.replace("if(p.thinking){setTrace", "if(p.thinking){task({id:taskId,title:`Generate · ${selected}`,source:'Model Lab',detail:'Thinking…',state:'running',percent:Math.max(8,generation.progress),progressKind:'stage'});setTrace")
t=t.replace("if(p.content){setAnswer", "if(p.content){task({id:taskId,title:`Generate · ${selected}`,source:'Model Lab',detail:'Streaming answer…',state:'running',percent:Math.min(96,Math.max(12,4+chunks/Math.max(1,maxOut)*92)),progressKind:'stage'});setAnswer")
t=t.replace("log('info',`Inference ${selected}: ${tokens} tokens, ${speed.toFixed(1)} tok/s`);unlisten();", "log('info',`Inference ${selected}: ${tokens} tokens, ${speed.toFixed(1)} tok/s`);task({id:taskId,title:`Generate · ${selected}`,source:'Model Lab',detail:`${tokens} tokens · ${speed.toFixed(1)} tok/s`,state:'done',percent:100,progressKind:'stage'});unlisten();")
t=t.replace("setNotice(String(e));log('error',`Inference failed: ${e}`)}}", "setNotice(String(e));log('error',`Inference failed: ${e}`);task({id:taskId,title:`Generate · ${selected}`,source:'Model Lab',detail:String(e),state:'failed',percent:100,progressKind:'stage'})}}")

t=t.replace("async function loadCatalog(){setCatalogLoading(true);try{", "async function loadCatalog(){const taskId='catalog:sync';task({id:taskId,title:'Sync official model catalog',source:'Library',detail:'Contacting Ollama Library…',state:'running',percent:12,progressKind:'stage'});setCatalogLoading(true);try{")
t=t.replace("log('info',`Official Ollama catalog refreshed: ${rows.length} models.`)", "log('info',`Official Ollama catalog refreshed: ${rows.length} models.`);task({id:taskId,title:'Sync official model catalog',source:'Library',detail:`${rows.length} models loaded`,state:'done',percent:100,progressKind:'stage'})")
t=t.replace("log('warn',`Catalog refresh failed: ${e}`)}finally", "log('warn',`Catalog refresh failed: ${e}`);task({id:taskId,title:'Sync official model catalog',source:'Library',detail:String(e),state:'failed',percent:100,progressKind:'stage'})}finally")
t=t.replace("setPulls(p=>({...p,[name]:{model:name,status:'Starting',done:false,cancelled:false}}));invoke('pull_model'", "task({id:`pull:${name}`,title:`Install ${name}`,source:'Library',detail:'Queued for Ollama pull',state:'queued',percent:0,progressKind:'real',cancellable:true,cancelKind:'pull',cancelTarget:name});setPulls(p=>({...p,[name]:{model:name,status:'Starting',done:false,cancelled:false}}));invoke('pull_model'")
t=t.replace("async function searchHf(){setBusy(true);try{", "async function searchHf(){const taskId='hf:search';task({id:taskId,title:'Search Hugging Face GGUF',source:'Library',detail:hfQuery,state:'running',percent:20,progressKind:'stage'});setBusy(true);try{")
t=t.replace("setHf(await invoke('search_huggingface',{query:hfQuery,limit:30}))", "setHf(await invoke('search_huggingface',{query:hfQuery,limit:30}));task({id:taskId,title:'Search Hugging Face GGUF',source:'Library',detail:'Search complete',state:'done',percent:100,progressKind:'stage'})")
t=t.replace("}catch(e){setNotice(String(e))}finally{setBusy(false)}}", "}catch(e){setNotice(String(e));task({id:taskId,title:'Search Hugging Face GGUF',source:'Library',detail:String(e),state:'failed',percent:100,progressKind:'stage'})}finally{setBusy(false)}}",1)

# Canonicalize the whole HF import function on every run. This is intentionally
# idempotent because desktop:prepare can execute more than once in the same CI
# job. Restrict hfModel to this function so JSX elsewhere keeps hfSelected.
canonical_import = """async function importHf(v:Variant){if(!hfSelected)return;const hfModel=hfSelected;const model=`${hfModel.id.split('/').pop()}:${v.quantization.toLowerCase().replaceAll('_','-')}`,id=`${hfModel.id}:${v.filename}`;task({id:`import:${id}`,title:`Import ${model}`,source:'Hugging Face GGUF',detail:'Queued for verified import',state:'queued',percent:0,progressKind:'real',cancellable:true,cancelKind:'import',cancelTarget:id});invoke('import_hf_gguf',{mode:modeRef.current,repoId:hfModel.id,filename:v.filename,model,license:hfModel.cardData?.license??null,expectedSha256:v.sha256??null}).catch(e=>setNotice(String(e)));setImports(p=>({...p,[id]:{importId:id,repoId:hfModel.id,filename:v.filename,model,stage:'start',status:'Starting',done:false,cancelled:false}}));}"""
pattern = r"async function importHf\(v:Variant\)\{.*?\}\n async function removeModel"
m = re.search(pattern, t, flags=re.S)
if not m:
    raise SystemExit('Could not locate importHf function; refusing a partial Task Center patch.')
t = t[:m.start()] + canonical_import + "\n async function removeModel" + t[m.end():]

p.write_text(t)
print('Applied Openguin floating Task Center instrumentation to main long-running actions (idempotent).')
