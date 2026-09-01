#!/usr/bin/env python3
from pathlib import Path

root=Path(__file__).resolve().parents[1]
p=root/'src'/'App07.tsx'
t=p.read_text()

imports="""import MegaLibrary from './MegaLibrary';
import DeveloperStudio010 from './DeveloperStudio010';
import RuntimeInstallerCard from './RuntimeInstallerCard';
import AdvancedSettings010 from './AdvancedSettings010';
"""
if "import MegaLibrary from './MegaLibrary';" not in t:
    t=t.replace("import './app07.css';", "import './app07.css';\n"+imports)

state_anchor="const [ctx,setCtx]=useState(8192),[temp,setTemp]=useState(.7),[topP,setTopP]=useState(.9),[maxOut,setMaxOut]=useState(512),[prompt,setPrompt]=useState('Explain why local inference is useful.'),[system,setSystem]=useState('You are a concise, accurate local assistant.');"
if 'setTopK' not in t:
    t=t.replace(state_anchor,state_anchor+"\n const [topK,setTopK]=useState(40),[minP,setMinP]=useState(0),[repeatPenalty,setRepeatPenalty]=useState(1.1),[seed,setSeed]=useState(-1),[keepAlive,setKeepAlive]=useState('5m');")

old_opts="options:{num_ctx:ctx,num_predict:maxOut,temperature:temp,top_p:topP}}"
new_opts="options:{num_ctx:ctx,num_predict:maxOut,temperature:temp,top_p:topP,top_k:topK,min_p:minP,repeat_penalty:repeatPenalty,...(seed>=0?{seed}: {})},keep_alive:keepAlive}"
t=t.replace(old_opts,new_opts)

adv="{tab==='lab'&&<AdvancedSettings010 topK={topK} setTopK={setTopK} minP={minP} setMinP={setMinP} repeatPenalty={repeatPenalty} setRepeatPenalty={setRepeatPenalty} seed={seed} setSeed={setSeed} keepAlive={keepAlive} setKeepAlive={setKeepAlive} canThink={canThink} thinking={thinking}/>}\n  "
if adv.strip() not in t and "{tab==='lab'&&" in t:
    t=t.replace("{tab==='lab'&&",adv+"{tab==='lab'&&",1)

runtime_card="{tab==='overview'&&<RuntimeInstallerCard runtime={runtime} onReady={()=>switchMode('bundled')}/>}\n  "
if runtime_card.strip() not in t and "{tab==='overview'&&" in t:
    t=t.replace("{tab==='overview'&&",runtime_card+"{tab==='overview'&&",1)

if "<MegaLibrary mode={mode} memoryBytes={memory}/>" not in t and "{tab==='library'&&" in t:
    t=t.replace("{tab==='library'&&","{tab==='library'&&<MegaLibrary mode={mode} memoryBytes={memory}/>}\n  {false&&",1)

if "<DeveloperStudio010/>" not in t and "{tab==='developer'&&" in t:
    t=t.replace("{tab==='developer'&&","{tab==='developer'&&<DeveloperStudio010/>}\n  {false&&",1)

p.write_text(t)
print('Applied Openguin 0.10 Global Library, runtime repair card, Developer redesign, and advanced inference settings.')
