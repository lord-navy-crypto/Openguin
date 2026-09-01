# ModelDock 0.7 quick start (macOS)

## Fastest development test

```bash
git pull origin main
chmod +x RUN_DEV.command
./RUN_DEV.command
```

The launcher applies the current runtime/build integrations, verifies the repository, installs npm dependencies when needed, prepares the bundled Ollama sidecar, and starts Tauri development mode.

## Development prerequisites

- Node.js + npm
- Rust + Cargo
- Xcode Command Line Tools / normal Tauri macOS prerequisites
- standard macOS `curl`, `ditto`, and Python 3

You do **not** need to install Ollama separately. If no Ollama CLI is available on the build machine, ModelDock's preparation script downloads the official macOS Ollama archive and extracts the bundled runtime.

## Runtime behavior

- Bundled ModelDock Ollama: `127.0.0.1:11435`
- Existing normal Ollama: `127.0.0.1:11434`
- Bundled remains the default when it starts successfully.
- A readiness check confirms that `11435` is actually listening before the UI reports it online.
- If bundled startup fails and an external Ollama is already running, ModelDock can fall back to External mode.
- ModelDock does not rewrite the external Ollama model directory, port, or environment settings.

## 0.7 test checklist

1. Open **Overview** and confirm Runtime health is sensible.
2. Switch Bundled → External → Bundled and confirm the installed-model list changes appropriately.
3. Open **My Models**, select a model, and inspect capability badges and Hardware Fit 3.
4. Open **Model Lab**. For a model that reports `thinking`, confirm the Thinking control becomes available.
5. Run a prompt and confirm the response streams progressively, the Thinking trace is separate when present, and the progress bar reaches 100% at completion.
6. Confirm final token count and tok/s are recorded in **Diagnostics**.
7. Open **Library**, press **Sync official**, switch Popular/Newest/Featured, search, choose a size variant, and start an install.
8. Test Hugging Face GGUF search/import if desired; confirm license and SHA/provenance behavior remains available.
9. Open **Diagnostics** and confirm runtime/task/inference events appear without complete prompt or answer text.

## Build a real `.app` / `.dmg`

```bash
git pull origin main
chmod +x BUILD_MACOS.command
./BUILD_MACOS.command
```

Expected output:

```text
src-tauri/target/release/bundle/macos/ModelDock.app
src-tauri/target/release/bundle/dmg/
```

Open the output directory with:

```bash
open src-tauri/target/release/bundle
```

ModelDock is still alpha software and the resulting macOS bundle is not yet a signed/notarized public release.
