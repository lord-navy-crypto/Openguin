# Bundled Ollama sidecar

ModelDock packages the Ollama CLI/runtime as a Tauri sidecar named `ollama-modeldock`.
Tauri uses a target-triple suffix at build time:

- Apple Silicon: `ollama-modeldock-aarch64-apple-darwin`
- Intel macOS: `ollama-modeldock-x86_64-apple-darwin`

The binary is intentionally **not committed** to this source repository. `scripts/prepare-ollama-sidecar.sh` obtains it at build/dev time by using `OLLAMA_BIN`, reusing a locally installed Ollama CLI, or downloading the official macOS Ollama archive when neither is available.

A finished ModelDock `.app` / `.dmg` contains the sidecar, so end users do not need a separate Ollama installation.

ModelDock's bundled runtime uses:

- API: `127.0.0.1:11435`
- models: ModelDock application-data directory (`ollama/models`)

A user's existing Ollama remains separate on its normal `127.0.0.1:11434` endpoint. Preserve the Ollama MIT notice in distributed builds; see `THIRD_PARTY_NOTICES.md`.
