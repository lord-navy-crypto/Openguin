# ModelDock Desktop Alpha 0.7

ModelDock is a **desktop-only local model control center** for discovering, installing, understanding, tuning, benchmarking, and managing local AI models.

> ModelDock is an independent project. It is not affiliated with or endorsed by Ollama Inc.

## 0.7 — unified desktop architecture

0.7 replaces the temporary floating Lab+/Diagnostics additions with one unified desktop experience.

### Runtime manager

- Bundled Ollama remains the default private runtime on `127.0.0.1:11435`.
- Existing Ollama is detected on `127.0.0.1:11434`.
- Bundled startup must pass a real readiness check before ModelDock reports it online.
- If the bundled runtime fails and an external Ollama is already running, ModelDock can automatically fall back to it.
- End users do **not** need to install Ollama separately in a distributed ModelDock build.

### Capability-aware Model Lab

ModelDock calls Ollama `/api/show` for the selected installed model and uses the model's actual reported capabilities.

- Thinking controls are enabled only when the installed model reports `thinking`.
- GPT-OSS exposes `low`, `medium`, and `high` thinking levels.
- Context controls use model metadata when a context length is exposed.
- Responses stream through a Rust/Tauri bridge instead of relying on a browser-to-localhost request.
- Thinking and answer text are separated during streaming.
- Generation progress is clearly labelled as an estimate while streaming; final tokens and tok/s use Ollama `eval_count` / `eval_duration`.

### Live official Ollama Library

0.7 adds a backend command that reads the public Ollama Library and extracts model names, capabilities, and advertised size variants.

- Popular / Newest / Featured views
- search
- capability badges such as vision, tools, thinking, embedding, and cloud
- size/variant selector when exposed
- one-click install through ModelDock's existing pull pipeline
- local cached catalog fallback if the live Library cannot be refreshed

A small built-in fallback catalog remains available so the Library is not blank offline.

### Hugging Face GGUF import retained

The 0.6 verified GGUF workflow remains available:

- list GGUF variants
- local SHA-256 calculation
- compare with Hugging Face LFS SHA-256 when available
- upload verified blob to Ollama
- create model
- save provenance and license metadata
- remove duplicate staging GGUF after successful import

### Hardware Fit 3

Hardware Fit now combines:

- model weight size
- model parameter metadata when available
- context/KV allowance
- runtime/OS headroom

It exposes a confidence level and remains explicitly an **estimate**, not a benchmark guarantee.

### Diagnostics & Usage

Diagnostics is now a normal application section rather than a floating debug panel.

Stored locally on the device:

- runtime switches and failures
- model install/import results
- inference completion/failures
- benchmark history
- sessions
- average generation speed

ModelDock does **not** store full prompts or model answers in the diagnostic log.

## Architecture

```text
ModelDock.app
├── React / Vite unified desktop UI
├── Tauri 2 / Rust security boundary
│   ├── restricted Ollama JSON bridge
│   ├── streaming chat bridge
│   ├── official Ollama Library reader
│   └── verified Hugging Face GGUF importer
├── bundled Ollama sidecar → 127.0.0.1:11435
├── isolated ModelDock model store
└── optional existing Ollama → 127.0.0.1:11434
```

## Build on macOS

The machine **building** ModelDock needs Node.js/npm, Rust/Cargo, and the normal macOS Tauri prerequisites. End-user Macs do not need Rust.

```bash
git pull origin main
chmod +x BUILD_MACOS.command
./BUILD_MACOS.command
```

The build script:

1. installs Rust automatically if the build machine does not have it;
2. applies the current runtime/build integration fixes;
3. runs the static ModelDock verifier;
4. prepares the bundled Ollama sidecar, downloading the official macOS Ollama archive if necessary;
5. installs frontend dependencies;
6. builds the Tauri app and DMG.

Expected output:

```text
src-tauri/target/release/bundle/macos/ModelDock.app
src-tauri/target/release/bundle/dmg/
```

## Licensing / legal

- ModelDock source: [`LICENSE`](LICENSE) — MIT
- copyright: [`COPYRIGHT.md`](COPYRIGHT.md)
- project / trademark notice: [`NOTICE.md`](NOTICE.md)
- third-party notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- model licensing policy: [`docs/MODEL_LICENSING.md`](docs/MODEL_LICENSING.md)
- security policy: [`SECURITY.md`](SECURITY.md)

Model weights always retain their own upstream licenses. Being downloadable or runnable through ModelDock does not grant additional rights.

## Alpha limitations

- The macOS app is not yet a signed/notarized public release.
- Live Ollama Library parsing depends on the public Library page structure; ModelDock falls back to its cached catalog if parsing fails.
- Hardware Fit remains an estimate.
- Interrupted Hugging Face GGUF download resume and gated/private Hugging Face authentication remain future work.
