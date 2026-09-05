import type {EngineeringCalibration} from './engineeringTelemetry011';

export type EngineeringCalibrationPoint={
  id:string;
  recordedAt:string;
  measuredAt:string;
  mode:'bundled'|'external';
  modelGb:number;
  requestedContext:number;
  recommendedContext:number;
  policy:string;
  workload:string;
  heuristicProjectedBytes:number;
  calibratedProjectedBytes:number;
  runtimeBudgetBytes:number;
  measuredRuntimeBytes:number;
  measuredModelBytes:number;
  residencyFactor:number;
  memoryPressurePct:number;
  loadedModels:number;
  measuredContexts:number[];
  note:string;
};

export type CalibrationPointInput={
  calibration:EngineeringCalibration;
  modelGb:number;
  requestedContext:number;
  recommendedContext:number;
  policy:string;
  workload:string;
  heuristicProjectedBytes:number;
  calibratedProjectedBytes:number;
  runtimeBudgetBytes:number;
  note?:string;
};

export const ENGINEERING_DATASET_KEY='openguin-engineering-calibration-dataset011';
export const ENGINEERING_DATASET_EVENT='openguin:engineering-calibration-dataset';
const LIMIT=120;

function finite(n:unknown,fallback=0){return typeof n==='number'&&Number.isFinite(n)?n:fallback}
function cleanPoint(value:unknown):EngineeringCalibrationPoint|null{
  if(!value||typeof value!=='object')return null;
  const v=value as Partial<EngineeringCalibrationPoint>;
  if(typeof v.id!=='string'||typeof v.recordedAt!=='string'||typeof v.measuredAt!=='string')return null;
  return {
    id:v.id,recordedAt:v.recordedAt,measuredAt:v.measuredAt,
    mode:v.mode==='external'?'external':'bundled',
    modelGb:finite(v.modelGb),requestedContext:finite(v.requestedContext),recommendedContext:finite(v.recommendedContext),
    policy:typeof v.policy==='string'?v.policy:'balanced',workload:typeof v.workload==='string'?v.workload:'general',
    heuristicProjectedBytes:finite(v.heuristicProjectedBytes),calibratedProjectedBytes:finite(v.calibratedProjectedBytes),runtimeBudgetBytes:finite(v.runtimeBudgetBytes),
    measuredRuntimeBytes:finite(v.measuredRuntimeBytes),measuredModelBytes:finite(v.measuredModelBytes),residencyFactor:finite(v.residencyFactor),memoryPressurePct:finite(v.memoryPressurePct),loadedModels:finite(v.loadedModels),
    measuredContexts:Array.isArray(v.measuredContexts)?v.measuredContexts.filter(x=>typeof x==='number'&&Number.isFinite(x)):[],
    note:typeof v.note==='string'?v.note.slice(0,240):'',
  };
}

export function loadEngineeringDataset():EngineeringCalibrationPoint[]{
  try{
    const raw=JSON.parse(localStorage.getItem(ENGINEERING_DATASET_KEY)||'[]');
    if(!Array.isArray(raw))return[];
    return raw.map(cleanPoint).filter((x):x is EngineeringCalibrationPoint=>Boolean(x)).slice(0,LIMIT);
  }catch{return[]}
}

function persist(rows:EngineeringCalibrationPoint[]){
  const next=rows.slice(0,LIMIT);
  localStorage.setItem(ENGINEERING_DATASET_KEY,JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<EngineeringCalibrationPoint[]>(ENGINEERING_DATASET_EVENT,{detail:next}));
  return next;
}

export function recordEngineeringPoint(input:CalibrationPointInput){
  const c=input.calibration,now=new Date().toISOString();
  const point:EngineeringCalibrationPoint={
    id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,recordedAt:now,measuredAt:c.at,mode:c.mode,
    modelGb:Math.max(0,input.modelGb),requestedContext:Math.max(0,input.requestedContext),recommendedContext:Math.max(0,input.recommendedContext),policy:input.policy,workload:input.workload,
    heuristicProjectedBytes:Math.max(0,input.heuristicProjectedBytes),calibratedProjectedBytes:Math.max(0,input.calibratedProjectedBytes),runtimeBudgetBytes:Math.max(0,input.runtimeBudgetBytes),
    measuredRuntimeBytes:Math.max(0,c.runtimeBytes),measuredModelBytes:Math.max(0,c.modelBytes),residencyFactor:Math.max(0,c.residencyFactor),memoryPressurePct:Math.max(0,c.memoryPressurePct),loadedModels:Math.max(0,c.loadedModels),
    measuredContexts:[...c.contexts],note:(input.note||'').trim().slice(0,240),
  };
  return {point,rows:persist([point,...loadEngineeringDataset()])};
}

export function clearEngineeringDataset(){return persist([])}

function csvCell(value:unknown){const s=String(value??'');return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s}
export function engineeringDatasetCsv(rows=loadEngineeringDataset()){
  const headers=['recorded_at','measured_at','mode','model_gb','requested_context','recommended_context','policy','workload','heuristic_projected_bytes','calibrated_projected_bytes','runtime_budget_bytes','measured_runtime_bytes','measured_model_bytes','residency_factor','memory_pressure_pct','loaded_models','measured_contexts','note'];
  const body=rows.map(r=>[
    r.recordedAt,r.measuredAt,r.mode,r.modelGb,r.requestedContext,r.recommendedContext,r.policy,r.workload,r.heuristicProjectedBytes,r.calibratedProjectedBytes,r.runtimeBudgetBytes,r.measuredRuntimeBytes,r.measuredModelBytes,r.residencyFactor,r.memoryPressurePct,r.loadedModels,r.measuredContexts.join('|'),r.note,
  ].map(csvCell).join(','));
  return [headers.join(','),...body].join('\n');
}

export function engineeringDatasetJson(rows=loadEngineeringDataset()){
  return JSON.stringify({schema:'openguin.engineering.calibration.v1',exportedAt:new Date().toISOString(),points:rows},null,2);
}

export async function copyEngineeringDataset(format:'json'|'csv',rows=loadEngineeringDataset()){
  const text=format==='json'?engineeringDatasetJson(rows):engineeringDatasetCsv(rows);
  await navigator.clipboard.writeText(text);
  return text.length;
}

export function downloadEngineeringDataset(format:'json'|'csv',rows=loadEngineeringDataset()){
  const text=format==='json'?engineeringDatasetJson(rows):engineeringDatasetCsv(rows);
  const blob=new Blob([text],{type:format==='json'?'application/json':'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  const stamp=new Date().toISOString().replaceAll(':','-').replace(/\.\d{3}Z$/,'Z');
  a.href=url;a.download=`openguin-calibration-${stamp}.${format}`;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
