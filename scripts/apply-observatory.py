#!/usr/bin/env python3
from pathlib import Path

root=Path(__file__).resolve().parents[1]
p=root/'src'/'App07.tsx'
t=p.read_text()

if "import Observatory from './Observatory';" not in t:
    t=t.replace("import './app07.css';", "import './app07.css';\nimport Observatory from './Observatory';")

t=t.replace("type Tab='overview'|'models'|'lab'|'library'|'diagnostics'|'developer';", "type Tab='overview'|'observatory'|'models'|'lab'|'library'|'diagnostics'|'developer';")
t=t.replace("type StreamEvent={requestId:string;thinking:string;content:string;done:boolean;evalCount?:number;evalDuration?:number;error?:string};", "type StreamEvent={requestId:string;thinking:string;content:string;done:boolean;doneReason?:string;totalDuration?:number;loadDuration?:number;promptEvalCount?:number;promptEvalDuration?:number;evalCount?:number;evalDuration?:number;error?:string};")
t=t.replace("type Bench={at:string;model:string;ctx:number;temperature:number;tokS:number;tokens:number;mode:Mode;thinking:boolean};", "type Bench={at:string;model:string;ctx:number;temperature:number;tokS:number;tokens:number;mode:Mode;thinking:boolean;loadMs?:number;promptMs?:number;decodeMs?:number;promptTokens?:number;doneReason?:string};")

t=t.replace("(['overview','models','lab','library','diagnostics','developer'] as Tab[])", "(['overview','observatory','models','lab','library','diagnostics','developer'] as Tab[])")
t=t.replace("({overview:'Overview',models:'My Models',lab:'Model Lab',library:'Library',diagnostics:'Diagnostics',developer:'Developer'} as Record<Tab,string>)", "({overview:'Overview',observatory:'Observatory',models:'My Models',lab:'Model Lab',library:'Library',diagnostics:'Diagnostics',developer:'Developer'} as Record<Tab,string>)")
t=t.replace("({overview:'Control Center',models:'Model Passports',lab:'Model Lab',library:'Unified Library',diagnostics:'Diagnostics & Usage',developer:'Developer Studio'} as Record<Tab,string>)", "({overview:'Control Center',observatory:'Runtime Observatory',models:'Model Passports',lab:'Model Lab',library:'Unified Library',diagnostics:'Diagnostics & Usage',developer:'Developer Studio'} as Record<Tab,string>)")

old="const b:Bench={at:new Date().toISOString(),model:selected,ctx,temperature:temp,tokS:speed,tokens,mode:modeRef.current,thinking:thinking&&canThink};"
new="const b:Bench={at:new Date().toISOString(),model:selected,ctx,temperature:temp,tokS:speed,tokens,mode:modeRef.current,thinking:thinking&&canThink,loadMs:p.loadDuration?p.loadDuration/1e6:undefined,promptMs:p.promptEvalDuration?p.promptEvalDuration/1e6:undefined,decodeMs:p.evalDuration?p.evalDuration/1e6:undefined,promptTokens:p.promptEvalCount,doneReason:p.doneReason};"
t=t.replace(old,new)

anchor="  {tab==='models'&&<div className=\"v07-page two\">"
insert="  {tab==='observatory'&&<Observatory mode={mode} memoryBytes={memory} installedCount={models.length} online={online}/>}\n\n"
if insert.strip() not in t and anchor in t:
    t=t.replace(anchor,insert+anchor)

p.write_text(t)
print('Applied Openguin Observatory: live /api/ps, memory/context views, performance trend, and generation pipeline telemetry.')
