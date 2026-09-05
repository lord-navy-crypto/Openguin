#!/usr/bin/env python3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'src'/'Observatory.tsx'
t=p.read_text()

if 'OPENGUIN_011_STATIC_OBSERVATORY' in t:
    required=["import RuntimeControl09 from './RuntimeControl09';","import CompareBench09 from './CompareBench09';","<RuntimeControl09 mode={mode}","<CompareBench09 mode={mode}"]
    missing=[x for x in required if x not in t]
    if missing:
        raise SystemExit('apply-performance09: static Observatory composition incomplete: '+', '.join(missing))
    print('0.9 performance patch skipped: Observatory runtime controls and benchmarks are already static and verified.')
    raise SystemExit(0)

if "import RuntimeControl09 from './RuntimeControl09';" not in t:
    t=t.replace("import './observatory.css';", "import './observatory.css';\nimport RuntimeControl09 from './RuntimeControl09';\nimport CompareBench09 from './CompareBench09';")
anchor="  <section className=\"obs-card\"><h3>Context residency</h3>"
insert="  <RuntimeControl09 mode={mode} memoryBytes={memoryBytes}/>\n  <CompareBench09 mode={mode}/>\n"
if insert.strip() not in t and anchor in t:
    t=t.replace(anchor,insert+anchor)
p.write_text(t)
print('Applied legacy 0.9 runtime controls and benchmark composition.')
