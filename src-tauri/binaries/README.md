# Bundled Ollama sidecar

ModelDock packages the Ollama executable as a Tauri sidecar named `ollama-modeldock`.
Tauri requires a target-triple suffix at build time, for example:

- Apple Silicon: `ollama-modeldock-aarch64-apple-darwin`
- Intel macOS: `ollama-modeldock-x86_64-apple-darwin`

Do **not** commit third-party runtime binaries blindly. Use `scripts/prepare-ollama-sidecar.sh`
to copy a locally installed Ollama CLI into the correct filename before a desktop build.
The final distribution process should pin and verify the Ollama version and preserve its license notice.

ModelDock's bundled runtime uses:

- host: `127.0.0.1:11435`
- models: ModelDock application-data directory (`ollama/models`)

This intentionally stays separate from a user's normal Ollama service on port `11434`.
