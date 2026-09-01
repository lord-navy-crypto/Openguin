# ModelDock Desktop Alpha 0.6

ModelDock is a **desktop-only local model control center** designed to make local AI models easier to discover, install, understand, tune, benchmark, and integrate.

> ModelDock is an independent project. It is not affiliated with or endorsed by Ollama Inc.

## What 0.6 adds

### Zero separate Ollama setup for end users

Production builds bundle an Ollama CLI/runtime sidecar inside the ModelDock application. On first launch ModelDock starts its isolated runtime on `127.0.0.1:11435` and stores its models in ModelDock app data. End users do not need to install Ollama separately.

The repository does not commit the large third-party Ollama binary. During a macOS build, `scripts/prepare-ollama-sidecar.sh` follows this order:

1. use `OLLAMA_BIN` if the builder explicitly supplies one;
2. reuse a locally installed Ollama CLI if present;
3. otherwise download the official macOS Ollama archive at build time and extract the CLI for Tauri sidecar bundling.

### Existing Ollama auto-detection

If a user already has Ollama installed, ModelDock detects common macOS CLI locations and probes the normal local API at `127.0.0.1:11434`.

- **Bundled remains the default** when available, so ModelDock stays isolated.
- If a development build is missing the bundled sidecar but an external Ollama service is already running, ModelDock automatically falls back to External mode.
- If external Ollama is installed but stopped, ModelDock reports that state and lets the user switch after they start it.
- ModelDock does **not** silently rewrite external ports, environment variables, or model directories.

See [`docs/ENGINE_BEHAVIOR.md`](docs/ENGINE_BEHAVIOR.md).

### Runtime Auto Setup UI

Overview now shows bundled availability, external Ollama detection, external version/path, and one-click switching between the isolated ModelDock runtime and an existing Ollama service.

### Hardware Fit 2

Hardware Fit now includes a conservative runtime-memory estimate based on model weight size plus a context allowance. This remains an estimate rather than a benchmark. Model Lab updates the estimate when context changes.

### Persistent local benchmark history

Model Lab stores the last 20 local runs on the device and displays model, context, and measured generation speed. No benchmark history is uploaded by ModelDock.

### Provenance / lineage visibility

Hugging Face results continue to display upstream license metadata and now surface base-model lineage tags when the Hub provides them. Direct GGUF import still hashes downloads locally, verifies LFS SHA-256 when available, records provenance, registers the blob with Ollama, and removes duplicate staging data after successful import.

## Core architecture

```text
ModelDock.app
├── React / Vite desktop UI
├── Tauri 2 / Rust security boundary
├── bundled Ollama sidecar → 127.0.0.1:11435
├── isolated ModelDock model store
└── optional existing Ollama → 127.0.0.1:11434
```

The frontend does not receive arbitrary shell access. Local privileged operations are exposed through narrow Tauri commands.

## Build and run on macOS

### Prerequisites

You need these only to **develop/build** ModelDock:

- Node.js + npm
- Rust + Cargo
- macOS Tauri prerequisites / Xcode command line tools
- curl + ditto (standard macOS tools)

You do **not** need to separately install Ollama: the sidecar preparation script can fetch the official macOS archive at build time.

### Development

```bash
npm install
npm run desktop:dev
```

### Build `.app` / `.dmg`

```bash
./BUILD_MACOS.command
```

Or:

```bash
npm install
npm run desktop:build
```

Built bundles are under `src-tauri/target/release/bundle/`.

## Test checklist

1. Launch ModelDock.
2. Overview should show **Bundled Ollama ready** in a production bundle.
3. If normal Ollama is installed/running, Overview should also show **Existing Ollama: Running** and its version/path.
4. Keep Bundled selected and install a small test model in Library.
5. Open Model Lab and run a prompt. Confirm tok/s and benchmark history appear.
6. If you already use normal Ollama, switch to External and confirm its models appear without moving or copying them.
7. Switch back to Bundled and confirm the ModelDock model list is isolated again.

## Licensing / legal

- ModelDock source: [`LICENSE`](LICENSE) (MIT)
- copyright: [`COPYRIGHT.md`](COPYRIGHT.md)
- project / trademark notices: [`NOTICE.md`](NOTICE.md)
- third-party notices, including the Ollama MIT notice: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- model licensing policy: [`docs/MODEL_LICENSING.md`](docs/MODEL_LICENSING.md)
- security policy: [`SECURITY.md`](SECURITY.md)

Model weights always keep their own upstream licenses. ModelDock does not grant additional rights to a model merely because it can download or run it.

## Alpha limitations

- ModelDock is not yet a signed/notarized production release.
- Hardware Fit is an estimate and should not be treated as a measured performance guarantee.
- Resume support for interrupted Hugging Face GGUF downloads is still planned.
- Gated/private Hugging Face repositories require future authentication support.

## Next

0.7 priorities: richer model-family graph, resumable downloads, editable imported-model names, release automation/signing groundwork, and deeper per-hardware benchmark comparison.
