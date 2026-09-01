#!/usr/bin/env python3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'src'/'Observatory.tsx'
t=p.read_text()
if "import RuntimeControl09 from './RuntimeControl09';" not in t:
    t=t.replace("import './observatory.css';", "import './observatory.css';\nimport RuntimeControl09 from './RuntimeControl09';\nimport CompareBench09 from './CompareBench09';")
anchor="  <section className=\"obs-card\"><h3>Context residency</h3>"
insert="  <RuntimeControl09 mode={mode} memoryBytes={memoryBytes}/>\n  <CompareBench09 mode={mode}/>\n"
if insert.strip() not in t and anchor in t:
    t=t.replace(anchor,insert+anchor)
p.write_text(t)
print('Applied Openguin 0.9 runtime controls, context optimizer, model compare, memory history and cold/warm benchmark.')
