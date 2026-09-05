# OpenPenguin runtime behavior

## Does the user need to install Ollama?

**No for a production OpenPenguin build.** The release bundle contains the official Ollama macOS runtime resources inside the application. OpenPenguin launches that private runtime itself on loopback port `127.0.0.1:11435`.

The Git repository intentionally does not store the large third-party runtime. During development/building, `scripts/prepare-ollama-sidecar.sh` downloads or reuses the official macOS archive and copies the complete `Ollama.app/Contents/Resources` runtime into the ignored Tauri resource directory. The finished `.app` / `.dmg` contains that private runtime resource.

The runtime is treated as complete only when the Ollama executable and a usable `llama-server` runner are present.

## What if Ollama is already installed?

OpenPenguin detects common macOS Ollama locations and probes the default Ollama API at `127.0.0.1:11434`. The UI shows whether an external installation/service was found.

The default remains **Bundled**, because it gives OpenPenguin an isolated runtime and model directory. If the private runtime fails readiness and a running external Ollama service is available, OpenPenguin can preserve service availability by falling back to that external runtime.

Switching to External is readiness-first: OpenPenguin probes the target external service before committing the mode change. A failed external probe leaves the current runtime unchanged.

OpenPenguin does **not** silently rewrite an existing Ollama installation, move its models, change its port, or modify its environment variables. A user can switch to **External** and OpenPenguin then uses the existing service as-is.

## Ports and model directories

| Mode | API | Models |
|---|---|---|
| Private bundled | `127.0.0.1:11435` | OpenPenguin app-data model store |
| External | `127.0.0.1:11434` | Managed by the user's Ollama installation |

This separation prevents accidental conflicts and makes removing OpenPenguin independent from an existing Ollama installation.

## Repair behavior

If the private runtime is missing or incomplete, Runtime Repair can download the official macOS Ollama archive into application data. Extraction alone is not considered success: the app performs runtime discovery again and verifies that the repaired private runtime is rediscoverable.

## Source/build behavior

OpenPenguin 0.11 uses static source composition. `desktop:prepare` may prepare ignored runtime resources and deterministic assets, but it must not rewrite tracked Rust/React/TypeScript/CSS/config/docs. See [`SOURCE_OF_TRUTH.md`](SOURCE_OF_TRUTH.md).
