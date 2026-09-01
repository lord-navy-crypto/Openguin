# Changelog

## 0.9.1

### Global Task Center
- Added a floating global task window for long-running actions.
- Tasks appear immediately when a supported button is pressed so users can see that the action registered.
- Shows task title, source, detail, elapsed time, status, percentage and a green progress bar.
- Supports multiple concurrent tasks and displays the active-task count on the collapsed Tasks button.
- Keeps recent finished/failed/cancelled tasks visible until cleared.

### Progress semantics
- Ollama model pulls and Hugging Face GGUF imports use real backend progress percentages when byte totals are available.
- Runtime switching, model preload/unload, catalog sync, inference and controlled benchmarks use explicitly labelled stage progress rather than pretending estimated percentages are measured transfer progress.
- Tasks with no update for 15 seconds are visually marked `Stalled` without automatically killing the underlying process.

### Cancellation and safety
- Model pulls can be cancelled through the existing `cancel_pull` backend command.
- GGUF imports can be cancelled through `cancel_hf_import`.
- Unsupported actions do not show a fake cancel control.

### Integration
- Runtime preload/unload and cold/warm benchmark stages now report into the global Task Center.
- Runtime switching, Model Lab inference, Ollama Library sync/search/install, Hugging Face search and GGUF import are instrumented by the deterministic build integration step.
- Version synchronized to 0.9.1 across npm, Cargo and Tauri.
- CI/verifier require the Task Center files, mount point, progress events and build integration.

## 0.9.0

### Closed-loop runtime control
- Extended Observatory from read-only telemetry into a runtime control surface.
- Added model preload with configurable keep-alive.
- Added immediate unload using Ollama `keep_alive: 0`.
- Refreshes resident-model state after lifecycle operations.

### Context Optimizer
- Added conservative recommended-context and estimated-ceiling calculations.
- Combines model weight size, parameter metadata, total system/unified memory and runtime headroom.
- Keeps estimates visually distinct from `/api/ps` runtime measurements.

### Model Comparator
- Added side-by-side comparison for up to three installed models.
- Compares disk size, parameter count, quantization and model family/architecture.

### Controlled cold / warm benchmark
- Added a small deterministic benchmark that unloads a model, measures the first cold run, then repeats the same run warm.
- Stores cold/warm load time and decode throughput separately.
- Uses a fixed tiny benchmark prompt rather than private user conversation content.

### Runtime history visualization
- Added a rolling 60-sample runtime allocation history using `/api/ps`.
- Keeps the visualization local and framework-free using native SVG.

### Architecture direction
- Runtime UI now follows a provider-layer design so Observatory concepts can later map to llama.cpp metrics/slots and Apple Silicon MLX without rewriting the main product model.
- Ollama bundled and external modes remain the active 0.9 providers.

### Build and verification
- Version synchronized to 0.9.0 across npm, Cargo and Tauri.
- Added `apply-performance09.py` to the deterministic desktop preparation pipeline.
- CI and verifier now require Runtime Control, Context Optimizer, Model Comparator, cold/warm benchmark and memory-history integrations.

## 0.8.0

### Openguin Runtime Observatory
- Added a first-class `Observatory` navigation section.
- Polls Ollama `/api/ps` locally every two seconds when live mode is enabled.
- Visualizes currently resident models, Ollama-reported runtime memory, allocated context, quantization, parameter size and keep-alive state.
- Adds a unified-memory view appropriate for Apple Silicon rather than pretending macOS has separate VRAM.
- Adds pause/resume and manual refresh controls.

### Generation telemetry
- Extended the Rust/Tauri streaming bridge to retain Ollama `total_duration`, `load_duration`, `prompt_eval_count`, `prompt_eval_duration`, `eval_count`, `eval_duration` and `done_reason`.
- Benchmark records can now store model-load, prompt-prefill and token-decode timing separately.
- Added a visual Load → Prefill → Decode pipeline and recent decode-throughput trend.

### Visualization upgrade
- Added runtime-memory gauges and loaded-model allocation bars.
- Added context-residency cards based on the actual context reported by `/api/ps`.
- Added local SVG performance trends with no chart framework or network dependency.
- Added live/paused telemetry state and engine endpoint identification.

## 0.7.0

### Unified desktop experience
- Replaced temporary floating Lab+/Diagnostics additions with the unified desktop interface.
- Added normal navigation for Overview, My Models, Model Lab, Library, Diagnostics, and Developer Studio.

### Runtime reliability
- Bundled Ollama must pass a real `127.0.0.1:11435` readiness check before being reported online.
- Automatic fallback to an already-running external Ollama remains available.

### Model Lab
- Added Rust/Tauri streaming chat bridge.
- Thinking controls follow installed model `/api/show` capabilities.
- Thinking trace and final answer are separated during streaming.
- Added final real token count and tok/s.

### Library and diagnostics
- Added live public Ollama Library synchronization.
- Retained verified Hugging Face GGUF import and provenance handling.
- Integrated local application logs and raw bundled Ollama logs.

## 0.6.0
- Bundled Ollama runtime setup and external Ollama detection.
- Hardware Fit and local benchmark history.
- Verified Hugging Face GGUF import with provenance/license records.
- Legal, copyright, security, third-party, and model-license documentation pack.
