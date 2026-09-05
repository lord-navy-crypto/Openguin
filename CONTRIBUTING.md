# Contributing

Contributions are welcome. OpenPenguin is desktop-only and currently targets Tauri 2 + React + Rust.

## Before opening a pull request

1. Keep Ollama access behind the Rust/Tauri boundary rather than granting arbitrary shell access to the UI.
2. Do not commit model weights, Ollama runtime binaries, `node_modules`, build artifacts, access tokens, or private URLs.
3. Keep model-license/provenance metadata visible when adding new model sources.
4. Commit production Rust/React/TypeScript/CSS/config/docs directly; do not make a feature depend on a source-mutating prepare script.
5. Run `npm run verify:all`.
6. Run the frontend build and `cargo check` when your environment has the required toolchains.
7. For desktop changes, confirm `desktop:prepare` leaves the tracked Git tree clean and the Universal2 build still contains both `arm64` and `x86_64` slices.

See [`docs/SOURCE_OF_TRUTH.md`](docs/SOURCE_OF_TRUTH.md) for the source-composition policy.

## Scope

The project prioritizes local model discovery, runtime management, hardware fit, tuning, benchmarking, provenance, reliability, engineering observability, and developer integration.
