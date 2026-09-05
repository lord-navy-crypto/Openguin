# OpenPenguin 0.12 — Observatory Ultra benchmark methodology

## Goal

Benchmark Center is a measurement tool, not a leaderboard. It is designed to make repeated local-inference measurements comparable on the same Mac and runtime while preserving the raw samples needed for later analysis.

## Controlled warm-state procedure

Each Benchmark Center session:

1. selects an already-installed model,
2. preloads it with a finite keep-alive,
3. verifies residency through Ollama `/api/ps`,
4. runs 2–5 controlled streaming trials,
5. uses the same synthetic prompt, context, seed and sampling settings for every trial,
6. stores every raw sample plus session summaries.

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

### Repeatability

For decode throughput, Benchmark Center reports the coefficient of variation (CV) across the controlled samples. Low CV means the repeated runs were more internally consistent; high CV is a signal to investigate thermal state, background load, memory pressure, runtime changes or insufficient sample count.

The CV labels are diagnostic heuristics. They are not a universal quality score.

## Storage and export

Sessions use schema `openguin.observatory.benchmark.v1` and remain local in browser storage. The history is bounded to 30 sessions.

JSON export preserves the full session/sample structure. CSV export flattens each sample into one row while repeating the relevant session summary fields, making the dataset easy to inspect in a spreadsheet or analysis notebook.

## What 0.12 intentionally does not do

0.12 does **not** introduce an arbitrary Penguin Score. A single scalar score would require a documented weighting model, hardware normalization strategy, task definition and validation dataset. Until those exist, Observatory Ultra exposes the measured dimensions directly: latency, prefill throughput, decode throughput and repeatability.

0.12 also does not change Engineering controller constants automatically. Benchmark data may later inform calibration, but measurement and actuation remain separate until enough physical-Mac evidence exists.
