export type TaskState='queued'|'running'|'stalled'|'done'|'failed'|'cancelled';
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
};

export function task(update:TaskUpdate){
 document.dispatchEvent(new CustomEvent<TaskUpdate>('openguin:task',{detail:update}));
}

export function startTask(id:string,title:string,source:string,detail='',progressKind:TaskUpdate['progressKind']='stage'){
 task({id,title,source,detail,state:'running',percent:progressKind==='indeterminate'?undefined:2,progressKind});
}

export function finishTask(id:string,title:string,source:string,detail='Completed'){
 task({id,title,source,detail,state:'done',percent:100,progressKind:'stage'});
}

export function failTask(id:string,title:string,source:string,error:unknown){
 task({id,title,source,detail:String(error),state:'failed',percent:100,progressKind:'stage'});
}
