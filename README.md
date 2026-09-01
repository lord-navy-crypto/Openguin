# Openguin Desktop Alpha 0.10

Openguin is a **desktop local-AI control center, runtime observatory, and multi-source model index** for discovering, installing, understanding, tuning, benchmarking, comparing, and controlling local models.

> Openguin is independent and is not affiliated with or endorsed by Ollama Inc., Hugging Face, or GitHub. Third-party models and runtimes retain their own licenses and terms.

## 0.10 highlights

### Global Model Index

The Library is no longer limited to one short registry page. It combines three source classes:

- **Ollama registry** — searchable model families with live tag/variant inspection and Ollama pull installation.
- **Hugging Face GGUF** — public GGUF repositories discovered through the Hugging Face Hub API, with per-file quantization/size selection and the existing verified GGUF import pipeline.
- **GitHub discovery** — model-related repositories and projects can appear as metadata results, but arbitrary release binaries/scripts are intentionally **not** executed by Openguin.

Every indexed result can carry source, publisher, description, license state, format, tags/capabilities, popularity metadata, and a risk/installability state. The Library exposes concrete variants instead of pretending a family name is one download.

Examples of variant differences include parameter scale and quantization such as `4b-q4_K_M`, `8b-q8_0`, `fp16`, instruct/thinking variants, and separate GGUF files. Hardware recommendations are computed at the **variant** level whenever a file size is known.

### Broader discovery

Quick discovery chips include model families/publishers such as Qwen, DeepSeek, GLM, MiniMax, InternLM, Yi, Baichuan, Llama, Mistral, and Gemma. These are search shortcuts rather than hard-coded claims that every family is supported by every runtime.

### Self-repairing private Ollama runtime

Overview now includes **Download Ollama Now / Repair Ollama Runtime**.

If the packaged private runtime is missing or incomplete, Openguin can download the official macOS Ollama archive into Openguin's own App Data, extract its complete `Contents/Resources`, and use that repaired runtime on the private `127.0.0.1:11435` endpoint. A repaired App Data runtime takes priority over the packaged copy.

Runtime discovery reports whether the private runtime is missing, installed, running, or needs repair. Raw Ollama stdout/stderr remains available in Diagnostics.

### Advanced Model Lab settings

In addition to context, temperature, Top P, output length and capability-aware Thinking, Model Lab now exposes:

- Top K
- Min P
- Repeat penalty
- deterministic seed (`-1` for normal random behavior)
- model keep-alive / residency duration

These controls are sent to the actual local Ollama request rather than being display-only settings.

### Hardware-aware recommendation

Openguin combines system/unified memory with concrete variant size when available to label variants such as **Excellent**, **Recommended**, **Heavy**, or **Too large**. Hardware Fit and Context Optimizer remain estimates; Observatory measurements remain authoritative once a model is actually loaded.

### Developer Studio redesign

The old standalone JavaScript example has been removed. Developer Studio now explains:

- local-AI use cases;
- Openguin → Tauri/Rust → provider → local-model architecture;
- useful local Ollama endpoints;
- a practical debug order using Task Center, Overview, Observatory and Diagnostics.

### Existing 0.9 features retained

- Runtime Observatory and `/api/ps` memory/context views
- Load → Prefill → Decode generation timing
- preload / keep-alive / unload controls
- Context Optimizer
- model comparison
- cold/warm benchmark
- global floating Task Center with progress/stall detection/cancellation
- full persistent backend logs
- capability-aware Thinking
- verified Hugging Face GGUF SHA/provenance workflow
- complete Openguin penguin icon / `.icns` branding chain

## Architecture

```text
Openguin.app
├── Global Model Index
│   ├── Ollama registry + variants
│   ├── Hugging Face GGUF + file variants
│   └── GitHub discovery metadata
├── Model Lab + Advanced Settings
├── Observatory + Runtime Control
├── Task Center + Diagnostics
├── Tauri 2 / Rust security boundary
│   ├── restricted local Ollama API bridge
│   ├── streaming inference telemetry
│   ├── multi-source public metadata index
│   ├── verified GGUF importer
│   └── private Ollama runtime repair
├── private Ollama → 127.0.0.1:11435
└── optional existing Ollama → 127.0.0.1:11434
```

## Build on macOS

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

The build pipeline applies runtime fixes, full logs, Observatory, 0.9 performance controls, Task Center, 0.10 Library/runtime/settings expansion, Openguin branding/icons, verification, bundled-runtime preparation, and then the real Tauri build.

## Model indexing and safety policy

Openguin can index much more than the small set visible on a single home page, but it intentionally distinguishes **discovery** from **safe one-click installation**.

- Ollama registry entries use the selected Ollama provider's normal pull path.
- Hugging Face GGUF one-click import is enabled only when required metadata such as a recognizable license is present; gated or unclear entries are marked for review.
- GitHub results are discovery-only by default. Openguin does not execute arbitrary repositories, installers, releases, or scripts.
- Model cards/metadata are not a substitute for reading an upstream license or usage restrictions.

## Licensing / legal

- Openguin source: `LICENSE` — MIT
- project/trademark notice: `NOTICE.md`
- third-party notices: `THIRD_PARTY_NOTICES.md`
- model policy: `docs/MODEL_LICENSING.md`
- security policy: `SECURITY.md`

## Alpha limitations

- macOS bundles are not yet signed/notarized public releases.
- Web-page parsing of Ollama registry/tag pages can require maintenance when the public page structure changes.
- Hugging Face APIs are rate-limited and gated/private models need a future authenticated workflow.
- GitHub metadata search is discovery-only and subject to public API rate limits.
- Hardware recommendations are estimates; measured runtime data takes precedence.
