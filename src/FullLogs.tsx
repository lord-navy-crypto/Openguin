import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './full-logs.css';

type Snapshot={path:string;content:string;sizeBytes:number;truncated:boolean};
type Severity='all'|'error'|'warn'|'info';
type Source='ollama'|'app'|'ui';
type UiLog={at?:string;level?:string;message?:string};
const empty:Snapshot={path:'',content:'',sizeBytes:0,truncated:false};
const fmt=(n:number)=>n<1024?`${n} B`:n<1024*1024?`${(n/1024).toFixed(1)} KB`:`${(n/1024/1024).toFixed(2)} MB`;
function level(line:string):Exclude<Severity,'all'>{const s=line.toLowerCase();if(/\b(error|failed|failure|fatal|panic|exception|abort)\b/.test(s))return'error';if(/\b(warn|warning|retry|timeout|stalled)\b/.test(s))return'warn';return'info'}
function uiEvents():Snapshot{
  try{
    const rows=JSON.parse(localStorage.getItem('modeldock-logs')||'[]') as UiLog[];
    const content=(Array.isArray(rows)?rows:[]).map(r=>`${r.at||''} [${String(r.level||'info').toUpperCase()}] ${r.message||''}`).join('\n');
    return{path:'localStorage:modeldock-logs',content,sizeBytes:new TextEncoder().encode(content).byteLength,truncated:false};
  }catch{return{...empty,path:'localStorage:modeldock-logs'}}
}

export default function FullLogs(){
  const [ollama,setOllama]=useState<Snapshot>(empty);
  const [app,setApp]=useState<Snapshot>(empty);
  const [ui,setUi]=useState<Snapshot>(()=>uiEvents());
  const [active,setActive]=useState<Source>('ollama');
  const [filter,setFilter]=useState('');
  const [severity,setSeverity]=useState<Severity>('all');
  const [auto,setAuto]=useState(true);
  const [follow,setFollow]=useState(true);
  const [maxMb,setMaxMb]=useState(4);
  const [error,setError]=useState('');
  const [refreshing,setRefreshing]=useState(false);
  const requestRef=useRef(0),preRef=useRef<HTMLPreElement|null>(null);

  async function refresh(){
    const seq=++requestRef.current;setRefreshing(true);
    try{
      const [o,a]=await Promise.all([
        invoke<Snapshot>('bundled_ollama_log',{maxBytes:maxMb*1024*1024}),
        invoke<Snapshot>('modeldock_backend_log',{maxBytes:Math.min(maxMb,4)*1024*1024}),
      ]);
      if(seq!==requestRef.current)return;
      setOllama(o);setApp(a);setUi(uiEvents());setError('');
    }catch(e){if(seq===requestRef.current){setUi(uiEvents());setError(String(e));}}
    finally{if(seq===requestRef.current)setRefreshing(false)}
  }
  useEffect(()=>{void refresh();if(!auto)return;const id=setInterval(()=>void refresh(),2500);return()=>clearInterval(id)},[auto,maxMb]);
  const current=active==='ollama'?ollama:active==='app'?app:ui;
  const analysis=useMemo(()=>{const lines=current.content?current.content.split('\n'):[];let errors=0,warns=0;for(const line of lines){const l=level(line);if(l==='error')errors++;else if(l==='warn')warns++}return{lines,errors,warns,infos:Math.max(0,lines.length-errors-warns)}},[current.content]);
  const shown=useMemo(()=>{
    const q=filter.trim().toLowerCase();
    return analysis.lines.filter(line=>{const l=level(line);return(severity==='all'||l===severity)&&(!q||line.toLowerCase().includes(q))}).join('\n');
  },[analysis,filter,severity]);
  useEffect(()=>{if(follow&&preRef.current)preRef.current.scrollTop=preRef.current.scrollHeight},[shown,follow]);
  async function clear(){if(active==='ui'){setError('UI event history is owned by the Local background log panel; clear it there so in-memory and stored state stay consistent.');return}try{await invoke('clear_diagnostic_log',{kind:active});await refresh()}catch(e){setError(String(e))}}
  async function copy(){try{await navigator.clipboard.writeText(shown)}catch(e){setError(`Clipboard: ${e}`)}}

  return <section className="v07-card full-logs">
    <div className="diag-head">
      <div><h3>Full diagnostic logs</h3><p>Three local layers: Ollama process output, Rust backend events, and UI event history. Prompts and answers are not intentionally logged.</p></div>
      <div><button onClick={()=>void refresh()} disabled={refreshing}>{refreshing?'Reading…':'Refresh'}</button><button onClick={copy}>Copy visible</button><button onClick={clear} disabled={active==='ui'}>{active==='ui'?'Clear in UI log':'Clear current'}</button></div>
    </div>
    <div className="full-log-health"><span className={analysis.errors?'bad':''}><b>{analysis.errors}</b> errors</span><span className={analysis.warns?'warn':''}><b>{analysis.warns}</b> warnings</span><span><b>{analysis.lines.length}</b> lines</span><span><b>{fmt(current.sizeBytes)}</b> {active==='ui'?'stored':'file'}</span></div>
    <div className="full-log-toolbar">
      <div className="seg"><button className={active==='ollama'?'active':''} onClick={()=>setActive('ollama')}>Ollama process</button><button className={active==='app'?'active':''} onClick={()=>setActive('app')}>Rust backend</button><button className={active==='ui'?'active':''} onClick={()=>{setUi(uiEvents());setActive('ui')}}>UI events</button></div>
      <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter: error, runner, metal, model…"/>
      <select value={severity} onChange={e=>setSeverity(e.target.value as Severity)}><option value="all">All levels</option><option value="error">Errors</option><option value="warn">Warnings</option><option value="info">Info</option></select>
      <select value={maxMb} disabled={active==='ui'} onChange={e=>setMaxMb(Number(e.target.value))}><option value={1}>1 MB tail</option><option value={2}>2 MB tail</option><option value={4}>4 MB tail</option><option value={8}>8 MB tail</option></select>
      <label><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> Live</label>
      <label><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/> Follow tail</label>
    </div>
    {error&&<div className="v07-notice">{error}</div>}
    <div className="full-log-meta"><span>{current.path||'Log source not created yet'}</span><b>{current.truncated?'tail view · ':''}{severity==='all'?'all levels':severity}{filter?` · filter “${filter}”`:''}</b></div>
    <pre ref={preRef} className="raw-log">{shown||'No log lines match the current filters.'}</pre>
  </section>
}
