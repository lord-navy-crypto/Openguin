import type {TaskPriority,TaskResourceClass,TaskState,TaskUpdate} from './taskBus';

export type OperationalTaskRow=TaskUpdate&{
  state:TaskState;
  createdAt:number;
  updatedAt:number;
  priority:TaskPriority;
  resourceClass:TaskResourceClass;
  queuedAt?:number;
  startedAt?:number;
  finishedAt?:number;
};

const TERMINAL:TaskState[]=['done','failed','cancelled'];
export const isTaskActive=(state:TaskState)=>['queued','running','stalled'].includes(state);
export const isTaskTerminal=(state:TaskState)=>TERMINAL.includes(state);

export function applyTaskUpdate(old:OperationalTaskRow|undefined,update:TaskUpdate,at=Date.now()):OperationalTaskRow{
  const state=update.state??old?.state??'running';
  const createdAt=old?.createdAt??at;
  const row:OperationalTaskRow={
    ...(old??{} as OperationalTaskRow),...update,
    state,
    createdAt,
    updatedAt:at,
    priority:update.priority??old?.priority??'normal',
    resourceClass:update.resourceClass??old?.resourceClass??'unclassified',
  };
  if(state==='queued'&&row.queuedAt==null)row.queuedAt=at;
  if(state==='running'&&row.startedAt==null)row.startedAt=at;
  if(isTaskTerminal(state)&&row.finishedAt==null)row.finishedAt=at;
  return row;
}

export function taskQueueWaitMs(row:OperationalTaskRow){
  return row.queuedAt!=null&&row.startedAt!=null&&row.startedAt>=row.queuedAt?row.startedAt-row.queuedAt:null;
}

export function taskServiceMs(row:OperationalTaskRow){
  const end=row.finishedAt;
  return row.startedAt!=null&&end!=null&&end>=row.startedAt?end-row.startedAt:null;
}

export function medianTaskMetric(values:(number|null)[]){
  const nums=values.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)).sort((a,b)=>a-b);
  if(!nums.length)return null;const m=Math.floor(nums.length/2);return nums.length%2?nums[m]:(nums[m-1]+nums[m])/2;
}

export function taskOperationsSummary(rows:OperationalTaskRow[]){
  const active=rows.filter(r=>isTaskActive(r.state));
  const queueSamples=rows.map(taskQueueWaitMs).filter((v):v is number=>v!=null);
  const serviceSamples=rows.map(taskServiceMs).filter((v):v is number=>v!=null);
  const activeByClass=active.reduce((acc,row)=>{acc[row.resourceClass]=(acc[row.resourceClass]??0)+1;return acc},{} as Record<TaskResourceClass,number>);
  const priorityActive=active.reduce((acc,row)=>{acc[row.priority]=(acc[row.priority]??0)+1;return acc},{} as Record<TaskPriority,number>);
  return{
    active:active.length,
    queued:active.filter(r=>r.state==='queued').length,
    running:active.filter(r=>r.state==='running').length,
    stalled:active.filter(r=>r.state==='stalled').length,
    classifiedActive:active.filter(r=>r.resourceClass!=='unclassified').length,
    activeByClass,
    priorityActive,
    queueWaitMedianMs:medianTaskMetric(queueSamples),
    queueWaitSamples:queueSamples.length,
    serviceMedianMs:medianTaskMetric(serviceSamples),
    serviceSamples:serviceSamples.length,
  };
}
