import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {task} from './taskBus';
import './runtime-installer.css';

type RuntimeState={bundledAvailable?:boolean;bundledRunning?:boolean;externalRunning?:boolean;reason?:string};
type Runtime=RuntimeState|null;
type P={stage:string;detail:string;percent:number;done:boolean;error?:string};
export default function RuntimeInstallerCard({runtime,onReady}:{runtime:Runtime;onReady:()=>void|Promise<void>}){
 const [p,setP]=useState<P|null>(null),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[verified,setVerified]=useState(false);
 useEffect(()=>{let off:(()=>void)|undefined;listen<P>('openguin://runtime-install-progress',e=>{const x=e.payload;setP(x);if(x.error)setErr(x.error);task({id:'runtime-repair',title:'Download / Repair Ollama',source:'Overview',detail:x.error?x.error:x.done?'Runtime files installed · verifying discovery…':`${x.stage} · ${x.detail}`,state:x.error?'failed':'running',percent:x.error?100:x.done?96:x.percent,progressKind:'real'});}).then(x=>off=x);return()=>off?.()},[]);
 async function repair(){
  const action=runtime?.bundledAvailable?'repair the private Ollama runtime':'download and install the official Ollama macOS runtime into OpenPenguin App Data';
  if(!confirm(`OpenPenguin will ${action}. This is optional and will not happen automatically. Continue?`))return;
  setBusy(true);setErr('');setVerified(false);setP(null);
  task({id:'runtime-repair',title:'Download / Repair Ollama',source:'Overview',detail:'User approved · connecting to official Ollama download…',state:'running',percent:1,progressKind:'real'});
  try{
   await invoke<string>('repair_bundled_runtime');
   const discovered=await invoke<RuntimeState>('runtime_discovery');
   if(!discovered.bundledAvailable)throw new Error('Runtime files were written, but OpenPenguin could not rediscover the private Ollama executable.');
   setVerified(true);setP(x=>x?{...x,stage:'verified',detail:'Private runtime installed and rediscovered successfully.',percent:100,done:true}:x);
   task({id:'runtime-repair',title:'Download / Repair Ollama',source:'Overview',detail:'Private runtime installed and rediscovered successfully',state:'done',percent:100,progressKind:'real'});
   await onReady();
  }catch(e){const message=String(e);setErr(message);task({id:'runtime-repair',title:'Download / Repair Ollama',source:'Overview',detail:message,state:'failed',percent:100,progressKind:'real'})}
  finally{setBusy(false)}
 }
 const displayPercent=Math.max(0,Math.min(100,p?.percent??0));
 return <section className="runtime-installer"><div><span>PRIVATE OLLAMA RUNTIME · OPT-IN</span><h3>{runtime?.bundledRunning?'Private Ollama is running.':runtime?.bundledAvailable?'Private Ollama is installed.':'Private Ollama is not installed.'}</h3><p>{runtime?.reason||'OpenPenguin can optionally keep a private Ollama runtime in its own application data. The runtime is not bundled into the OpenPenguin DMG and is not downloaded automatically.'}</p>{verified&&<small>✓ Last user-approved install/repair passed post-install runtime discovery.</small>}</div><div className="runtime-install-action"><button onClick={repair} disabled={busy}>{busy?'Downloading / verifying…':runtime?.bundledAvailable?'Repair Ollama Runtime':'Download Ollama (optional)'}</button>{p&&<><div className="ri-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(displayPercent)}><i style={{width:`${displayPercent}%`}}/></div><small>{Math.round(displayPercent)}% · {p.stage} · {p.detail}</small></>}{err&&<small className="ri-error">{err}</small>}<em>OpenPenguin never downloads or installs this private runtime on first launch. Clicking the button and confirming is explicit consent to download the official macOS Ollama archive into OpenPenguin App Data. It does not run arbitrary third-party installers.</em></div></section>
}
