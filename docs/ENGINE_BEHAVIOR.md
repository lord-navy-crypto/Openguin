# OpenPenguin runtime behavior

## Does the user need to install Ollama?

**Not necessarily.** OpenPenguin can use an already-running external Ollama service, or the user can explicitly opt in to an OpenPenguin-managed private runtime.

The default OpenPenguin `.app` / `.dmg` **does not contain the private Ollama runtime**. First launch performs runtime discovery only; it does not download or install Ollama into OpenPenguin App Data.

If the user wants the private runtime, the Overview Runtime Installer provides an optional **Download Ollama** action. The app asks for explicit confirmation before calling the runtime download/repair backend. Only after that user-approved action does OpenPenguin download the official macOS Ollama archive into its own App Data runtime directory.

The runtime is treated as complete only when the Ollama executable and a usable `llama-server` runner are present.

## What if Ollama is already installed?

OpenPenguin detects common macOS Ollama locations and probes the default Ollama API at `127.0.0.1:11434`. If that external service is already running, OpenPenguin can use it without installing or modifying anything.

On a clean OpenPenguin install, private bundled mode is unavailable until the user opts in to the private runtime download. After a user has explicitly installed the private runtime, later launches may reuse that already-approved App Data runtime.

Switching to External is readiness-first: OpenPenguin probes the target external service before committing the mode change. A failed external probe leaves the current runtime unchanged.

OpenPenguin does **not** silently rewrite an existing Ollama installation, move its models, change its port, or modify its environment variables. A user can switch to **External** and OpenPenguin then uses the existing service as-is.

## Ports and model directories

| Mode | API | Models |
|---|---|---|
| Private opt-in | `127.0.0.1:11435` | OpenPenguin app-data model store |
| External | `127.0.0.1:11434` | Managed by the user's Ollama installation |

This separation prevents accidental conflicts and makes removing OpenPenguin independent from an existing Ollama installation.

## Download / repair behavior

If the user explicitly chooses the private runtime, Runtime Installer first asks for confirmation. After approval it downloads the official macOS Ollama archive into application data. Extraction alone is not considered success: the app performs runtime discovery again and verifies that the repaired private runtime is rediscoverable.

Runtime repair remains an explicit user action. OpenPenguin does not call it during first launch, `desktop:prepare`, normal development startup, or normal packaging.

## Developer-only sidecar preparation

`scripts/prepare-ollama-sidecar.sh` remains available as a manual developer utility for controlled testing of a packaged-style runtime directory. It is **not** part of `desktop:prepare`, `desktop:dev`, `desktop:build`, or CI.

## Source/build behavior

OpenPenguin uses static source composition. `desktop:prepare` prepares deterministic app assets only and must not download a private Ollama runtime or rewrite tracked Rust/React/TypeScript/CSS/config/docs. See [`SOURCE_OF_TRUTH.md`](SOURCE_OF_TRUTH.md).
