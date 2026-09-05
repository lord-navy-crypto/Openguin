export type TaskState='queued'|'running'|'stalled'|'done'|'failed'|'cancelled';
export type TaskPriority='low'|'normal'|'high';
export type TaskResourceClass='network'|'storage'|'runtime'|'compute'|'control'|'mixed'|'unclassified';
export type TaskUpdate={
 id:string;
 title:string;
 source?:string;
 detail?:string;
 state?:TaskState;
 percent?:number;
 progressKind?:'real'|'stage'|'indeterminate';
 cancellable?:boolean;
 cancelKind?:'pull'|'import';
 cancelTarget?:string;
 priority?:TaskPriority;
 resourceClass?:TaskResourceClass;
};

export function task(update:TaskUpdate){
 document.dispatchEvent(new CustomEvent<TaskUpdate>('openguin:task',{detail:update}));
}

export function queueTask(id:string,title:string,source:string,detail='',meta?:{priority?:TaskPriority;resourceClass?:TaskResourceClass}){
 task({id,title,source,detail,state:'queued',percent:0,progressKind:'stage',priority:meta?.priority??'normal',resourceClass:meta?.resourceClass??'unclassified'});
}

export function startTask(id:string,title:string,source:string,detail='',progressKind:TaskUpdate['progressKind']='stage',meta?:{priority?:TaskPriority;resourceClass?:TaskResourceClass}){
 task({id,title,source,detail,state:'running',percent:progressKind==='indeterminate'?undefined:2,progressKind,priority:meta?.priority??'normal',resourceClass:meta?.resourceClass??'unclassified'});
}

export function finishTask(id:string,title:string,source:string,detail='Completed'){
 task({id,title,source,detail,state:'done',percent:100,progressKind:'stage'});
}

export function failTask(id:string,title:string,source:string,error:unknown){
 task({id,title,source,detail:String(error),state:'failed',percent:100,progressKind:'stage'});
}
