# Openguin 0.10 quick start (macOS)

## Fastest development test

```bash
git pull origin main
chmod +x RUN_DEV.command
./RUN_DEV.command
```

The launcher applies runtime repair logic, full logs, Observatory, performance controls, Task Center, the 0.10 Global Library/settings expansion, Openguin branding/icons, verification, bundled-runtime preparation, and then starts Tauri development mode.

## Runtime behavior

- Private Openguin Ollama: `127.0.0.1:11435`
- Existing normal Ollama: `127.0.0.1:11434`
- A repaired runtime stored in Openguin App Data takes priority over the packaged copy.
- If private runtime is missing/incomplete, use **Overview → Download Ollama Now / Repair Ollama Runtime**.
- If private startup fails and an external Ollama is running, Openguin can fall back to External mode.

## 0.10 test checklist

1. Open **Overview**. If Bundled is unavailable, click **Download Ollama Now** and watch the global Task Center plus the card progress bar.
2. Confirm Bundled mode starts on `:11435` after repair.
3. Open **Library**. Search with **All**, then separately test **Ollama**, **HF GGUF**, and **GitHub** source filters.
4. Search `Qwen` or `DeepSeek`, open an Ollama model family, and confirm concrete tags/quantizations appear as separate downloads.
5. Open a Hugging Face GGUF result and confirm individual GGUF files appear separately with size and quantization.
6. Confirm a known-license public GGUF can use the verified import path; unclear/gated results should require review.
7. Confirm GitHub results are discovery-only and do not expose arbitrary one-click execution.
8. Check the Library hardware fit label for concrete variants.
9. Open **Model Lab** and confirm Advanced Settings includes Top K, Min P, Repeat Penalty, Seed, and Keep Alive.
10. Test a thinking-capable model and confirm Thinking remains capability-aware.
11. Open **Observatory** and verify loaded models, runtime memory, context residency, memory history, cold/warm benchmark, preload/unload and Context Optimizer.
12. Open **Developer** and confirm the old JavaScript sample is gone.
13. Open **Diagnostics** and confirm Openguin events plus raw Ollama stdout/stderr are available.

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

## Completely overwrite a local checkout with the latest main

**Warning:** this intentionally deletes uncommitted and untracked files inside the repository.

```bash
cd /path/to/esay-local-model
git fetch origin
git reset --hard origin/main
git clean -fdx
chmod +x BUILD_MACOS.command RUN_DEV.command
./BUILD_MACOS.command
open src-tauri/target/release/bundle/macos/Openguin.app
```

Openguin is alpha software and the resulting bundle is not yet a signed/notarized public release.
