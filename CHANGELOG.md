# Changelog

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

### Product direction
- Openguin now treats hardware fit, runtime state and measured performance as first-class model-selection information.
- The design follows local-AI patterns seen in Ollama's runtime metrics and in tools such as Jan: hardware fit in the model hub, visible inference settings, hardware monitoring and model lifecycle visibility.
- Existing thinking controls, live Ollama Library, Hugging Face GGUF import, provenance, full logs and complete bundled Ollama runtime remain available.

### Build and verification
- Version synchronized to 0.8.0 across npm, Cargo and Tauri.
- Added `apply-observatory.py` to the deterministic desktop preparation pipeline.
- macOS CI now verifies the Observatory integration before performing the Tauri build.

## 0.7.0

### Unified desktop experience
- Replaced temporary floating Lab+/Diagnostics additions with the unified `App07` desktop interface.
- Added normal navigation for Overview, My Models, Model Lab, Library, Diagnostics, and Developer Studio.

### Runtime reliability
- Bundled Ollama must pass a real `127.0.0.1:11435` readiness check before being reported online.
- Automatic fallback to an already-running external Ollama remains available.
- Build preparation now applies runtime integration fixes every time.

### Model Lab
- Added Rust/Tauri streaming chat bridge.
- Thinking controls now follow installed model `/api/show` capabilities.
- GPT-OSS thinking levels supported.
- Thinking trace and final answer are separated during streaming.
- Added estimated streaming progress with final real token count and tok/s.
- Context maximum is read from model metadata when available.

### Library
- Added live public Ollama Library synchronization for Popular / Newest / Featured.
- Extracts model names, advertised capabilities, and size variants with a local cached fallback.
- One-click install uses the local Ollama pull pipeline.
- Retained verified Hugging Face GGUF discovery/import and upstream license/provenance handling.

### Hardware Fit 3
- Adds context/KV allowance and model parameter metadata to the memory estimate.
- Displays estimate confidence rather than presenting the score as a benchmark.

### Diagnostics & Usage
- Integrated local background logs and benchmark history into the main app.
- Tracks runtime/model task/inference events and session/throughput summaries.
- Does not store complete prompts or model answers in diagnostics.

## 0.6.0
- Bundled Ollama runtime setup and external Ollama detection.
- Hardware Fit 2 and local benchmark history.
- Verified Hugging Face GGUF import with provenance/license records.
- Legal, copyright, security, third-party, and model-license documentation pack.
