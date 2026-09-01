# Openguin 0.9 quick start (macOS)

## Fastest development test

```bash
git pull origin main
chmod +x RUN_DEV.command
./RUN_DEV.command
```

The launcher applies runtime fixes, full logs, Observatory integration, 0.9 performance controls, Openguin branding, the generated penguin icon, static verification, bundled-runtime preparation, and then starts Tauri development mode.

## Development prerequisites

- Node.js + npm
- Rust + Cargo
- Xcode Command Line Tools / normal Tauri macOS prerequisites
- standard macOS `curl`, `ditto`, and Python 3

You do **not** need to install Ollama separately. The preparation step can download the official macOS Ollama archive and bundle its complete runtime resources.

## Runtime behavior

- Bundled Openguin Ollama runtime: `127.0.0.1:11435`
- Existing normal Ollama: `127.0.0.1:11434`
- Bundled remains the default when it passes readiness checks.
- If bundled startup fails and an external Ollama is already running, Openguin can fall back to External mode.
- Openguin does not rewrite the external Ollama model directory, port, or environment settings.

## 0.9 test checklist

1. Open **Overview** and confirm runtime health.
2. Open **Observatory** and confirm `/api/ps` live telemetry updates.
3. Run a model in **Model Lab**, then confirm Loaded Models, Runtime Memory Map, Context Residency and Generation Pipeline update.
4. In Observatory, test **Preload** with a short keep-alive, then **Unload** and verify memory is released.
5. Check **Context Optimizer** for the selected model. Treat its values as estimates, then compare them with actual `/api/ps` allocation.
6. Select up to three models in **Model Comparator** and confirm disk size, params, quantization and family are displayed side-by-side.
7. Run **Cold + warm benchmark** and confirm cold/warm load time and tok/s are stored separately.
8. Leave Observatory open briefly and confirm the rolling memory-history SVG updates.
9. Test a thinking-capable model and confirm Thinking controls and separate thinking output remain functional.
10. Open **Library**, press **Sync official**, and test an install.
11. Open **Diagnostics** and confirm application events and raw bundled Ollama logs are available without complete prompt/answer contents.

## Build a real `.app` / `.dmg`

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

Open the output directory with:

```bash
open src-tauri/target/release/bundle
```

Openguin is still alpha software and the resulting macOS bundle is not yet a signed/notarized public release.
