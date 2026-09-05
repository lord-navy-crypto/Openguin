# OpenPenguin 0.12 — Industrial & Operations Engineering and broader engineering integration

OpenPenguin should not treat local AI benchmarking as a leaderboard. The engineering problem is a constrained operating-system decision problem: choose a model, context and runtime configuration under latency, throughput, memory, variability, reliability and human-interpretability constraints.

That framing connects Observatory Ultra and Benchmark Center directly to Industrial & Operations Engineering (IOE) and to broader engineering disciplines.

## 1. IOE: system performance as a decision problem

University of Michigan IOE describes the field around complex-system improvement using data analytics, optimization, statistics, operations research, human systems integration, quality and reliability. Its undergraduate areas also include decision analysis, simulation, productivity/performance measurement, stochastic processes and quality engineering.

OpenPenguin maps those methods onto a local inference system:

| IOE concept | OpenPenguin implementation | Observable evidence |
|---|---|---|
| Performance measurement | Controlled Benchmark Center sessions | TTFT median/P95, prefill tok/s, decode tok/s, load time |
| Data analytics | Persistent benchmark/calibration datasets | JSON/CSV session exports and calibration records |
| Variability / stochastic behavior | Repeated trials rather than single-run claims | decode coefficient of variation, P95/median TTFT tail ratio |
| Operations research | Compare feasible operating points without hiding tradeoffs | environment-blocked Pareto analysis |
| Resource allocation | Treat unified memory as a constrained resource | runtime bytes, residency factor, tok/s per runtime GB |
| Decision analysis | Keep objectives separate and inspect consequences | responsiveness vs throughput vs stability vs memory |
| Experiment design | Hold request controls fixed and record nuisance/blocking variables | environment provenance + raw repeated trials |
| Quality / reliability engineering | Detect unstable or degraded behavior | CV bands, tail latency, failed warm-state preconditions, regression contracts |
| Human systems integration | Make system state and uncertainty legible to the operator | Task Center, Full Logs, explicit advisory labels, no opaque auto-tuning |

## 2. Why Pareto analysis instead of one Penguin Score

A single score would require hidden value weights. A user who values low TTFT may choose differently from one who values maximum throughput or minimal memory residency.

Benchmark Center therefore treats the problem as multi-objective:
- minimize median TTFT,
- minimize P95/tail latency,
- maximize decode throughput,
- minimize throughput variability,
- minimize runtime memory,
- preserve requested operating constraints.

A point is marked **Pareto-efficient** only inside a comparable measurement block. OpenPenguin does not claim a frontier across arbitrary machines or runtime versions.

## 3. IOE experiment-design discipline

0.12 treats benchmark factors and responses explicitly.

### Controlled decision variables / factors
- target model,
- requested context,
- fixed prompt,
- seed,
- sampling controls,
- warm-state condition.

### Responses
- Observed TTFT,
- P95/tail TTFT,
- prompt throughput,
- decode throughput,
- decode CV,
- runtime memory,
- residency factor,
- throughput per runtime GB.

### Blocking / nuisance variables recorded as provenance
- chip,
- architecture,
- unified/system memory,
- Ollama runtime version,
- logical cores,
- free storage at measurement time,
- model family / parameter-size metadata / quantization,
- number of concurrently loaded models.

The current Pareto comparison block requires the same runtime mode, requested context and environment key (architecture + chip + memory + Ollama version). Sessions with unknown provenance are not silently assumed comparable.

This is important experimentally: if the machine or runtime changed, a measured performance delta cannot safely be attributed only to the model.

## 4. Evidence correlation with Engineering calibration

0.11 Engineering Calibration Recorder and 0.12 Benchmark Center measure related but not identical things. 0.12 can therefore create an **evidence link**, not an identity claim.

A calibration point is eligible only when:
- runtime mode matches,
- requested/measured context matches,
- model-size delta is at most 20%,
- runtime-allocation delta is at most 30%,
- measurement separation is at most two hours.

A link is labeled **strong** only at tighter thresholds: ≤30 minutes, ≤10% model-size delta and ≤15% runtime-allocation delta. Otherwise a qualifying link is **moderate**.

The link is intentionally conservative because the 0.11 calibration schema does not store model name. Timing alone is never enough. Correlation is preserved for later analysis but never actuates controller settings.

## 5. ECE / control engineering connection

The 0.11 Engineering loop is:

`Sense → Estimate → Decide → Verify`

That is structurally a feedback-system view. Hardware/runtime telemetry is the sensed state; the memory/context model is an estimator; policy is a controller recommendation; Observatory is the verification channel.

0.12 adds higher-quality measurements and evidence links but deliberately does **not** close the loop with automatic actuation. Controller constants should change only after physical-Mac measurements establish calibration quality.

Relevant broader concepts:
- sensing and state estimation,
- feedback and robustness,
- operating envelopes,
- disturbance/uncertainty awareness,
- stability and transient response,
- controller verification before actuation.

## 6. Systems engineering connection

OpenPenguin is a system-of-components rather than one benchmark function:
- private/external runtime,
- model storage/import,
- streaming inference,
- Task Center,
- Observatory,
- Benchmark Center,
- Full Logs,
- Engineering planner,
- recovery/repair paths.

Systems-engineering questions therefore include:
- Does runtime transition preserve service when readiness fails?
- Does the benchmark measure the same operating condition each time?
- Are compared sessions actually from the same environment?
- Can the build be reproduced without source mutation?
- Can the operator trace a failed action across UI, Rust and Ollama logs?
- Does a throughput gain create unacceptable memory, variability or tail-latency cost?

## 7. Software / reliability engineering connection

The project also demonstrates software reliability engineering:
- stale-response guards,
- immutable request ownership,
- verified runtime transitions,
- post-action state verification,
- persistent/recoverable task history,
- bounded logs and diagnostic layers,
- read-only regression contracts,
- clean-source CI,
- Universal2 architecture verification.

Benchmark variability and tail latency are therefore potential reliability signals, not merely performance statistics.

## 8. HCI / human factors connection

The operator is part of the system. A technically optimal controller that hides uncertainty or makes failures hard to understand is not a good engineering interface.

OpenPenguin therefore favors:
- explicit state labels,
- visible task progress/failures,
- advisory rather than silent automatic tuning,
- explainable tradeoffs instead of one opaque score,
- measured vs estimated separation,
- fresh/stale/evidence-confidence distinctions,
- exportable data for independent analysis.

## 9. 0.12 implementation requirements

Observatory Ultra / Benchmark Center should preserve these rules:
- TTFT is **observed UI-boundary latency**, not kernel-only latency.
- Sessions use repeated controlled samples.
- Warm-state claims are verified through live runtime state.
- Resource measurements come from live runtime state rather than model-name heuristics.
- Variability and tail behavior remain visible.
- Environment provenance is persisted with new benchmark sessions.
- Pareto claims require a known, matching environment block.
- Multi-objective comparisons never silently collapse into one weighted score.
- Calibration correlation uses multiple evidence gates and never auto-actuates.
- Raw data remains exportable.
- 0.11 physical-Mac validation remains a separate release gate.

## 10. Academic reference points

The design language is aligned with official University of Michigan engineering descriptions of:
- IOE computing/analytics, operations research, human systems integration and quality engineering,
- IOE data analytics and optimization research,
- EE control systems and embedded feedback systems,
- CSE engineering interactive systems and evaluation.

OpenPenguin is not claiming to implement a university curriculum. These references are used to keep project vocabulary and engineering method grounded in real disciplinary practice.
