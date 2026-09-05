export type BenchmarkSample012={
  index:number;
  observedTtftMs:number|null;
  totalMs:number|null;
  loadMs:number|null;
  promptMs:number|null;
  decodeMs:number|null;
  promptTokens:number;
  outputTokens:number;
  promptTokS:number|null;
  decodeTokS:number|null;
  doneReason:string;
};

export type BenchmarkResource012={
  runtimeBytes:number|null;
  modelBytes:number|null;
  residencyFactor:number|null;
  loadedModels:number;
  measuredContext:number|null;
};

export type BenchmarkSummary012={
  ttftMedianMs:number|null;
  ttftP95Ms:number|null;
  loadMedianMs:number|null;
  promptMedianMs:number|null;
  decodeMedianMs:number|null;
  promptTokSMedian:number|null;
  decodeTokSMedian:number|null;
  decodeTokSCvPct:number|null;
};

export type BenchmarkSession012={
  schema:'openguin.observatory.benchmark.v1';
  id:string;
  at:string;
  model:string;
  mode:'bundled'|'external';
  context:number;
  repeats:number;
  preset:'deterministic-short';
  warmStateVerified:boolean;
  resource?:BenchmarkResource012;
  samples:BenchmarkSample012[];
  summary:BenchmarkSummary012;
};

export const BENCHMARK_SESSIONS_KEY='openguin-benchmark-sessions012';
export const BENCHMARK_SESSIONS_EVENT='openguin:benchmark-sessions012';
const LIMIT=30;
const GB=1024**3;

export function loadBenchmarkSessions012():BenchmarkSession012[]{
  try{
    const raw=JSON.parse(localStorage.getItem(BENCHMARK_SESSIONS_KEY)||'[]');
    return Array.isArray(raw)?raw.filter(v=>v?.schema==='openguin.observatory.benchmark.v1').slice(0,LIMIT):[];
  }catch{return[]}
}

export function saveBenchmarkSessions012(rows:BenchmarkSession012[]){
  const next=rows.slice(0,LIMIT);
  localStorage.setItem(BENCHMARK_SESSIONS_KEY,JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(BenchmarkEvent(BENCHMARK_SESSIONS_EVENT),{detail:next}));
  return next;
}

function BenchmarkEvent(name:string){return name}

export function addBenchmarkSession012(row:BenchmarkSession012){
  return saveBenchmarkSessions012([row,...loadBenchmarkSessions012()]);
}

export function clearBenchmarkSessions012(){return saveBenchmarkSessions012([])}

function esc(value:unknown){const s=String(value??'');return /[\n\r,\"]/.test(s)?`\"${s.replace(/\"/g,'\"\"')}\"`:s}

export function benchmarkMemoryEfficiency012(row:BenchmarkSession012){
  const rate=row.summary.decodeTokSMedian,runtime=row.resource?.runtimeBytes;
  return rate!=null&&runtime&&runtime>0?rate/(runtime/GB):null;
}

export function benchmarkTailRatio012(row:BenchmarkSession012){
  const med=row.summary.ttftMedianMs,p95=row.summary.ttftP95Ms;
  return med!=null&&med>0&&p95!=null?p95/med:null;
}

function comparable012(a:BenchmarkSession012,b:BenchmarkSession012){return a.id!==b.id&&a.mode===b.mode&&a.context===b.context}
function dominates012(a:BenchmarkSession012,b:BenchmarkSession012){
  const aT=a.summary.ttftMedianMs,bT=b.summary.ttftMedianMs,aD=a.summary.decodeTokSMedian,bD=b.summary.decodeTokSMedian,aC=a.summary.decodeTokSCvPct,bC=b.summary.decodeTokSCvPct,aR=a.resource?.runtimeBytes,bR=b.resource?.runtimeBytes;
  if([aT,bT,aD,bD,aC,bC,aR,bR].some(v=>v==null))return false;
  const noWorse=(aT as number)<=(bT as number)&&(aD as number)>=(bD as number)&&(aC as number)<=(bC as number)&&(aR as number)<=(bR as number);
  const better=(aT as number)<(bT as number)||(aD as number)>(bD as number)||(aC as number)<(bC as number)||(aR as number)<(bR as number);
  return noWorse&&better;
}

export function benchmarkParetoStatus012(row:BenchmarkSession012,rows:BenchmarkSession012[]):'pareto'|'dominated'|'insufficient'{
  const required=[row.summary.ttftMedianMs,row.summary.decodeTokSMedian,row.summary.decodeTokSCvPct,row.resource?.runtimeBytes];
  if(required.some(v=>v==null))return'insufficient';
  const peers=rows.filter(v=>comparable012(row,v));
  if(!peers.length)return'pareto';
  return peers.some(v=>dominates012(v,row))?'dominated':'pareto';
}

export function benchmarkSessionsCsv012(rows:BenchmarkSession012[]){
  const head=['session_id','at','mode','model','context','sample','observed_ttft_ms','total_ms','load_ms','prompt_ms','decode_ms','prompt_tokens','output_tokens','prompt_tok_s','decode_tok_s','done_reason','runtime_bytes','model_bytes','residency_factor','loaded_models','measured_context','decode_tok_s_per_runtime_gb','ttft_tail_ratio','session_ttft_median_ms','session_ttft_p95_ms','session_decode_tok_s_median','session_decode_tok_s_cv_pct','pareto_status'];
  const out=[head.join(',')];
  for(const row of rows){
    const efficiency=benchmarkMemoryEfficiency012(row),tail=benchmarkTailRatio012(row),pareto=benchmarkParetoStatus012(row,rows);
    for(const s of row.samples){
      out.push([
        row.id,row.at,row.mode,row.model,row.context,s.index,s.observedTtftMs,s.totalMs,s.loadMs,s.promptMs,s.decodeMs,s.promptTokens,s.outputTokens,s.promptTokS,s.decodeTokS,s.doneReason,row.resource?.runtimeBytes,row.resource?.modelBytes,row.resource?.residencyFactor,row.resource?.loadedModels,row.resource?.measuredContext,efficiency,tail,row.summary.ttftMedianMs,row.summary.ttftP95Ms,row.summary.decodeTokSMedian,row.summary.decodeTokSCvPct,pareto,
      ].map(esc).join(','));
    }
  }
  return out.join('\n');
}

export function downloadBenchmarkSessions012(format:'json'|'csv',rows=loadBenchmarkSessions012()){
  const payload=format==='json'?JSON.stringify({schema:'openguin.observatory.benchmark-export.v1',exportedAt:new Date().toISOString(),sessions:rows},null,2):benchmarkSessionsCsv012(rows);
  const blob=new Blob([payload],{type:format==='json'?'application/json':'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`openguin-benchmarks-${new Date().toISOString().replace(/[:.]/g,'-')}.${format}`;a.click();URL.revokeObjectURL(url);
}

export function median012(values:number[]){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
export function p95012(values:number[]){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b);return s[Math.max(0,Math.ceil(s.length*.95)-1)]}
export function cv012(values:number[]){if(values.length<2)return null;const mean=values.reduce((a,b)=>a+b,0)/values.length;if(!mean)return null;const variance=values.reduce((sum,v)=>sum+(v-mean)**2,0)/(values.length-1);return Math.sqrt(variance)/mean*100}

export function summarizeBenchmark012(samples:BenchmarkSample012[]):BenchmarkSummary012{
  const nums=(key:keyof BenchmarkSample012)=>samples.map(s=>s[key]).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));
  const decode=nums('decodeTokS');
  return{
    ttftMedianMs:median012(nums('observedTtftMs')),
    ttftP95Ms:p95012(nums('observedTtftMs')),
    loadMedianMs:median012(nums('loadMs')),
    promptMedianMs:median012(nums('promptMs')),
    decodeMedianMs:median012(nums('decodeMs')),
    promptTokSMedian:median012(nums('promptTokS')),
    decodeTokSMedian:median012(decode),
    decodeTokSCvPct:cv012(decode),
  };
}
