# OpenPenguin Source-of-Truth Policy

OpenPenguin 0.11 adopts a static source-of-truth build model.

## Production rule

The source reviewed in Git must be the source compiled into the desktop app.

Production Rust, React, TypeScript, CSS, configuration and documentation changes must be committed directly. A desktop build must not depend on a preparation script rewriting tracked source before compilation.

## What `desktop:prepare` may do

`desktop:prepare` is limited to build resources that are not production source composition:

- generate deterministic app-icon assets,
- download or assemble the ignored private Ollama runtime resource,
- prepare other ignored/generated build resources when explicitly documented.

It must not patch `.rs`, `.tsx`, `.ts`, `.css`, Markdown, JSON configuration, workflow files or other tracked project source.

## Verification rule

Read-only verification belongs in `verify:*` scripts. `verify:all` is the production contract suite and must fail loudly when a required integration is missing.

Migration scripts may remain in `scripts/` for historical/pre-0.11 checkouts, but they must not appear in `desktop:prepare`, `desktop:dev`, `desktop:build`, or production CI.

## CI invariant

The macOS build performs preparation once, runs all contracts, then runs a whole-tree tracked-source check before compilation:

```bash
git diff --quiet
```

Ignored runtime resources may be generated, but any tracked-file diff after preparation is a build failure.

CI then calls Tauri directly so the checked tree is the tree that is compiled; it does not call a second preparation pass through `desktop:build`.

## Change checklist for future versions

When adding a production feature:

1. Commit its module/component directly.
2. Wire imports and Tauri handlers directly in normal source.
3. Add or extend a read-only contract that verifies the integration.
4. Keep resource generation separate from source composition.
5. Confirm preparation leaves the tracked tree clean.
6. Confirm Universal2 build and architecture checks pass.

A feature that exists only after a source-mutating patch is not considered integrated.
