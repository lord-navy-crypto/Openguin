# AI CoWork — experimental OpenPenguin module

AI CoWork is an in-development multi-agent coordination layer being incorporated into OpenPenguin as an **experimental module**, not as a stable 0.10 feature.

## Current components

### 1. ChatGPT Web Supervisor
- monitors a dedicated ChatGPT web conversation;
- distinguishes generating from idle states;
- waits for a completed response before another continuation;
- detects context-limit and transient page conditions;
- can reuse a persistent browser login profile.

### 2. Cursor Web Supervisor
- classifies Cursor Agent as working, ready, waiting, failed, login-required, or unknown;
- surfaces state changes without requiring the tab to remain frontmost;
- follows a fail-safe rule: an unknown UI state is not treated as permission to send an action.

### 3. ChatGPT ↔ Cursor Cooperation
The cooperation layer is Git/GitHub-native rather than based on copying long chat transcripts between UIs.

The current logical branch model is:

```text
agent/chatgpt
agent/cursor
coordination
```

The protocol tracks peer and own branch heads, requires a fresh review before own work, and requires a status message after an owned branch changes. Automatic own-work actions remain blocked unless the protocol gate explicitly reaches `OWN_WORK_ALLOWED`.

## OpenPenguin integration boundary

OpenPenguin already acts as a local-AI control plane, runtime observatory, and model-management surface. AI CoWork extends that idea toward supervising and coordinating multiple AI workers.

```text
OpenPenguin desktop shell
        ↓
AI CoWork lifecycle/status bridge
        ↓
ChatGPT Web Supervisor
Cursor Web Supervisor
GitHub-native Cooperation
        ↓
user-authorized workspaces / agent branches
```

For now, the Python implementation remains isolated under `modules/ai-cowork/`. A later integration should expose lifecycle and protocol state through a narrow typed bridge rather than mixing browser/macOS automation directly into the existing Rust/Tauri core.

## Development status

**Experimental.** The migrated code is a development snapshot, not a finished OpenPenguin feature.

Before stable integration, the project still needs:
- a defined Tauri ↔ Python/sidecar lifecycle contract;
- explicit authentication and session boundaries;
- UI surfaces for supervisor state and cooperation gates;
- clearer failure recovery and stop semantics;
- packaging of Python and Playwright dependencies;
- security review for any future action that can modify Git branches or external web sessions.

## Source provenance

See `modules/ai-cowork/MIGRATION.md` for the exact source commit and per-file snapshot manifest.
