import {peakInstallBytes013,type LibraryVariantInput013} from './libraryResourcePolicy013';

export type LibraryPortfolioItem013={
  id:string;
  modelId:string;
  modelName:string;
  variantId:string;
  variantLabel:string;
  source:string;
  quantization?:string;
  sizeBytes?:number;
  addedAt:string;
};

export type LibraryPortfolioCapacity013={
  state:'feasible'|'storage-constrained'|'unknown';
  itemCount:number;
  knownItems:number;
  steadyBytes:number|null;
  conservativePeakBytes:number|null;
  transientAllowanceBytes:number|null;
  protectedReserveBytes:number;
  freeStorageBytes:number;
  postPortfolioFreeBytes:number|null;
  marginBytes:number|null;
};

export const LIBRARY_PORTFOLIO_KEY='openguin-library-portfolio013';
export const LIBRARY_PORTFOLIO_EVENT='openguin:library-portfolio013';
const LIMIT=24;

function clean(v:unknown):LibraryPortfolioItem013|null{
  if(!v||typeof v!=='object')return null;
  const x=v as Partial<LibraryPortfolioItem013>;
  if(!x.id||!x.modelId||!x.variantId||!x.modelName||!x.variantLabel||!x.source)return null;
  return{id:String(x.id),modelId:String(x.modelId),modelName:String(x.modelName),variantId:String(x.variantId),variantLabel:String(x.variantLabel),source:String(x.source),quantization:typeof x.quantization==='string'?x.quantization:undefined,sizeBytes:typeof x.sizeBytes==='number'&&Number.isFinite(x.sizeBytes)&&x.sizeBytes>0?x.sizeBytes:undefined,addedAt:typeof x.addedAt==='string'?x.addedAt:new Date().toISOString()};
}

export function loadLibraryPortfolio013():LibraryPortfolioItem013[]{
  try{const raw=JSON.parse(localStorage.getItem(LIBRARY_PORTFOLIO_KEY)||'[]');return Array.isArray(raw)?raw.map(clean).filter((v):v is LibraryPortfolioItem013=>Boolean(v)).slice(0,LIMIT):[]}catch{return[]}
}

function save(rows:LibraryPortfolioItem013[]){
  const next=rows.slice(0,LIMIT);localStorage.setItem(LIBRARY_PORTFOLIO_KEY,JSON.stringify(next));window.dispatchEvent(new CustomEvent(LIBRARY_PORTFOLIO_EVENT,{detail:next}));return next;
}

export function addLibraryPortfolioItem013(model:{id:string;name:string},variant:LibraryVariantInput013){
  const id=`${model.id}::${variant.id}`,existing=loadLibraryPortfolio013().filter(x=>x.id!==id);
  const row:LibraryPortfolioItem013={id,modelId:model.id,modelName:model.name,variantId:variant.id,variantLabel:variant.label,source:variant.source,quantization:variant.quantization,sizeBytes:variant.sizeBytes,addedAt:new Date().toISOString()};
  return save([row,...existing]);
}

export function removeLibraryPortfolioItem013(id:string){return save(loadLibraryPortfolio013().filter(x=>x.id!==id))}
export function clearLibraryPortfolio013(){return save([])}

export function libraryPortfolioCapacity013(items:LibraryPortfolioItem013[],freeStorageBytes:number,protectedReserveBytes:number):LibraryPortfolioCapacity013{
  if(!items.length)return{state:'feasible',itemCount:0,knownItems:0,steadyBytes:0,conservativePeakBytes:0,transientAllowanceBytes:0,protectedReserveBytes,freeStorageBytes,postPortfolioFreeBytes:freeStorageBytes,marginBytes:freeStorageBytes-protectedReserveBytes};
  const known=items.filter(x=>x.sizeBytes&&x.sizeBytes>0);
  if(known.length!==items.length)return{state:'unknown',itemCount:items.length,knownItems:known.length,steadyBytes:null,conservativePeakBytes:null,transientAllowanceBytes:null,protectedReserveBytes,freeStorageBytes,postPortfolioFreeBytes:null,marginBytes:null};
  const steady=known.reduce((s,x)=>s+(x.sizeBytes??0),0);
  const extras=known.map(x=>Math.max(0,(peakInstallBytes013(x.source,x.sizeBytes??0)??(x.sizeBytes??0))-(x.sizeBytes??0)));
  // Order-independent conservative upper bound for sequential installs:
  // all final bytes + the largest one-item transient overhead.
  const transient=Math.max(0,...extras),peak=steady+transient,margin=freeStorageBytes-peak-protectedReserveBytes;
  return{state:margin>=0?'feasible':'storage-constrained',itemCount:items.length,knownItems:known.length,steadyBytes:steady,conservativePeakBytes:peak,transientAllowanceBytes:transient,protectedReserveBytes,freeStorageBytes,postPortfolioFreeBytes:Math.max(0,freeStorageBytes-steady),marginBytes:margin};
}

export function libraryPortfolioJson013(items=loadLibraryPortfolio013()){
  return JSON.stringify({schema:'openguin.library.portfolio.v1',exportedAt:new Date().toISOString(),items},null,2);
}
