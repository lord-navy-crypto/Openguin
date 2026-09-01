import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {task} from './taskBus';
import './runtime-installer.css';

type Runtime={bundledAvailable?:boolean;bundledRunning?:boolean;externalRunning?:boolean;reason?:string}|null;
type P={stage:string;detail:string;percent:number;done:boolean;error?:string};
export default function RuntimeInstallerCard({runtime,onReady}:{runtime:Runtime;onReady:()=>void|Promise<void>}){
 const [p,setP]=useState<P|null>(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 useEffect(()=>{let off:(()=>void)|undefined;listen<P>('openguin://runtime-install-progress',e=>{setP(e.payload);task({id:'runtime-repair',title:'Download / Repair Ollama',source:'Overview',detail:e.payload.detail,state:e.payload.error?'failed':e.payload.done?'done':'running',percent:e.payload.percent,progressKind:'real'});}).then(x=>off=x);return()=>off?.()},[]);
 async function repair(){setBusy(true);setErr('');task({id:'runtime-repair',title:'Download / Repair Ollama',source:'Overview',detail:'Connecting to official Ollama download…',state:'running',percent:1,progressKind:'real'});try{await invoke<string>('repair_bundled_runtime');await onReady()}catch(e){setErr(String(e));task({id:'runtime-repair',title:'Download / Repair Ollama',source:'Overview',detail:String(e),state:'failed',percent:100,progressKind:'real'})}finally{setBusy(false)}}
 return <section className="runtime-installer"><div><span>PRIVATE OLLAMA RUNTIME</span><h3>{runtime?.bundledRunning?'Bundled Ollama is running.':runtime?.bundledAvailable?'Bundled Ollama is installed.':'Bundled Ollama is unavailable.'}</h3><p>{runtime?.reason||'Openguin can keep a private Ollama runtime in its own application data instead of requiring a separate system installation.'}</p></div><div className="runtime-install-action"><button onClick={repair} disabled={busy}>{busy?'Downloading / repairing…':runtime?.bundledAvailable?'Repair Ollama Runtime':'Download Ollama Now'}</button>{p&&<><div className="ri-bar"><i style={{width:`${Math.max(0,Math.min(100,p.percent))}%`}}/></div><small>{Math.round(p.percent)}% · {p.detail}</small></>}{err&&<small className="ri-error">{err}</small>}<em>Downloads the official macOS Ollama archive into Openguin's private App Data runtime. It does not run arbitrary third-party installers.</em></div></section>
}
