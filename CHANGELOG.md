# Changelog

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
- One-click install uses ModelDock's existing pull pipeline.
- Retained verified Hugging Face GGUF discovery/import and upstream license/provenance handling.

### Hardware Fit 3
- Adds context/KV allowance and model parameter metadata to the memory estimate.
- Displays estimate confidence rather than presenting the score as a benchmark.

### Diagnostics & Usage
- Integrated local background logs and benchmark history into the main app.
- Tracks runtime/model task/inference events and session/throughput summaries.
- Does not store complete prompts or model answers in diagnostics.

### Build
- Version synchronized to 0.7.0 across npm, Cargo, and Tauri.
- Added `regex` for public Library parsing.
- Updated verifier and macOS build script for the 0.7 architecture.

## 0.6.0
- Bundled Ollama runtime setup and external Ollama detection.
- Hardware Fit 2 and local benchmark history.
- Verified Hugging Face GGUF import with provenance/license records.
- Legal, copyright, security, third-party, and model-license documentation pack.
