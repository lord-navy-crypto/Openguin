# Openguin Desktop Alpha 0.9

Openguin is a **desktop-only local AI control center and runtime observatory** for discovering, installing, understanding, tuning, benchmarking, visualizing, comparing, and controlling local models.

> Openguin is an independent project. It is not affiliated with or endorsed by Ollama Inc. Ollama remains a third-party runtime/API compatibility layer.

## 0.9 — observe, compare, optimize, control

0.9 turns the 0.8 Observatory into a closed-loop local-AI control surface. Openguin now separates **estimates** from **runtime measurements** and lets the user act on what the runtime reports.

### Runtime Observatory

The Observatory polls the active Ollama engine through `/api/ps` and visualizes:

- models currently resident in memory;
- Ollama-reported runtime allocation (`size_vram`);
- actual allocated context length;
- parameter size and quantization;
- keep-alive / expiry state;
- total runtime allocation versus system/unified memory;
- recent measured decode throughput;
- context residency across loaded models;
- a rolling 60-sample memory history.

On Apple Silicon, Openguin intentionally describes memory as unified memory instead of pretending CPU RAM and GPU VRAM are separate pools.

### Runtime control

0.9 adds direct model lifecycle controls using the allowed local Ollama API bridge:

- preload a model without generating a normal answer;
- choose a keep-alive period;
- unload a model immediately with `keep_alive: 0`;
- refresh loaded-model state after each lifecycle action.

This is intentionally exposed as a local runtime control rather than hidden behind a terminal command.

### Context Optimizer

The new Context Optimizer combines:

- model weight size;
- parameter metadata when available;
- total system/unified memory;
- conservative runtime headroom;
- estimated KV/context cost.

It reports both a **recommended context** and a more aggressive **estimated ceiling**. These remain planning estimates; `/api/ps` and benchmark telemetry are treated as measured runtime data.

### Model Comparator

Select up to three installed models and compare:

- on-disk size;
- parameter count;
- quantization;
- architecture/family.

The comparison is designed to sit beside Hardware Fit and measured benchmark data so model choice is not reduced to model size alone.

### Controlled cold / warm benchmark

0.9 adds a deterministic small benchmark that:

1. unloads the selected model;
2. runs a cold generation;
3. immediately runs the same generation again while the model is warm;
4. records cold/warm load time and decode throughput separately.

The benchmark uses a fixed tiny prompt and output target so it does not store or benchmark the user's private conversation content.

### Generation pipeline telemetry

The Rust/Tauri streaming bridge preserves the final Ollama timing metrics:

- total duration;
- model load duration;
- prompt token count;
- prompt evaluation / prefill duration;
- generated token count;
- decode duration;
- stop reason.

The UI therefore shows a real **Load → Prefill → Decode** timeline and measured tok/s history rather than relying on synthetic timing guesses.

### Model Lab and Library retained

- capability-aware Thinking controls from `/api/show`;
- GPT-OSS thinking levels;
- streaming thinking and answer output;
- final real token count and tok/s;
- live public Ollama Library synchronization;
- Popular / Newest / Featured views;
- capability badges and variants;
- one-click install;
- Hugging Face GGUF discovery, SHA verification, provenance and license handling.

### Diagnostics retained

Diagnostics contains both Openguin application events and raw bundled Ollama stdout/stderr. Full prompts, model answers and thinking text are not intentionally written to the diagnostic log.

## Design references

The 0.9 control model is informed by current local-AI tooling patterns:

- Ollama exposes loaded models and context allocation through `/api/ps`, lifecycle control through `keep_alive`, and detailed generation timing metrics.
- LM Studio treats load/unload, context length, TTL and memory estimation as first-class model lifecycle controls.
- Jan places hardware fit and hardware monitoring directly in the model-management workflow.
- llama.cpp server exposes slot/KV-cache/throughput metrics, reinforcing the value of a provider-independent observability layer.

Openguin does not copy those interfaces. It uses the same underlying product lesson: local AI is easier to manage when model choice, resource use and runtime state are visible together.

## Architecture

```text
Openguin.app
├── React / Vite desktop UI
│   ├── Overview
│   ├── Observatory
│   │   ├── loaded models + memory/context
│   │   ├── runtime lifecycle control
│   │   ├── Context Optimizer
│   │   ├── model comparator
│   │   ├── cold/warm benchmark
│   │   └── performance history
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

The build pipeline applies runtime fixes, full logs, Observatory integration, 0.9 performance controls, Openguin branding, the generated penguin icon, static verification, bundled-runtime preparation, and then the real Tauri build.

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
- Hardware Fit and Context Optimizer values are estimates; Observatory data comes from the selected runtime.
- CPU/GPU utilization history is not yet sampled from native macOS performance counters; current history tracks model/runtime allocation.
- llama.cpp and MLX are architectural provider targets, not active 0.9 backends.
- Interrupted Hugging Face GGUF resume and gated/private Hugging Face authentication remain future work.
