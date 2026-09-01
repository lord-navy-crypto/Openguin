# Contributing

Contributions are welcome. ModelDock is desktop-only and currently targets Tauri 2 + React + Rust.

## Before opening a pull request

1. Keep Ollama access behind the Rust/Tauri boundary rather than granting arbitrary shell access to the UI.
2. Do not commit model weights, Ollama binaries, `node_modules`, build artifacts, access tokens, or private URLs.
3. Keep model-license/provenance metadata visible when adding new model sources.
4. Run `python scripts/verify-desktop.py`.
5. Run the frontend build and `cargo check` when your environment has the required toolchains.

## Scope

The project prioritizes local model discovery, runtime management, hardware fit, tuning, benchmarking, provenance, and developer integration.
