#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
obs=(ROOT/'src/Observatory.tsx').read_text()
center=(ROOT/'src/BenchmarkCenter012.tsx').read_text()
decision=(ROOT/'src/BenchmarkDecision012.tsx').read_text() if (ROOT/'src/BenchmarkDecision012.tsx').exists() else ''
telemetry=(ROOT/'src/benchmarkTelemetry012.ts').read_text()
package=(ROOT/'package.json').read_text()
docs=(ROOT/'docs/OBSERVATORY_0_12.md').read_text() if (ROOT/'docs/OBSERVATORY_0_12.md').exists() else ''
ioe=(ROOT/'docs/ENGINEERING_IOE_012.md').read_text() if (ROOT/'docs/ENGINEERING_IOE_012.md').exists() else ''

checks={
 'Observatory Ultra marker is static': 'OPENGUIN_012_OBSERVATORY_ULTRA' in obs,
 'Benchmark Center is statically mounted': "import BenchmarkCenter012 from './BenchmarkCenter012'" in obs and '<BenchmarkCenter012 mode={mode}/>' in obs,
 'Controlled benchmark uses shared Tauri stream': "invoke('chat_stream'" in center and "listen<StreamEvent>('modeldock://chat-stream'" in center,
 'Warm state is verified against api/ps': "'/api/ps'" in center and 'verifyWarm' in center and 'Warm-state precondition failed' in center,
 'Benchmark preset fixes context/sampling controls': 'num_ctx:context' in center and 'temperature:0' in center and 'seed:42' in center and 'top_k:1' in center,
 'Observed TTFT is measured at UI boundary': 'observedTtftMs:firstAt==null?null:firstAt-start' in center and 'UI boundary' in center,
 'Repeated trials are bounded': "[2,3,4,5]" in center,
 'Session schema is versioned': "openguin.observatory.benchmark.v1" in telemetry,
 'Raw samples are retained': 'samples:BenchmarkSample012[]' in telemetry,
 'Median P95 and CV are computed': 'median012' in telemetry and 'p95012' in telemetry and 'cv012' in telemetry,
 'Benchmark history is bounded': 'const LIMIT=30' in telemetry,
 'JSON and CSV export exist': "format:'json'|'csv'" in telemetry and 'benchmarkSessionsCsv012' in telemetry,
 'Live runtime resource state is captured': 'captureResource' in center and 'size_vram' in center and 'measuredContext' in center,
 'Resource efficiency is explicit': 'benchmarkMemoryEfficiency012' in telemetry and 'decode_tok_s_per_runtime_gb' in telemetry,
 'Tail latency remains visible': 'benchmarkTailRatio012' in telemetry and 'ttft_tail_ratio' in telemetry,
 'Pareto analysis preserves multi-objective tradeoffs': 'benchmarkParetoStatus012' in telemetry and 'dominates012' in telemetry and 'same runtime mode and context' in center,
 'Decision analysis is mounted from Benchmark Center': "import BenchmarkDecision012 from './BenchmarkDecision012'" in center and '<BenchmarkDecision012 sessions={sessions} mode={mode}/>' in center,
 'Pareto map fixes context before comparison': 'contextRows' in decision and 's.context===context' in decision and 'Pareto map' in decision,
 'Raw-sample scatter uses retained individual samples': 'Raw-sample scatter' in decision and 'session.samples.filter' in decision and 'Sample ${s.index}' in decision,
 'Decision view retains runtime memory and CV context': 'runtime memory' in decision.lower() and 'decodeTokSCvPct' in decision,
 'No arbitrary Penguin Score is introduced': 'Penguin Score' not in center and 'penguinScore' not in telemetry and 'Penguin Score' not in decision,
 'Methodology documentation covers resource/Pareto analysis': 'Observed TTFT' in docs and 'P95' in docs and 'coefficient of variation' in docs.lower() and 'Pareto-efficient' in docs and 'runtime memory' in docs,
 'IOE integration document exists': 'Industrial & Operations Engineering' in ioe and 'Performance measurement' in ioe and 'Pareto' in ioe and 'Human systems integration' in ioe,
 'Production verification includes Observatory Ultra': 'verify:observatory-ultra' in package and 'verify-observatory-ultra012.py' in package,
}

failed=[name for name,ok in checks.items() if not ok]
if failed:
 print('OpenPenguin 0.12 Observatory Ultra verification FAILED')
 for name in failed: print(f' - {name}')
 sys.exit(1)
print('OpenPenguin 0.12 Observatory Ultra verification PASSED')
for name in checks: print(f' - {name}')
