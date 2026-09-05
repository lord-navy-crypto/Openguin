# OpenPenguin 0.12 — Observatory Ultra benchmark methodology

## Goal

Benchmark Center is a measurement and decision-support tool, not a leaderboard. It is designed to make repeated local-inference measurements comparable on the same Mac and runtime while preserving the raw samples needed for later analysis.

0.12 is developed as a stacked branch on top of the validated 0.11 head. Its CI base exists only to allow independent Universal2 validation without modifying the frozen 0.11 release-gate branch. Product changes remain confined to `feature/0.12-observatory-benchmark-ultra` and are tracked in Issue #4 / Draft PR #5.

The broader Industrial & Operations Engineering and systems-engineering rationale is documented in `docs/ENGINEERING_IOE_012.md`.

## Controlled warm-state procedure

Each Benchmark Center session:

1. selects an already-installed model,
2. preloads it with a finite keep-alive,
3. verifies residency through Ollama `/api/ps`,
4. runs 2–5 controlled streaming trials,
5. uses the same synthetic prompt, context, seed and sampling settings for every trial,
6. captures a live `/api/ps` resource snapshot after the controlled trials,
7. stores every raw sample plus session summaries and resource state.

The default controlled request uses temperature 0, seed 42, fixed top-k/top-p values and a deterministic synthetic prompt. This reduces avoidable request-to-request variance without claiming that model outputs themselves are perfectly deterministic on every backend/hardware combination.

## Metrics

### Observed TTFT

**Observed TTFT** is measured from the moment OpenPenguin invokes its validated Tauri `chat_stream` path until the first content or thinking chunk reaches the UI event listener.

This deliberately includes OpenPenguin IPC and local HTTP delivery overhead. It is therefore a user-visible latency measurement rather than a kernel-only model timer.

Benchmark Center reports the session median and P95 Observed TTFT.

### Load / prompt prefill / decode

Ollama's terminal stream telemetry is retained separately:

- load duration,
- prompt evaluation duration and prompt token count,
- decode duration and output token count,
- total duration and done reason when available.

Prompt and decode token rates are derived from Ollama's reported token counts and durations.

### Repeatability and tail behavior

For decode throughput, Benchmark Center reports the coefficient of variation (CV) across the controlled samples. Low CV means the repeated runs were more internally consistent; high CV is a signal to investigate thermal state, background load, memory pressure, runtime changes or insufficient sample count.

The CV labels are diagnostic heuristics. They are not a universal quality score.

The center also reports the **TTFT tail ratio**:

`P95 Observed TTFT / Median Observed TTFT`

This keeps median responsiveness separate from tail behavior. A system can have an acceptable median while still producing occasional slow responses.

### Resource state and efficiency

After the repeated trials, Benchmark Center captures the live target-model state from `/api/ps` when available:

- runtime allocation bytes,
- model bytes,
- residency factor (`runtime bytes / model bytes`),
- number of loaded models,
- measured context.

It then derives **decode throughput per runtime GB**. This is not treated as a universal score; it is a resource-efficiency dimension that can be considered alongside latency, absolute throughput and variability.

## Multi-objective / Pareto decision support

OpenPenguin deliberately does not collapse all benchmark dimensions into one weighted number.

For sessions that are comparable by the current contract — **same runtime mode and same requested context** — Benchmark Center checks whether a session is dominated by another measured session across four objectives:

- lower median TTFT is better,
- higher median decode throughput is better,
- lower decode CV is better,
- lower runtime memory is better.

A session is marked **Pareto-efficient** when no comparable measured session is at least as good on all four objectives and strictly better on at least one.

This is an Industrial & Operations Engineering style decision-support view: make tradeoffs visible, preserve constraints, and avoid hiding value judgments in undocumented weights.

## Storage and export

Sessions use schema `openguin.observatory.benchmark.v1` and remain local in browser storage. The history is bounded to 30 sessions.

JSON export preserves the full session/sample/resource structure. CSV export flattens each sample into one row while repeating the relevant session summary and resource fields, including memory efficiency, tail ratio and Pareto status. This keeps the dataset usable in spreadsheets, notebooks or later IOE/statistical analysis.

## What 0.12 intentionally does not do

0.12 does **not** introduce an arbitrary Penguin Score. A single scalar score would require a documented weighting model, hardware normalization strategy, task definition and validation dataset. Until those exist, Observatory Ultra exposes the measured dimensions directly: latency, tail latency, prefill throughput, decode throughput, repeatability, runtime memory and resource efficiency.

0.12 also does not change Engineering controller constants automatically. Benchmark data may later inform calibration, but measurement and actuation remain separate until enough physical-Mac evidence exists.

## Engineering interpretation

The same telemetry serves several engineering layers:

- **IOE / operations research:** multi-objective tradeoffs, resource allocation, performance measurement and decision support.
- **Quality / reliability:** repeatability, tail behavior and regression detection.
- **ECE / control:** measured feedback that can later calibrate an estimator/controller after validation.
- **Systems engineering:** operating constraints, interfaces and performance/resource tradeoffs.
- **Software engineering:** observability, reproducibility and regression contracts.
- **HCI / human factors:** interpretable metrics and explicit uncertainty instead of silent auto-tuning.

See `docs/ENGINEERING_IOE_012.md` for the full mapping.
