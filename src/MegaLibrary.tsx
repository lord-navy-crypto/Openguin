import {useEffect,useMemo,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {task} from './taskBus';
import LibraryCapacityPanel013 from './LibraryCapacityPanel013';
import LibraryPortfolio013 from './LibraryPortfolio013';
import {addLibraryPortfolioItem013} from './libraryPortfolioStore013';
import {assessLibraryVariant013,largestFeasibleVariant013,type LibraryPolicy013} from './libraryResourcePolicy013';
import './mega-library.css';

type Mode='bundled'|'external';
type Indexed={id:string;name:string;source:string;publisher:string;description:string;license?:string;tags:string[];downloads?:number;likes?:number;installable:boolean;risk:string;format:string;url:string};
type V={id:string;label:string;sizeBytes?:number;context?:string;quantization?:string;source:string;installKind:string;license?:string;url:string};
type HFVariant={filename:string;size:number;quantization:string;sha256?:string;sourceUrl:string};
type CacheRow={at:number;rows:Indexed[]};
type Profile={chip:string;memoryBytes:number;freeStorageBytes:number};
type Installed={name:string;size?:number};
const GB=1024**3,CACHE='openguin-global-index-v2',CACHE_TTL=15*60*1000;
const fmt=(n?:number)=>!n?'—':n>=GB?`${(n/GB).toFixed(n>=10*GB?1:2)} GB`:`${Math.round(n/1024/1024)} MB`;
const quick=['Qwen','DeepSeek','GLM','MiniMax','InternLM','Yi','Baichuan','Llama','Mistral','Gemma'];
function cacheKey(source:string,q:string){return`${source}:${q.trim().toLowerCase()||'__popular__'}`}
function readCache():Record<string,CacheRow>{try{const v=JSON.parse(localStorage.getItem(CACHE)||'{}');return v&&typeof v==='object'?v:{}}catch{return{}}}
function writeCache(key:string,rows:Indexed[]){const all=readCache();all[key]={at:Date.now(),rows};const trimmed=Object.fromEntries(Object.entries(all).sort((a,b)=>b[1].at-a[1].at).slice(0,16));localStorage.setItem(CACHE,JSON.stringify(trimmed))}
function capacityLabel(state:string){return state==='feasible'?'Feasible':state==='runtime-constrained'?'Run constrained':state==='storage-constrained'?'Storage constrained':state==='both-constrained'?'Storage + runtime constrained':'Capacity unknown'}
function capacityScore(state:string){return state==='feasible'?4:state==='runtime-constrained'?2:state==='storage-constrained'||state==='both-constrained'?1:0}

export default function MegaLibrary({mode,memoryBytes}:{mode:Mode;memoryBytes:number}){
 const [q,setQ]=useState(''),[source,setSource]=useState('all'),[rows,setRows]=useState<Indexed[]>([]),[loading,setLoading]=useState(false),[selected,setSelected]=useState<Indexed|null>(null),[vars,setVars]=useState<V[]>([]),[vloading,setVloading]=useState(false),[notice,setNotice]=useState(''),[trustedOnly,setTrustedOnly]=useState(false),[sort,setSort]=useState<'relevance'|'popular'>('relevance'),[installing,setInstalling]=useState('');
 const [capacityProfile,setCapacityProfile]=useState<Profile|null>(null),[installed,setInstalled]=useState<Installed[]>([]),[capacityRefreshing,setCapacityRefreshing]=useState(false),[capacityNotice,setCapacityNotice]=useState('');
 const [capacityContext,setCapacityContext]=useState(8192),[capacityPolicy,setCapacityPolicy]=useState<LibraryPolicy013>('balanced'),[reserveGb,setReserveGb]=useState(10);
 const searchSeq=useRef(0),variantSeq=useRef(0);
 async function search(query=q,src=source){
  const seq=++searchSeq.current,key=cacheKey(src,query),cached=readCache()[key];
  setLoading(true);setNotice('');
  if(cached?.rows?.length){setRows(cached.rows);if(Date.now()-cached.at>CACHE_TTL)setNotice('Showing cached results while the global index refreshes.');}
  task({id:'global-index',title:'Search global model index',source:'Library',detail:`${src} · ${query||'popular models'}`,state:'running',percent:10,progressKind:'stage'});
  try{
   const r=await invoke<Indexed[]>('universal_model_search',{query:query||null,source:src,limit:90});
   if(seq!==searchSeq.current)return;
   setRows(r);writeCache(key,r);setNotice('');
   task({id:'global-index',title:'Search global model index',source:'Library',detail:`${r.length} fresh results from indexed sources`,state:'done',percent:100,progressKind:'stage'});
  }catch(e){
   if(seq!==searchSeq.current)return;
   if(cached?.rows?.length){setRows(cached.rows);setNotice(`Index refresh failed; cached results remain available. ${e}`);task({id:'global-index',title:'Search global model index',source:'Library',detail:'Refresh failed · cached results preserved',state:'done',percent:100,progressKind:'stage'})}
   else{setNotice(String(e));task({id:'global-index',title:'Search global model index',source:'Library',detail:String(e),state:'failed',percent:100,progressKind:'stage'})}
  }finally{if(seq===searchSeq.current)setLoading(false)}
 }
 async function refreshCapacity(){
  setCapacityRefreshing(true);setCapacityNotice('');
  try{setCapacityProfile(await invoke<Profile>('system_profile'))}catch(e){setCapacityNotice(`Hardware capacity unavailable: ${e}`)}
  try{const r=await invoke<any>('ollama_json',{mode,method:'GET',path:'/api/tags',body:null});setInstalled((r.models??[]) as Installed[])}catch(e){setInstalled([]);setCapacityNotice(v=>[v,`Installed inventory unavailable for ${mode} runtime: ${e}`].filter(Boolean).join(' · '))}
  finally{setCapacityRefreshing(false)}
 }
 useEffect(()=>{search(q,source)},[source]);
 useEffect(()=>{void refreshCapacity()},[mode]);
 async function open(m:Indexed){
  const seq=++variantSeq.current;setSelected(m);setVars([]);setNotice('');if(m.source==='GitHub')return;setVloading(true);
  try{const next=await invoke<V[]>('universal_model_variants',{source:m.source,id:m.id});if(seq===variantSeq.current)setVars(next)}catch(e){if(seq===variantSeq.current)setNotice(String(e))}finally{if(seq===variantSeq.current)setVloading(false)}
 }
 const visible=useMemo(()=>rows.filter(m=>!trustedOnly||Boolean(m.license)&&!['review','gated'].includes(m.risk)).sort((a,b)=>sort==='popular'?(b.downloads??b.likes??0)-(a.downloads??a.likes??0):0),[rows,trustedOnly,sort]);
 const counts=useMemo(()=>rows.reduce((a,m)=>(a[m.source]=(a[m.source]||0)+1,a),{} as Record<string,number>),[rows]);
 const effectiveMemory=capacityProfile?.memoryBytes||memoryBytes,freeStorage=capacityProfile?.freeStorageBytes??0,protectedReserve=reserveGb*GB;
 const capacityOpts=useMemo(()=>({memoryBytes:effectiveMemory,freeStorageBytes:freeStorage,context:capacityContext,policy:capacityPolicy,protectedStorageReserveBytes:protectedReserve}),[effectiveMemory,freeStorage,capacityContext,capacityPolicy,protectedReserve]);
 const capacityRows=useMemo(()=>vars.map(v=>({id:v.id,label:v.label,quantization:v.quantization,sizeBytes:v.sizeBytes,plan:assessLibraryVariant013(v,capacityOpts)})),[vars,capacityOpts]);
 const recommended=useMemo(()=>largestFeasibleVariant013(vars,capacityOpts)?.variant,[vars,capacityOpts]);
 const installedBytes=useMemo(()=>installed.reduce((s,m)=>s+(m.size??0),0),[installed]);
 function pin(v:V){if(!selected)return;addLibraryPortfolioItem013({id:selected.id,name:selected.name},v);setCapacityNotice(`Pinned ${selected.name} · ${v.label} to the multi-model portfolio.`)}
 async function install(v:V){
  if(!selected||installing)return;
  const id=`install:${selected.id}:${v.id}`;setInstalling(v.id);
  task({id,title:`Install ${v.id}`,source:'Global Library',detail:'Rechecking live storage capacity…',state:'running',percent:1,progressKind:v.source==='Ollama'?'real':'stage'});
  try{
   const live=await invoke<Profile>('system_profile');setCapacityProfile(live);
   const livePlan=assessLibraryVariant013(v,{...capacityOpts,memoryBytes:live.memoryBytes||effectiveMemory,freeStorageBytes:live.freeStorageBytes});
   if(livePlan.state==='unknown')throw new Error('Install blocked: variant size metadata is unavailable, so peak storage headroom cannot be verified.');
   if(!livePlan.canInstall)throw new Error(`Install blocked by storage capacity. Peak install requirement is ${fmt(livePlan.peakInstallBytes??0)} while ${reserveGb} GB of free storage is protected.`);
   task({id,title:`Install ${v.id}`,source:'Global Library',detail:livePlan.canRun?'Capacity verified · download starting':`Storage verified · runtime is constrained at ${capacityContext/1024}K context`,state:'running',percent:2,progressKind:v.source==='Ollama'?'real':'stage'});
   if(v.source==='Ollama'){await invoke('pull_model',{mode,model:v.id});return}
   if(v.source==='Hugging Face'){
    const repo=selected.id.replace(/^hf:/,'');const list=await invoke<HFVariant[]>('list_hf_gguf_variants',{repoId:repo});const exact=list.find(x=>x.filename===v.id);
    if(!exact)throw new Error('GGUF variant metadata could not be refreshed.');
    if(!selected.license)throw new Error('License metadata is missing. Review this model before importing.');
    const refreshed=assessLibraryVariant013({...v,sizeBytes:exact.size},{...capacityOpts,memoryBytes:live.memoryBytes||effectiveMemory,freeStorageBytes:live.freeStorageBytes});
    if(!refreshed.canInstall)throw new Error('Install blocked: refreshed GGUF size no longer fits the protected storage envelope.');
    const model=`${repo.split('/').pop()}:${exact.quantization.toLowerCase().replaceAll('_','-')}`;
    await invoke('import_hf_gguf',{mode,repoId:repo,filename:exact.filename,model,license:selected.license,expectedSha256:exact.sha256??null});return
   }
   throw new Error('This source is discovery-only. Open the project and review it before importing.')
  }catch(e){task({id,title:`Install ${v.id}`,source:'Global Library',detail:String(e),state:'failed',percent:100,progressKind:'stage'});setNotice(String(e))}
  finally{setInstalling('');void refreshCapacity()}
 }
 return <div className="mega">
  <section className="mega-hero"><div><span>GLOBAL MODEL INDEX · RESOURCE ALLOCATION 0.13</span><h2>Search beyond one registry—and know what actually fits.</h2><p>Ollama registry models, public Hugging Face GGUF repositories, and GitHub model projects in one searchable index. 0.13 adds explicit storage and runtime capacity constraints so download feasibility is separated from run feasibility before an install begins.</p></div><div className="mega-count"><b>{visible.length}</b><span>visible results</span><small>{counts.Ollama||0} Ollama · {counts['Hugging Face']||0} HF · {counts.GitHub||0} GitHub</small></div></section>
  <section className="mega-search"><div className="mega-sources">{[['all','All'],['ollama','Ollama'],['huggingface','HF GGUF'],['github','GitHub']].map(([k,l])=><button key={k} className={source===k?'on':''} onClick={()=>setSource(k)}>{l}</button>)}</div><div className="mega-box"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()} placeholder="Search Qwen, DeepSeek, GLM, coding, vision, embedding…"/><button onClick={()=>search()} disabled={loading}>{loading?'Refreshing…':'Search'}</button></div><div className="mega-controls"><label><input type="checkbox" checked={trustedOnly} onChange={e=>setTrustedOnly(e.target.checked)}/> Known license / lower-risk only</label><label>Sort <select value={sort} onChange={e=>setSort(e.target.value as 'relevance'|'popular')}><option value="relevance">Index relevance</option><option value="popular">Popularity</option></select></label>{loading&&<span>Fresh index request in progress…</span>}</div><div className="mega-quick">{quick.map(x=><button key={x} onClick={()=>{setQ(x);search(x,source)}}>{x}</button>)}</div></section>
  {notice&&<div className="mega-notice">{notice}</div>}{capacityNotice&&<div className="mega-capacity-notice">{capacityNotice}</div>}
  <LibraryPortfolio013 memoryBytes={effectiveMemory} freeStorageBytes={freeStorage} context={capacityContext} policy={capacityPolicy} reserveGb={reserveGb}/>
  <div className="mega-layout"><section className="mega-results">{visible.map(m=><button key={m.id} className={`mega-card ${selected?.id===m.id?'sel':''}`} onClick={()=>open(m)}><div className="mega-cardtop"><div><b>{m.name}</b><small>{m.publisher}</small></div><span>{m.source}</span></div><p>{m.description||'No short description supplied by this index source.'}</p><div className="mega-tags"><i>{m.format}</i>{m.tags.slice(0,5).map(t=><i key={t}>{t}</i>)}</div><div className="mega-meta"><span>{m.license||'license review'}</span><span>{m.downloads!=null?`${m.downloads.toLocaleString()} downloads`:m.likes!=null?`★ ${m.likes.toLocaleString()}`:'metadata'}</span><strong className={`risk ${m.risk}`}>{m.risk}</strong></div></button>)}{!visible.length&&!loading&&<div className="mega-empty">No indexed models match the current search and trust filters.</div>}</section>
   <aside className="mega-detail">{selected?<><div className="mega-detailhead"><span>{selected.source}</span><h3>{selected.name}</h3><p>{selected.description}</p></div><div className="mega-facts"><span>Publisher <b>{selected.publisher}</b></span><span>License <b>{selected.license||'Review required'}</b></span><span>Risk status <b>{selected.risk}</b></span><span>Install policy <b>{selected.installable?'Eligible':'Discovery only'}</b></span></div>{selected.source==='GitHub'?<div className="mega-review"><b>Project metadata only</b><p>GitHub repositories are indexed for discovery, but OpenPenguin does not execute arbitrary releases or scripts. Review the project and use a supported GGUF/Ollama path if available.</p></div>:<><LibraryCapacityPanel013 chip={capacityProfile?.chip??''} memoryBytes={effectiveMemory} freeStorageBytes={freeStorage} installedCount={installed.length} installedBytes={installedBytes} context={capacityContext} policy={capacityPolicy} reserveGb={reserveGb} rows={capacityRows} onContext={setCapacityContext} onPolicy={setCapacityPolicy} onReserve={setReserveGb} onRefresh={refreshCapacity} refreshing={capacityRefreshing}/><div className="mega-varhead"><div><b>Download variants</b><small>Capacity state combines live free storage with the selected runtime memory envelope.</small></div>{recommended&&<span>Largest fully feasible: {recommended.label}</span>}</div>{vloading?<div className="mega-empty">Loading variants…</div>:<div className="mega-vars">{vars.map(v=>{const plan=assessLibraryVariant013(v,capacityOpts),rec=recommended?.id===v.id,score=capacityScore(plan.state);return <div className={`mega-var ${rec?'rec':''}`} key={v.id}><div><b>{v.label}</b><small>{[v.quantization,fmt(v.sizeBytes),v.context&&`${v.context} ctx`].filter(Boolean).join(' · ')}</small></div><span className={`fit f${score}`} title={plan.reason}>{capacityLabel(plan.state)}</span><button className="plan" onClick={()=>pin(v)}>Pin plan</button><button disabled={!selected.installable||!plan.canInstall||plan.state==='unknown'||Boolean(installing)} onClick={()=>install(v)}>{installing===v.id?'Starting…':selected.installable?(plan.canRun?'Install':'Install · run limited'):'Review first'}</button></div>})}{!vars.length&&!vloading&&<div className="mega-empty">No downloadable variants were parsed for this entry.</div>}</div>}</>}</>:<div className="mega-empty">Select a model to inspect its variants, license status and hardware/storage feasibility.</div>}</aside>
  </div>
 </div>
}
