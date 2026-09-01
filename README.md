# Openguin Desktop Alpha 0.8

Openguin is a **desktop-only local AI control center and runtime observatory** for discovering, installing, understanding, tuning, benchmarking, visualizing, and managing local models.

> Openguin is an independent project. It is not affiliated with or endorsed by Ollama Inc. Ollama remains a third-party runtime/API compatibility layer.

## 0.8 — local AI you can see

The 0.8 release turns runtime state and measured performance into first-class UI instead of hiding them behind logs or command-line tools.

### Runtime Observatory

The new **Observatory** page polls the active Ollama engine through `/api/ps` and visualizes:

- models currently resident in memory;
- Ollama-reported runtime memory (`size_vram`);
- actual allocated context length;
- parameter size and quantization;
- keep-alive / expiry state;
- total local runtime allocation versus system/unified memory;
- recent measured decode throughput;
- context residency across loaded models.

On Apple Silicon, Openguin intentionally describes memory as unified memory instead of pretending CPU RAM and GPU VRAM are separate pools.

### Generation pipeline telemetry

The Rust/Tauri streaming bridge now preserves the final Ollama timing metrics:

- total duration;
- model load duration;
- prompt token count;
- prompt evaluation / prefill duration;
- generated token count;
- decode duration;
- stop reason.

The UI can therefore show a real **Load → Prefill → Decode** timeline and measured tok/s history rather than relying on synthetic timing guesses.

### Model Lab

- capability-aware Thinking controls from `/api/show`;
- GPT-OSS thinking levels;
- context controls based on model metadata;
- streaming thinking and answer output;
- generation progress estimate while streaming;
- final real token count and tok/s;
- benchmark history feeding the Observatory.

### Model Library

- live public Ollama Library synchronization;
- Popular / Newest / Featured views;
- capability badges;
- variant selector;
- one-click install through the selected local engine;
- cached offline fallback;
- Hugging Face GGUF discovery and verified import retained.

### Hardware Fit 3

Hardware Fit combines model weight size, parameter metadata, context/KV allowance and OS/runtime headroom. It is explicitly an estimate, while Observatory measurements are labelled as runtime measurements.

### Full diagnostics

Diagnostics contains both Openguin application events and raw bundled Ollama stdout/stderr. Full prompts, model answers and thinking text are not intentionally written to the diagnostic log.

## Architecture

```text
Openguin.app
├── React / Vite desktop UI
│   ├── Overview
│   ├── Observatory
│   ├── Model Passports
│   ├── Model Lab
│   ├── Library
│   └── Diagnostics
├── Tauri 2 / Rust boundary
│   ├── restricted Ollama API bridge
│   ├── streaming + timing telemetry bridge
│   ├── official Ollama Library reader
│   └── verified Hugging Face GGUF importer
├── complete bundled Ollama runtime → 127.0.0.1:11435
├── isolated local model store
└── optional existing Ollama → 127.0.0.1:11434
```

## Build on macOS

The build machine needs Node.js/npm, Rust/Cargo, and normal macOS Tauri prerequisites. Distributed end-user builds do not require Rust or a separate Ollama installation.

```bash
git pull origin main
chmod +x BUILD_MACOS.command
./BUILD_MACOS.command
```

Expected output:

```text
src-tauri/target/release/bundle/macos/Openguin.app
src-tauri/target/release/bundle/dmg/
```

The build pipeline applies runtime fixes, full-log integration, Observatory integration, Openguin branding, the generated penguin icon, static verification, bundled-runtime preparation, and then the real Tauri build.

## Licensing / legal

- Openguin source: [`LICENSE`](LICENSE) — MIT
- copyright: [`COPYRIGHT.md`](COPYRIGHT.md)
- project / trademark notice: [`NOTICE.md`](NOTICE.md)
- third-party notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- model licensing policy: [`docs/MODEL_LICENSING.md`](docs/MODEL_LICENSING.md)
- security policy: [`SECURITY.md`](SECURITY.md)

Model weights retain their upstream licenses. Being downloadable or runnable through Openguin does not grant additional rights.

## Alpha limitations

- The macOS app is not yet a signed/notarized public release.
- Public Ollama Library parsing depends on the website structure and falls back to cached results if parsing fails.
- Hardware Fit is an estimate; runtime Observatory data comes from the selected Ollama engine.
- Interrupted Hugging Face GGUF resume and gated/private Hugging Face authentication remain future work.
