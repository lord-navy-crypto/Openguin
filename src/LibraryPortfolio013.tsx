import {useEffect,useMemo,useState} from 'react';
import {assessLibraryVariant013,type LibraryPolicy013} from './libraryResourcePolicy013';
import {clearLibraryPortfolio013,LIBRARY_PORTFOLIO_EVENT,LIBRARY_PORTFOLIO_KEY,libraryPortfolioCapacity013,libraryPortfolioJson013,loadLibraryPortfolio013,removeLibraryPortfolioItem013,type LibraryPortfolioItem013} from './libraryPortfolioStore013';
import './library-portfolio013.css';

type Props={memoryBytes:number;freeStorageBytes:number;context:number;policy:LibraryPolicy013;reserveGb:number};
const GB=1024**3;
const fmt=(n?:number|null)=>n==null?'—':`${(n/GB).toFixed(n>=10*GB?1:2)} GB`;

export default function LibraryPortfolio013(p:Props){
  const [items,setItems]=useState<LibraryPortfolioItem013[]>(()=>loadLibraryPortfolio013()),[notice,setNotice]=useState('');
  useEffect(()=>{
    const event=(e:Event)=>setItems((e as CustomEvent<LibraryPortfolioItem013[]>).detail??loadLibraryPortfolio013());
    const storage=(e:StorageEvent)=>{if(e.key===LIBRARY_PORTFOLIO_KEY)setItems(loadLibraryPortfolio013())};
    window.addEventListener(LIBRARY_PORTFOLIO_EVENT,event);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener(LIBRARY_PORTFOLIO_EVENT,event);window.removeEventListener('storage',storage)};
  },[]);
  const reserve=p.reserveGb*GB,capacity=useMemo(()=>libraryPortfolioCapacity013(items,p.freeStorageBytes,reserve),[items,p.freeStorageBytes,reserve]);
  const rows=useMemo(()=>items.map(item=>({item,plan:assessLibraryVariant013({id:item.variantId,label:item.variantLabel,sizeBytes:item.sizeBytes,source:item.source,quantization:item.quantization},{memoryBytes:p.memoryBytes,freeStorageBytes:p.freeStorageBytes,context:p.context,policy:p.policy,protectedStorageReserveBytes:reserve})})),[items,p.memoryBytes,p.freeStorageBytes,p.context,p.policy,reserve]);
  const runnable=rows.filter(r=>r.plan.canRun).length;
  function remove(id:string){setItems(removeLibraryPortfolioItem013(id))}
  function clear(){if(!items.length||!confirm(`Clear ${items.length} planned variant${items.length===1?'':'s'}?`))return;setItems(clearLibraryPortfolio013());setNotice('Portfolio cleared.')}
  function exportJson(){const text=libraryPortfolioJson013(items),blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`openguin-library-portfolio-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();URL.revokeObjectURL(url);setNotice('Portfolio JSON exported.')}
  if(!items.length)return <section className="lp13 empty"><div><span>PORTFOLIO PLANNER · 0.13</span><h3>Plan more than one model.</h3><p>Pin variants from model details to test a multi-model storage portfolio against the same protected reserve. Runtime feasibility stays per model unless models are actually planned to be resident together.</p></div></section>;
  return <section className="lp13">
    <div className="lp13-head"><div><span>PORTFOLIO PLANNER · IOE CAPACITY ALLOCATION</span><h3>Multi-model storage plan</h3><p>Conservative planning assumes no blob deduplication. Steady storage is summed; sequential-install peak uses total final bytes plus the largest per-item transient overhead.</p></div><div className={`lp13-state ${capacity.state}`}>{capacity.state==='feasible'?'STORAGE FEASIBLE':capacity.state==='unknown'?'SIZE EVIDENCE MISSING':'STORAGE CONSTRAINED'}</div></div>
    <div className="lp13-kpis"><div><small>Planned variants</small><b>{items.length}</b><span>{capacity.knownItems} with known size</span></div><div><small>Steady total</small><b>{fmt(capacity.steadyBytes)}</b><span>no dedup assumed</span></div><div><small>Conservative peak</small><b>{fmt(capacity.conservativePeakBytes)}</b><span>{fmt(capacity.transientAllowanceBytes)} transient allowance</span></div><div><small>Storage margin</small><b>{fmt(capacity.marginBytes)}</b><span>after {p.reserveGb} GB protected reserve</span></div><div><small>Run-feasible individually</small><b>{runnable}/{rows.length}</b><span>{p.context/1024}K · {p.policy}</span></div></div>
    <div className="lp13-list">{rows.map(({item,plan})=><div className="lp13-row" key={item.id}><div><b>{item.modelName}</b><span>{item.variantLabel}</span><small>{[item.source,item.quantization,fmt(item.sizeBytes)].filter(Boolean).join(' · ')}</small></div><div><small>Runtime</small><strong className={plan.canRun?'ok':'warn'}>{plan.projectedRuntimeBytes==null?'UNKNOWN':plan.canRun?'FITS':'CONSTRAINED'}</strong><span>{fmt(plan.projectedRuntimeBytes)}</span></div><button onClick={()=>remove(item.id)}>Remove</button></div>)}</div>
    <div className="lp13-actions"><button onClick={exportJson}>Export JSON</button><button onClick={clear}>Clear plan</button>{notice&&<span>{notice}</span>}</div>
    <p className="lp13-note">Portfolio storage assumes every pinned variant is a new addition and intentionally ignores possible shared Ollama blobs or already-installed duplicates until OpenPenguin can prove those savings from runtime metadata. Runtime projections are per item; summing them would incorrectly imply simultaneous residency.</p>
  </section>
}
