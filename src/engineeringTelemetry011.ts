export type EngineeringCalibration={
  at:string;
  mode:'bundled'|'external';
  loadedModels:number;
  modelBytes:number;
  runtimeBytes:number;
  residencyFactor:number;
  memoryPressurePct:number;
  contexts:number[];
};

export const ENGINEERING_CALIBRATION_KEY='openguin-engineering-calibration011';
export const ENGINEERING_CALIBRATION_EVENT='openguin:engineering-calibration';

export function loadEngineeringCalibration():EngineeringCalibration|null{
  try{
    const raw=localStorage.getItem(ENGINEERING_CALIBRATION_KEY);
    if(!raw)return null;
    const value=JSON.parse(raw) as EngineeringCalibration;
    if(!value||typeof value.at!=='string'||typeof value.residencyFactor!=='number'||!Number.isFinite(value.residencyFactor))return null;
    return value;
  }catch{return null}
}

export function saveEngineeringCalibration(value:EngineeringCalibration){
  localStorage.setItem(ENGINEERING_CALIBRATION_KEY,JSON.stringify(value));
  window.dispatchEvent(new CustomEvent<EngineeringCalibration>(ENGINEERING_CALIBRATION_EVENT,{detail:value}));
}
