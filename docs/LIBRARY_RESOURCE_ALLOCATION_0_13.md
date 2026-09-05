# OpenPenguin 0.13 — Global Library Ultra resource allocation

## Goal

Global Library should not answer only **“Can I find this model?”**. Before a download starts, it should also answer:

1. **Can this Mac safely store the variant while preserving operator-selected free-space reserve?**
2. **Can the variant run inside the selected context and the validated 0.11 memory envelope?**
3. **If storage is feasible but runtime is constrained, can the user still intentionally keep the model without OpenPenguin pretending it is a recommended operating point?**

This turns model selection into a constrained resource-allocation problem rather than a popularity ranking.

## Resource model

### Runtime memory

0.13 intentionally aligns with the 0.11 Engineering estimator instead of introducing a second incompatible model.

For model file size `S` and requested context `C`:

- estimated resident model memory = `1.18 × S + 0.25 GB`,
- estimated KV/context memory = `max(0.10 × S, 384 MB) × (C / 8192)`,
- additional runtime allowance = `384 MB`.

The runtime budget reserves at least 25% of unified memory or 3 GB for macOS, then applies the selected policy ratio:

- Safe: 82%,
- Balanced: 90%,
- Maximum: 96%.

These are engineering estimates and remain distinct from Observatory measurements.

### Storage capacity

The operator selects a protected free-space reserve of 5, 10, 20 or 30 GB. A variant must fit **in addition to** that reserve.

OpenPenguin separates:

- **steady-state storage** — indexed variant size after installation,
- **peak install headroom** — temporary maximum space required by the current import workflow.

For an Ollama pull, 0.13 uses indexed final variant size as the capacity requirement because the current OpenPenguin backend streams the pull into Ollama's managed model store and does not expose a defensible extra temporary-copy multiplier.

For a Hugging Face GGUF import, the current backend first writes the downloaded GGUF to OpenPenguin's import directory, then uploads the same bytes into Ollama's blob store, and only removes the temporary GGUF after model creation. Therefore 0.13 conservatively models peak headroom as:

`2 × GGUF file size + 2 GB`

The extra 2 GB mirrors the backend's existing safety-headroom policy. This is intentionally more conservative than checking final file size alone.

## Feasibility states

Every downloadable variant is classified as one of:

- **FEASIBLE** — both protected-storage capacity and selected runtime envelope pass,
- **RUNTIME LIMIT** — storage passes but the selected context/policy does not fit the memory budget,
- **STORAGE LIMIT** — runtime estimate passes but protected storage capacity does not,
- **BOTH LIMITED** — both constraints fail,
- **UNKNOWN** — file-size metadata is missing, so OpenPenguin refuses to make a defensible capacity claim.

A runtime-constrained variant may still be intentionally downloaded when storage capacity passes. This is useful when the operator intends to use a smaller context later or simply retain the model. The UI must not label such a point as fully feasible.

A storage-constrained or unknown-size variant is blocked from install.

## Live pre-install verification

The displayed capacity table is advisory and can become stale while other applications consume disk space. Therefore the install action performs a new `system_profile` read immediately before starting a download.

For Hugging Face imports, OpenPenguin also refreshes the GGUF file metadata through `list_hf_gguf_variants` and re-runs the storage assessment using the refreshed exact file size before invoking `import_hf_gguf`.

This creates a two-stage policy:

`Plan from indexed metadata → Re-verify from live machine + refreshed variant metadata → Start install`

## Installed inventory

Capacity Planning reads `/api/tags` from the selected runtime mode and reports current installed model count and indexed footprint. Free storage is already a live system measurement, so installed footprint is descriptive evidence rather than something subtracted again from free space.

## Decision support, not opaque scoring

0.13 deliberately does not introduce a single weighted “best model” score.

The Library may identify the **largest fully feasible variant by file size** under the current constraints. That label is strictly a capacity frontier marker; it is not a claim that the largest file is the highest-quality model.

This preserves the same decision-support principle used by Observatory Ultra: expose constraints and tradeoffs rather than hiding preferences in undocumented weights.

## Industrial & Operations Engineering / broader Engineering mapping

The implementation can be interpreted through several engineering lenses:

- **IOE / resource allocation:** select a feasible model variant under finite memory and storage capacity.
- **Capacity planning:** preserve explicit OS-memory and free-storage reserves instead of consuming every available unit.
- **Operations research:** classify the feasible set before taking an irreversible/expensive action such as a multi-GB download.
- **Systems engineering:** installation feasibility and runtime feasibility are different subsystem constraints and must not be conflated.
- **Reliability engineering:** re-read live storage immediately before install and refresh HF size metadata before import.
- **Human factors / HCI:** explain whether a variant is limited by storage, runtime, both, or insufficient metadata.

## 0.13 invariants

The first 0.13 slice must preserve these rules:

- reuse the 0.11 memory-estimation assumptions,
- keep protected storage reserve operator-visible and adjustable,
- model HF transient import headroom separately from final storage,
- never treat unknown file size as safe,
- re-read live free storage before install,
- re-check refreshed HF GGUF size before import,
- allow intentional storage of runtime-constrained variants only when storage passes,
- block storage-constrained/unknown variants,
- keep “largest feasible” explicitly separate from model-quality claims,
- do not introduce an opaque aggregate score.

Future 0.13 work can add portfolio planning across multiple models, expected download time when trustworthy bandwidth evidence exists, duplicate/blob reuse awareness, and storage cleanup recommendations. Those should remain evidence-driven rather than heuristic decoration.
