# OpenPenguin Source-of-Truth Policy

OpenPenguin 0.11 adopts a static source-of-truth build model.

## Production rule

The source reviewed in Git must be the source compiled into the desktop app. Checked-in **production source** is the authoritative implementation.

Production Rust, React, TypeScript, CSS, configuration and documentation changes must be committed directly. A desktop build must not depend on a preparation script rewriting tracked source before compilation.

## What `desktop:prepare` may do

`desktop:prepare` is limited to deterministic build assets that do not change product behavior:

- generate deterministic app-icon assets,
- prepare other ignored/generated visual build assets when explicitly documented.

The normal preparation path must **not** download, assemble, install, or package the private Ollama runtime. The private Ollama runtime is an explicit opt-in user capability and is downloaded into OpenPenguin App Data only after user approval in the Runtime Installer. `scripts/prepare-ollama-sidecar.sh` remains a manual developer utility and is not part of normal dev/build/CI preparation.

`desktop:prepare` must not patch `.rs`, `.tsx`, `.ts`, `.css`, Markdown, JSON configuration, workflow files or other tracked project source.

## Verification rule

Read-only verification belongs in `verify:*` scripts. `verify:all` is the production contract suite and must fail loudly when a required integration is missing.

Migration scripts may remain in `scripts/` for historical/pre-0.11 checkouts, but they must not appear in `desktop:prepare`, `desktop:dev`, `desktop:build`, or production CI.

## CI invariant

The macOS build performs deterministic asset preparation once, runs all contracts, then runs a whole-tree tracked-source check before compilation:

```bash
git diff --quiet
```

Ignored deterministic assets may be generated, but any tracked-file diff after preparation is a build failure.

CI then calls Tauri directly so the checked tree is the tree that is compiled; it does not call a second preparation pass through `desktop:build`.

## Runtime-consent invariant

The default `.app` / `.dmg` must not contain the private Ollama runtime. Normal startup must not install it. Download/repair is an explicit user action with a confirmation step. A developer may still run the manual private-runtime preparation utility intentionally for controlled testing.

## Change checklist for future versions

When adding a production feature:

1. Commit its module/component directly.
2. Wire imports and Tauri handlers directly in normal source.
3. Add or extend a read-only contract that verifies the integration.
4. Keep deterministic resource generation separate from source composition.
5. Keep private runtime installation outside automatic build/startup paths.
6. Confirm preparation leaves the tracked tree clean.
7. Confirm Universal2 build and architecture checks pass.

A feature that exists only after a source-mutating patch is not considered integrated.
