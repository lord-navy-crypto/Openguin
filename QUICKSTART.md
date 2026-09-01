# ModelDock 0.6 quick start (macOS)

## Fastest source test

Clone the repository, enter it, then run:

```bash
chmod +x RUN_DEV.command
./RUN_DEV.command
```

Or double-click `RUN_DEV.command` in Finder after cloning/downloading the source.

The launcher checks the development toolchain, verifies the repository, installs npm dependencies if needed, prepares the bundled Ollama sidecar, and starts Tauri development mode.

## Development prerequisites

- Node.js + npm
- Rust + Cargo
- Xcode Command Line Tools / Tauri macOS prerequisites
- standard macOS `curl` and `ditto`

**You do not need to install Ollama separately.** If no Ollama CLI exists on the build machine, the sidecar preparation script downloads the official `Ollama-darwin.zip` during the build/dev preparation step and extracts the runtime that ModelDock uses.

## If you already installed Ollama

That is fine. ModelDock detects it automatically.

- ModelDock's bundled runtime remains the default and runs on `127.0.0.1:11435`.
- Your existing Ollama normally stays on `127.0.0.1:11434`.
- ModelDock does not move your existing models or rewrite your external Ollama settings.
- Overview shows the external installation/path/version when detected.
- Click **Use Existing Ollama** to view/use the models already managed by that Ollama instance.
- Click **Use ModelDock Runtime** to return to the isolated bundled runtime.

## First test

1. Start ModelDock.
2. On Overview, check **Runtime Auto Setup**.
3. Confirm Bundled says `Included` (once the Tauri sidecar has been prepared).
4. Go to Library → Ollama Direct.
5. Install a small model you are comfortable testing.
6. Go to Model Lab, choose the model and run a short prompt.
7. Confirm tok/s appears and the run is added to Benchmark history.
8. If you already use Ollama, switch to External and verify your existing model list appears, then switch back to Bundled.

## Build a real app/dmg

```bash
./BUILD_MACOS.command
```

The output is expected under:

```text
src-tauri/target/release/bundle/
```

This repository is alpha software and the resulting app is not yet a signed/notarized public release.
