# ModelDock Desktop Alpha 0.5

ModelDock is a **desktop-only local model control center** built around a bundled Ollama runtime. The product goal is to make local models easier to discover, understand, install, tune, benchmark, and integrate without forcing users into terminal workflows.

> Status: alpha. The architecture and core flows are implemented, but this repository does not include the Ollama binary itself. The build script prepares the official/local Ollama executable as a Tauri sidecar at build time.

## What Alpha 0.5 adds

### Direct Hugging Face GGUF import

The Library can now:

1. Search the live Hugging Face model index for GGUF repositories.
2. Inspect a repository's GGUF files.
3. Detect common quantization names such as `Q4_K_M`, `Q5_K_M`, `Q6_K`, and `Q8_0` from filenames.
4. Score each variant against detected system memory.
5. Recommend the highest-quality variant that still fits comfortably.
6. Download the selected GGUF with real progress.
7. Compute SHA-256 while streaming the download.
8. Compare against Hugging Face LFS SHA-256 metadata when available.
9. Upload the verified file to Ollama's blob API.
10. Register it through Ollama's `/api/create` endpoint.
11. Save provenance metadata and a generated Modelfile record.
12. Remove the temporary GGUF staging file after Ollama owns the blob, avoiding duplicate multi-GB storage.

The source repository, declared license metadata, filename, and checksum remain visible to the user. ModelDock does **not** silently re-host community model weights.

## Existing product areas

- **Overview** — hardware profile, runtime state, installed storage, best local fit.
- **My Models** — installed models, Model Passport, quantization, context metadata, capabilities, delete.
- **Model Lab** — visual context/temperature/top-p/output controls, presets, thinking toggle, live benchmark metrics.
- **Library** — Ollama direct pull plus Hugging Face GGUF discovery/import.
- **Developer Studio** — generated local API integration snippet.

## Desktop architecture

```text
ModelDock.app
├── React / Vite UI
├── Tauri 2 / Rust core
├── bundled Ollama sidecar → 127.0.0.1:11435
├── isolated ModelDock model store
└── optional external Ollama → 127.0.0.1:11434
```

The frontend does not receive arbitrary shell access. Sensitive local operations are exposed through narrow Tauri commands, and general Ollama API access is restricted to an allow-list.

## Bundled vs External runtime

**Bundled** is the default product mode. ModelDock starts its own Ollama sidecar on port `11435` and uses an isolated model directory under ModelDock app data.

**External** is an advanced option for users who already run Ollama on the default `11434` port.

## Build on macOS

Prerequisites for development/building:

- Node.js + npm
- Rust + Cargo
- Tauri 2 prerequisites
- an Ollama executable available for the sidecar preparation script

Then:

```bash
npm install
npm run desktop:dev
```

For a desktop bundle:

```bash
npm run desktop:build
```

Or use `BUILD_MACOS.command`.

### Sidecar packaging

`scripts/prepare-ollama-sidecar.sh` copies/prepares the Ollama executable using the target-triple naming expected by Tauri external binaries. The repository intentionally does not commit the large binary.

## Security and trust decisions

- Bundled Ollama binds only to loopback.
- ModelDock uses a private model directory by default.
- Remote GGUF imports are downloaded from their original Hugging Face source.
- SHA-256 is computed locally during every GGUF import.
- Hub LFS SHA-256 is checked when the repository exposes it.
- A 2 GB free-space safety margin is required beyond the selected GGUF size.
- Gated/private Hugging Face repositories are not bypassed; unauthenticated access will fail normally.
- Model license metadata is surfaced, not treated as permission for every use case.

## Hardware Fit

Current Hardware Fit is an **estimate**, not a benchmark score. It uses detected unified/system memory and model weight size to predict whether a variant is comfortable, heavy, or unsuitable. Real community hardware benchmarking is planned separately.

## Verification

Run the repository architecture check:

```bash
python scripts/verify-desktop.py
```

A full Tauri/Rust build still requires a machine with the Rust toolchain and fetched npm/cargo dependencies.

## Roadmap

### 0.6

- richer Model Passport provenance/history
- model-family and base/fine-tune lineage graph
- resumable HF downloads
- optional Hugging Face authentication for gated models
- editable imported model name before install
- benchmark history persisted in app storage
- stronger hardware-fit model using context/KV-cache estimates

### Later

- community benchmark database by hardware
- model comparison arena
- update detection for installed community models
- LoRA / adapter manager
- visual Modelfile builder
- signed/notarized macOS release pipeline

## Naming

`ModelDock` is the current working product name. It is an independent project and is not affiliated with Ollama.
