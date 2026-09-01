# ModelDock runtime behavior

## Does the user need to install Ollama?

**No for a production ModelDock build.** The intended release bundle contains an Ollama CLI/runtime sidecar inside the ModelDock application. On launch, ModelDock starts that private runtime itself.

The Git repository intentionally does not store the large third-party binary. During development/building, `scripts/prepare-ollama-sidecar.sh` obtains a build-time Ollama executable and places it in the Tauri sidecar location. The finished `.app` / `.dmg` then contains that executable.

## What if Ollama is already installed?

ModelDock 0.6 detects common macOS Ollama locations and probes the default Ollama API at `127.0.0.1:11434`. The UI shows whether an external installation/service was found.

The default remains **Bundled**, because it gives ModelDock an isolated runtime and model directory. If bundled Ollama is unavailable in a development build, ModelDock can automatically fall back to a running external Ollama service.

ModelDock does **not** silently rewrite an existing Ollama installation, move its models, change its port, or modify its environment variables. A user can switch to **External** with one click and ModelDock then uses the existing service as-is.

## Ports and model directories

| Mode | API | Models |
|---|---|---|
| Bundled | `127.0.0.1:11435` | ModelDock app-data model store |
| External | `127.0.0.1:11434` | Managed by the user's Ollama installation |

This separation prevents accidental conflicts and makes uninstalling ModelDock independent from an existing Ollama installation.
