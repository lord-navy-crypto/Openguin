# Changelog

## 0.5.0 — Direct GGUF import

### Added

- live Hugging Face GGUF repository file inspection
- common quantization detection from GGUF filenames
- hardware-aware variant ranking and “Best fit” recommendation
- direct GGUF import into the active Ollama runtime
- streaming download progress and cancellation
- incremental SHA-256 hashing during download
- validation against Hugging Face LFS SHA-256 when available
- Ollama blob upload + `/api/create` registration pipeline
- provenance JSON and generated Modelfile records
- 2 GB disk safety headroom before large imports
- automatic cleanup of temporary staging GGUF after successful registration

### Changed

- Hugging Face Library is now actionable instead of discovery-only
- version bumped to Alpha 0.5 across Tauri and frontend metadata
- Hugging Face requests identify as `ModelDock/0.5`

### Security / trust

- GGUF imports stay inside constrained Rust commands
- no arbitrary shell command is exposed to the frontend
- original source, declared license metadata, and checksum remain visible

## 0.4.0 — Unified library + real download manager

- Ollama direct pull with streaming progress
- pull cancellation
- live Hugging Face GGUF model discovery
- hardware profile and fit scoring
- disk-space preflight
- improved Model Passport and delete flow

## 0.3.0 — Desktop runtime architecture

- desktop-only Tauri architecture
- bundled Ollama sidecar lifecycle
- isolated `11435` bundled runtime
- optional external `11434` runtime
- private ModelDock model directory
- restricted Tauri/Ollama bridge
