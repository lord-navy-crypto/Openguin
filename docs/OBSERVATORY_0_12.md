# OpenPenguin 0.12 — Observatory Ultra benchmark methodology

## Goal

Benchmark Center is a measurement and decision-support tool, not a leaderboard. It is designed to make repeated local-inference measurements comparable while preserving enough provenance to distinguish a model/runtime effect from a hardware or experiment-environment change.

0.12 is developed as a stacked branch on top of the validated 0.11 head. Product changes remain isolated from the 0.11 physical-Mac release gate. The broader Industrial & Operations Engineering and systems-engineering rationale is documented in `docs/ENGINEERING_IOE_012.md`.

## Controlled warm-state procedure

Each Benchmark Center session:

1. selects an already-installed model,
2. preloads it with a finite keep-alive,
3. verifies residency through Ollama `/api/ps`,
4. runs 2–5 controlled streaming trials,
5. uses the same synthetic prompt, context, seed and sampling settings for every trial,
6. captures a live `/api/ps` resource snapshot,
7. captures hardware/runtime/model environment provenance,
8. optionally correlates a sufficiently comparable 0.11 Engineering calibration point,
9. stores every raw sample plus summaries, resources and provenance.

The default request uses temperature 0, seed 42, fixed top-k/top-p values and a deterministic synthetic prompt. This reduces avoidable variance without claiming perfect determinism on every backend/hardware combination.

## Metrics

### Observed TTFT

**Observed TTFT** is measured from the moment OpenPenguin invokes the validated Tauri `chat_stream` path until the first content or thinking chunk reaches the UI listener. It deliberately includes OpenPenguin IPC and local HTTP delivery overhead, so it represents user-visible latency rather than a kernel-only model timer.

Benchmark Center reports median and P95 Observed TTFT.

### Load / prompt prefill / decode

Ollama terminal telemetry remains separate:
- load duration,
- prompt evaluation duration/token count,
- decode duration/output count,
- total duration and done reason when available.

Prompt and decode token rates are derived from Ollama token counts and durations.

### Repeatability and tail behavior

Decode coefficient of variation (CV) measures within-session repeatability. High CV is a signal to investigate background load, memory pressure, thermal state, runtime changes or insufficient samples; it is not a universal quality score.

The **TTFT tail ratio** is `P95 / median`. This prevents an acceptable median from hiding occasional slow responses.

### Resource state and efficiency

After the repeated trials, Benchmark Center captures target-model state from `/api/ps`:
- runtime allocation bytes,
- model bytes,
- residency factor,
- number of loaded models,
- measured context.

It also derives **decode throughput per runtime GB** as a resource-efficiency dimension, not a global score.

## Environment provenance

A new session also captures:
- chip,
- architecture,
- unified/system memory,
- logical cores,
- free storage at capture time,
- Ollama runtime version,
- model family,
- parameter size,
- quantization.

These values are part of the experimental provenance. A benchmark result cannot be interpreted as a pure model effect if the machine or runtime changed.

The environment comparison key currently uses architecture, chip, memory size and Ollama runtime version. Sessions with missing provenance are treated as **unknown**, not assumed comparable.

## Multi-objective / Pareto decision support

OpenPenguin deliberately does not collapse all dimensions into one weighted number.

For Pareto claims, sessions must currently match:
- runtime mode,
- requested context,
- environment key (architecture + chip + memory + Ollama version).

Within that blocked comparison set, four objectives remain separate:
- lower median TTFT,
- higher median decode throughput,
- lower decode CV,
- lower runtime memory.

A session is **Pareto-efficient** when no comparable measured session is at least as good on all four objectives and strictly better on at least one.

The Decision Analysis panel therefore selects context and environment before plotting a Pareto map. Circle size represents runtime memory; the raw-sample scatter preserves within-session dispersion that a median would hide.

## Engineering-calibration evidence correlation

Benchmark Center may link a session to a 0.11 Engineering Calibration Recorder point, but correlation is deliberately conservative.

A candidate must satisfy all of these gates:
- same runtime mode,
- requested or measured context matches the benchmark context,
- model-size delta ≤20%,
- runtime-allocation delta ≤30%,
- measurement separation ≤2 hours.

A link is **strong** only when separation is ≤30 minutes, model-size delta ≤10%, and runtime-allocation delta ≤15%; otherwise a qualifying link is **moderate**.

This is an evidence/provenance link, not model identity. The 0.11 calibration schema does not store a model name, so OpenPenguin explicitly refuses to infer identity from timing alone. A link never changes planner or controller settings automatically.

## Storage and export

Sessions use schema `openguin.observatory.benchmark.v1` and remain local. History is bounded to 30 sessions.

JSON preserves session/sample/resource/environment/correlation structure. CSV includes raw samples, summary metrics, resource state, environment key, hardware/runtime/model provenance, calibration-link confidence/deltas, memory efficiency, tail ratio and Pareto status.

## What 0.12 intentionally does not do

0.12 does **not** introduce an arbitrary Penguin Score. A scalar score would require a documented weighting model, hardware normalization strategy, task definition and validation dataset.

0.12 also does not automatically change Engineering controller constants. Measurement, evidence correlation and actuation remain separate until physical-Mac data supports a validated controller.

## Engineering interpretation

- **IOE / operations research:** blocked comparisons, multi-objective tradeoffs, resource allocation and decision support.
- **Experiment design / data analytics:** controlled factors, environment provenance, repeated raw samples and exportable evidence.
- **Quality / reliability:** repeatability, tail behavior and regression detection.
- **ECE / control:** measured feedback for later estimator/controller calibration.
- **Systems engineering:** operating constraints, interfaces and cross-subsystem tradeoffs.
- **Software engineering:** observability, reproducibility and regression contracts.
- **HCI / human factors:** interpretable evidence and explicit uncertainty instead of silent auto-tuning.

See `docs/ENGINEERING_IOE_012.md` for the full mapping.
