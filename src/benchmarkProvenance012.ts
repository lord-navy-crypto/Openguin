import {invoke} from '@tauri-apps/api/core';
import {loadEngineeringDataset,type EngineeringCalibrationPoint} from './engineeringCalibrationDataset011';
import type {BenchmarkResource012} from './benchmarkTelemetry012';

export type BenchmarkEnvironment012={
  capturedAt:string;
  chip:string;
  arch:string;
  memoryBytes:number;
  logicalCores:number;
  freeStorageBytes:number;
  runtimeVersion:string;
  modelFamily:string;
  parameterSize:string;
  quantization:string;
};

export type BenchmarkCalibrationLink012={
  calibrationPointId:string;
  calibrationRecordedAt:string;
  confidence:'strong'|'moderate';
  ageSeconds:number;
  contextMatch:'requested'|'measured';
  modelBytesDeltaPct:number;
  runtimeBytesDeltaPct:number;
  note:string;
};

type Mode='bundled'|'external';
type Profile={chip?:string;arch?:string;memoryBytes?:number;logicalCores?:number;freeStorageBytes?:number};
type Show={details?:{family?:string;parameter_size?:string;quantization_level?:string}};

const api=(mode:Mode,method:string,path:string,body?:unknown)=>invoke<any>('ollama_json',{mode,method,path,body:body??null});
const pctDelta=(a:number,b:number)=>Math.abs(a-b)/Math.max(1,Math.max(Math.abs(a),Math.abs(b)))*100;

function correlateCalibration(mode:Mode,context:number,resource:BenchmarkResource012,at:Date,points=loadEngineeringDataset()):BenchmarkCalibrationLink012|null{
  if(!resource.modelBytes||!resource.runtimeBytes)return null;
  const candidates=points.flatMap(point=>{
    if(point.mode!==mode||!point.measuredModelBytes||!point.measuredRuntimeBytes)return[];
    const requested=point.requestedContext===context;
    const measured=point.measuredContexts.includes(context);
    if(!requested&&!measured)return[];
    const modelDelta=pctDelta(resource.modelBytes!,point.measuredModelBytes),runtimeDelta=pctDelta(resource.runtimeBytes!,point.measuredRuntimeBytes);
    const measuredAt=new Date(point.measuredAt).getTime(),ageSeconds=Math.abs(at.getTime()-measuredAt)/1000;
    if(!Number.isFinite(ageSeconds)||ageSeconds>7200||modelDelta>20||runtimeDelta>30)return[];
    const confidence:BenchmarkCalibrationLink012['confidence']=ageSeconds<=1800&&modelDelta<=10&&runtimeDelta<=15?'strong':'moderate';
    const score=ageSeconds/120+modelDelta*8+runtimeDelta*4+(requested?0:20);
    return[{point,requested,modelDelta,runtimeDelta,ageSeconds,confidence,score}];
  }).sort((a,b)=>a.score-b.score);
  const best=candidates[0];
  if(!best)return null;
  return{
    calibrationPointId:best.point.id,
    calibrationRecordedAt:best.point.recordedAt,
    confidence:best.confidence,
    ageSeconds:best.ageSeconds,
    contextMatch:best.requested?'requested':'measured',
    modelBytesDeltaPct:best.modelDelta,
    runtimeBytesDeltaPct:best.runtimeDelta,
    note:'Evidence link requires same runtime mode, matching requested/measured context, ≤20% model-size delta, ≤30% runtime-allocation delta, and ≤2 h measurement separation. It does not claim model identity because 0.11 calibration points do not store a model name.',
  };
}

export async function captureBenchmarkProvenance012(mode:Mode,model:string,context:number,resource:BenchmarkResource012){
  const capturedAt=new Date();
  const [profile,version,show]=await Promise.all([
    invoke<Profile>('system_profile'),
    api(mode,'GET','/api/version'),
    api(mode,'POST','/api/show',{model}) as Promise<Show>,
  ]);
  const environment:BenchmarkEnvironment012={
    capturedAt:capturedAt.toISOString(),
    chip:profile.chip??'',arch:profile.arch??'',memoryBytes:profile.memoryBytes??0,logicalCores:profile.logicalCores??0,freeStorageBytes:profile.freeStorageBytes??0,
    runtimeVersion:String(version?.version??''),modelFamily:show.details?.family??'',parameterSize:show.details?.parameter_size??'',quantization:show.details?.quantization_level??'',
  };
  return{environment,calibrationLink:correlateCalibration(mode,context,resource,capturedAt)};
}

export function describeCalibrationLink012(link:BenchmarkCalibrationLink012|null|undefined){
  if(!link)return'No sufficiently comparable Engineering calibration point.';
  return`${link.confidence} evidence · ${Math.round(link.ageSeconds/60)} min apart · model bytes Δ ${link.modelBytesDeltaPct.toFixed(1)}% · runtime bytes Δ ${link.runtimeBytesDeltaPct.toFixed(1)}%`;
}
