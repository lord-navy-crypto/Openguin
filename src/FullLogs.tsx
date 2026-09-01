import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './full-logs.css';

type Snapshot={path:string;content:string;sizeBytes:number;truncated:boolean};

const empty:Snapshot={path:'',content:'',sizeBytes:0,truncated:false};
const fmt=(n:number)=>n<1024?`${n} B`:n<1024*1024?`${(n/1024).toFixed(1)} KB`:`${(n/1024/1024).toFixed(2)} MB`;

export default function FullLogs(){
  const [ollama,setOllama]=useState<Snapshot>(empty);
  const [app,setApp]=useState<Snapshot>(empty);
  const [active,setActive]=useState<'ollama'|'app'>('ollama');
  const [filter,setFilter]=useState('');
  const [auto,setAuto]=useState(true);
  const [error,setError]=useState('');

  async function refresh(){
    try{
      const [o,a]=await Promise.all([
        invoke<Snapshot>('bundled_ollama_log',{maxBytes:4*1024*1024}),
        invoke<Snapshot>('modeldock_backend_log',{maxBytes:2*1024*1024}),
      ]);
      setOllama(o);setApp(a);setError('');
    }catch(e){setError(String(e));}
  }
  useEffect(()=>{refresh();if(!auto)return;const id=setInterval(refresh,2000);return()=>clearInterval(id)},[auto]);
  const current=active==='ollama'?ollama:app;
  const shown=useMemo(()=>{
    if(!filter.trim())return current.content;
    const q=filter.toLowerCase();
    return current.content.split('\n').filter(x=>x.toLowerCase().includes(q)).join('\n');
  },[current,filter]);
  async function clear(){await invoke('clear_diagnostic_log',{kind:active});await refresh();}
  async function copy(){await navigator.clipboard.writeText(shown);}

  return <section className="v07-card full-logs">
    <div className="diag-head">
      <div><h3>Full backend logs</h3><p>Raw local process output and persistent ModelDock events. Prompts and answers are not intentionally logged.</p></div>
      <div><button onClick={refresh}>Refresh</button><button onClick={copy}>Copy visible</button><button onClick={clear}>Clear current</button></div>
    </div>
    <div className="full-log-toolbar">
      <div className="seg"><button className={active==='ollama'?'active':''} onClick={()=>setActive('ollama')}>Bundled Ollama stdout/stderr</button><button className={active==='app'?'active':''} onClick={()=>setActive('app')}>ModelDock backend</button></div>
      <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter: error, runner, metal, model…"/>
      <label><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> Live refresh</label>
    </div>
    {error&&<div className="v07-notice">{error}</div>}
    <div className="full-log-meta"><span>{current.path||'Log file not created yet'}</span><b>{fmt(current.sizeBytes)}{current.truncated?' · showing tail':''}</b></div>
    <pre className="raw-log">{shown||'No backend output yet.'}</pre>
  </section>
}
