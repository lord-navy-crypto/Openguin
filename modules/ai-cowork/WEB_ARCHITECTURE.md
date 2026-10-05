# AI-cowork Web Product Architecture

The active product is web-first. Desktop/App automation is frozen until the three web modules are stable.

## Shared runtime

One persistent Chromium profile owns both authenticated pages. Multiple Chromium instances must not open the same profile concurrently.

## Module 1 — ChatGPT Web Supervisor

Responsibilities:
- detect generating vs idle
- wait for a real assistant response before another continue
- send continue only after confirmed idle
- detect context-limit conditions
- recover transient page failures
- stop safely on repeated failures or expired login

## Module 2 — Cursor Web Supervisor

Responsibilities:
- classify Cursor Agent as WORKING / READY / WAITING / FAILED / LOGIN_REQUIRED / UNKNOWN
- surface state changes without requiring the Cursor tab to be frontmost
- later: safe continuation only when the page exposes a verified input/action surface
- never guess-send into an unknown Cursor UI state

## Module 3 — ChatGPT ↔ Cursor Cooperation

Transport remains GitHub-native:

- ChatGPT writes: agent/chatgpt
- Cursor writes: agent/cursor
- both append: coordination/messages
- main is protected/read-only during normal agent work

Mandatory protocol:
1. fetch/read peer branch
2. read new coordination messages
3. review peer work
4. append a NEW review/advice message
5. do own work on owned branch
6. append a NEW status message with commit SHA

The local Cooperation module monitors branch heads and coordination messages. It must not copy large chat transcripts between UIs.

## Product rule

The three modules share browser/session infrastructure but have independent state and controls. The desktop Accessibility implementation is archived and receives no new feature work until these three web modules are stable.


## Cooperation gate semantics

When Cooperation is enabled, automatic ChatGPT/Cursor actions are **fail-closed** until the first valid Git snapshot arrives.

Protocol states:

- `REVIEW_REQUIRED` — own work is blocked. A fresh review must record both the current peer head and the current own head baseline.
- `OWN_WORK_ALLOWED` — the fresh review gate has passed. This is the only state that permits automatic own-work actions.
- `STATUS_REQUIRED` — own branch changed after review; append a status that records the current own head.
- `READY` — the previous work cycle is fully closed. It does **not** permit another automatic work cycle; a new review is required first.

New-format coordination messages use exact Git SHA metadata rather than cross-branch wall-clock ordering:

```text
Review:
  Peer head reviewed: <peer SHA>
  Own head: <own SHA at review>

Status:
  Own head: <current own SHA>
```

The coordination branch's own Git history determines whether review or status is newer.

## Fault isolation

- ChatGPT page failures pause only ChatGPT Supervisor.
- Cursor page failures pause only Cursor Supervisor.
- Cooperation fetch failures keep the protocol gate closed but do not close Chromium.
- Cooperation-only mode does not start Chromium.
- Runtime state and an event journal are persisted under `state/` for diagnostics.
