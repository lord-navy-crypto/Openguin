# Changelog

## 0.10.0

### Global Model Index
- Replaced the old narrow Library presentation with a multi-source index.
- Added Ollama registry search, Hugging Face GGUF search, and GitHub project discovery metadata.
- Added publisher/source/license/format/popularity/risk metadata to Library results.
- GitHub results are discovery-only by default; Openguin does not execute arbitrary repositories or releases.

### Concrete model variants
- Added a Family → Variant workflow instead of treating a family name as one download.
- Ollama tag pages can expose independent parameter/quantization/context variants.
- Hugging Face GGUF repositories expose individual GGUF files with size and quantization.
- Variant-level hardware recommendations use known file size plus local memory.

### International / publisher discovery
- Added quick searches for Qwen, DeepSeek, GLM, MiniMax, InternLM, Yi, Baichuan, Llama, Mistral, and Gemma.
- Quick searches are discovery shortcuts; runtime compatibility and license state are still evaluated separately.

### Self-repairing private Ollama runtime
- Overview now exposes `Download Ollama Now` / `Repair Ollama Runtime`.
- Downloads the official macOS Ollama archive to Openguin App Data and installs its complete runtime Resources privately.
- A repaired App Data runtime takes priority over the packaged runtime.
- Runtime completeness checks now allow a more flexible llama-server location and produce clearer repair guidance.

### Model Lab advanced settings
- Added Top K, Min P, Repeat Penalty, deterministic Seed, and Keep Alive controls.
- Advanced values are sent to the actual local chat request.
- Context, temperature, Top P, output length, and capability-aware Thinking remain in the primary controls.

### Developer Studio redesign
- Removed the old standalone JavaScript sample.
- Added local-AI use cases, runtime architecture, useful local endpoints, and a practical debug order.

### Build and verification
- Version synchronized to 0.10.0 across npm, Cargo, and Tauri.
- Added `apply-expansion010.py` to dev/build/CI.
- Verifier now requires the Global Library, runtime repair command/UI, advanced settings, Developer redesign, and existing Task Center/Observatory/icon chain.

## 0.9.1

### Global Task Center
- Added a floating global task window for long-running actions.
- Tasks appear immediately when a supported button is pressed so users can see that the action registered.
- Shows task title, source, detail, elapsed time, status, percentage and a green progress bar.
- Supports multiple concurrent tasks and displays the active-task count on the collapsed Tasks button.
- Keeps recent finished/failed/cancelled tasks visible until cleared.
- Real transfer progress is used when available; stage progress is labelled separately.
- Tasks with no update for 15 seconds are visually marked `Stalled` without automatically killing the process.
- Model pulls and GGUF imports support cancellation through existing backend commands.

## 0.9.0

### Closed-loop runtime control
- Added preload, keep-alive and immediate unload controls.
- Added conservative Context Optimizer.
- Added side-by-side Model Comparator.
- Added controlled cold/warm benchmark and rolling runtime memory history.
- Extended Observatory from read-only telemetry into a runtime control surface.

## 0.8.0

### Runtime Observatory
- Added `/api/ps` loaded-model, memory, context and residency visualization.
- Added Load → Prefill → Decode timing and decode-throughput history.

## 0.7.0

### Unified desktop experience
- Added unified navigation, streaming chat bridge, capability-aware Thinking, live Ollama Library, Hardware Fit, diagnostics, and verified Hugging Face GGUF import.

## 0.6.0
- Bundled Ollama runtime setup and external Ollama detection.
- Hardware Fit and local benchmark history.
- Verified Hugging Face GGUF import with provenance/license records.
- Legal, copyright, security, third-party, and model-license documentation pack.
