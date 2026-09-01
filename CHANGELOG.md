# Changelog

## 0.6.0 — Runtime Auto Setup + Legal/Trust

- Added MIT `LICENSE`, copyright, notices, third-party notices, security and contributing docs.
- Added explicit Ollama trademark/non-affiliation notice and model-license policy.
- Production architecture now treats bundled Ollama as the default zero-setup runtime.
- Sidecar preparation can automatically download the official macOS Ollama archive at build time when no local CLI is available.
- Added external Ollama installation/running-service detection and path/version reporting.
- Added automatic fallback to a running external service when the bundled sidecar is missing in a development build.
- Added Runtime Auto Setup panel and one-click Bundled/External switching.
- Hardware Fit now includes model + context runtime-memory allowance.
- Added local benchmark history (last 20 runs).
- Added Hugging Face base-model lineage display when Hub tags expose it.
- Updated ModelDock/HF user agent and provenance records to 0.6.

## 0.5.0 — Verified Hugging Face GGUF import

- Live Hugging Face GGUF repository search.
- Variant/quantization discovery and hardware-aware recommendation.
- Streaming GGUF download, cancellation, SHA-256 hashing and optional Hub LFS verification.
- Ollama blob upload + `/api/create` registration.
- Provenance and generated Modelfile records.
- Temporary GGUF cleanup after successful registration.
