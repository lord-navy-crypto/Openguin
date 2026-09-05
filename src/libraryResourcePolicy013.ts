export type LibraryPolicy013='safe'|'balanced'|'maximum';
export type LibraryVariantInput013={id:string;label:string;sizeBytes?:number;source:string;quantization?:string};
export type LibraryVariantPlan013={
  id:string;
  state:'feasible'|'runtime-constrained'|'storage-constrained'|'both-constrained'|'unknown';
  projectedRuntimeBytes:number|null;
  runtimeBudgetBytes:number;
  runtimeMarginPct:number|null;
  steadyStorageBytes:number|null;
  peakInstallBytes:number|null;
  freeStorageBytes:number;
  protectedStorageReserveBytes:number;
  postInstallFreeBytes:number|null;
  storageMarginBytes:number|null;
  canInstall:boolean;
  canRun:boolean;
  reason:string;
};

const GB=1024**3,MB=1024**2;

export function projectRuntime013(sizeBytes:number,context:number){
  const size=Math.max(.25*GB,sizeBytes),resident=size*1.18+.25*GB;
  const kv=Math.max(size*.10,384*MB)*(Math.max(context,1024)/8192);
  return{residentBytes:resident,kvBytes:kv,totalBytes:resident+kv+384*MB};
}

export function runtimeBudget013(memoryBytes:number,policy:LibraryPolicy013){
  const total=Math.max(memoryBytes,8*GB),osReserve=Math.max(total*.25,3*GB),raw=total-osReserve;
  const ratio=policy==='safe'?.82:policy==='maximum'?.96:.90;
  return{totalBytes:total,osReserveBytes:osReserve,policyRatio:ratio,budgetBytes:raw*ratio};
}

export function peakInstallBytes013(source:string,sizeBytes:number){
  if(sizeBytes<=0)return null;
  // HF import keeps the downloaded GGUF while the same bytes are uploaded into Ollama's blob store.
  // Model this as two simultaneous copies plus the backend's existing 2 GB safety headroom.
  if(source==='Hugging Face')return sizeBytes*2+2*GB;
  // Ollama pulls are streamed directly into the runtime-managed store. We do not invent a hidden
  // temporary-copy multiplier; protected free-storage reserve is handled separately.
  return sizeBytes;
}

export function assessLibraryVariant013(input:LibraryVariantInput013,opts:{
  memoryBytes:number;
  freeStorageBytes:number;
  context:number;
  policy:LibraryPolicy013;
  protectedStorageReserveBytes:number;
}):LibraryVariantPlan013{
  const{budgetBytes}=runtimeBudget013(opts.memoryBytes,opts.policy),size=input.sizeBytes??0;
  if(!size||size<=0)return{
    id:input.id,state:'unknown',projectedRuntimeBytes:null,runtimeBudgetBytes:budgetBytes,runtimeMarginPct:null,
    steadyStorageBytes:null,peakInstallBytes:null,freeStorageBytes:opts.freeStorageBytes,protectedStorageReserveBytes:opts.protectedStorageReserveBytes,
    postInstallFreeBytes:null,storageMarginBytes:null,canInstall:false,canRun:false,
    reason:'Variant size metadata is unavailable, so OpenPenguin cannot make a defensible storage or runtime feasibility claim.',
  };
  const runtime=projectRuntime013(size,opts.context),runtimeMargin=(budgetBytes-runtime.totalBytes)/Math.max(1,budgetBytes)*100;
  const peak=peakInstallBytes013(input.source,size)??size;
  const postInstall=Math.max(0,opts.freeStorageBytes-size),storageMargin=opts.freeStorageBytes-peak-opts.protectedStorageReserveBytes;
  const canRun=runtime.totalBytes<=budgetBytes,canInstall=storageMargin>=0;
  const state=canRun&&canInstall?'feasible':!canRun&&!canInstall?'both-constrained':!canRun?'runtime-constrained':'storage-constrained';
  const storageText=input.source==='Hugging Face'?'HF peak headroom includes the temporary GGUF plus Ollama blob copy and 2 GB safety headroom.':'Storage uses the indexed variant size plus the operator-selected protected free-space reserve.';
  return{
    id:input.id,state,projectedRuntimeBytes:runtime.totalBytes,runtimeBudgetBytes:budgetBytes,runtimeMarginPct:runtimeMargin,
    steadyStorageBytes:size,peakInstallBytes:peak,freeStorageBytes:opts.freeStorageBytes,protectedStorageReserveBytes:opts.protectedStorageReserveBytes,
    postInstallFreeBytes:postInstall,storageMarginBytes:storageMargin,canInstall,canRun,
    reason:`${canInstall?'Install capacity passes':'Install capacity is constrained'}; ${canRun?'runtime envelope passes':'runtime envelope is constrained'} at ${opts.context.toLocaleString()} context. ${storageText}`,
  };
}

export function largestFeasibleVariant013<T extends LibraryVariantInput013>(variants:T[],opts:{memoryBytes:number;freeStorageBytes:number;context:number;policy:LibraryPolicy013;protectedStorageReserveBytes:number}){
  return variants.map(v=>({variant:v,plan:assessLibraryVariant013(v,opts)})).filter(x=>x.plan.state==='feasible').sort((a,b)=>(b.variant.sizeBytes??0)-(a.variant.sizeBytes??0))[0]??null;
}
