# OpenPenguin 0.13 — Multi-model portfolio planning

## Purpose

Single-variant feasibility answers whether one model can be stored and run under the current capacity policy. A real local-AI workstation often keeps several models for different workloads, so 0.13 adds a separate **portfolio planning** layer.

The first portfolio slice is deliberately storage-focused. It does not pretend every planned model will be simultaneously resident in unified memory.

## Portfolio dataset

Users may pin downloadable variants from different model entries into a bounded local planning dataset. Each item retains:

- source model ID and display name,
- variant ID and label,
- source registry,
- quantization when known,
- indexed file size when known,
- time added.

The portfolio is local and bounded to 24 items. JSON export uses schema `openguin.library.portfolio.v1`.

## Storage allocation model

The planner assumes every pinned variant is a new addition. It deliberately assumes **no blob deduplication, shared-layer reuse or already-installed duplicate savings** until OpenPenguin has runtime evidence that can prove those savings.

For a portfolio with known item sizes:

`steady total = sum(all final variant sizes)`

Each item also has a transient install overhead:

`transient overhead = peak install requirement - final variant size`

For sequential installs, an order-independent conservative upper bound is:

`portfolio peak <= steady total + max(per-item transient overhead)`

OpenPenguin uses that conservative bound for capacity planning. It does not claim that this is the exact peak for every install order; it is a safe upper-bound model that does not require inventing an optimization schedule.

The protected free-storage reserve selected in Global Library remains part of the portfolio constraint.

## Unknown-size policy

If any pinned item lacks defensible file-size metadata, the portfolio state is **unknown**. OpenPenguin may still retain the item in the plan, but it does not report the complete portfolio as storage-feasible.

This is stricter than silently treating an unknown item as zero bytes.

## Runtime policy

Runtime feasibility is computed **per model item** using the same context/policy and 0.11-aligned memory estimator as single-variant Capacity Planning.

The first portfolio slice intentionally does not sum projected runtime memory across every pinned model. Doing so would imply simultaneous model residency, which is not part of the current portfolio contract.

A later resident-set planner may model simultaneous residency explicitly if OpenPenguin adds controls for a concrete co-resident set.

## Decision interpretation

Portfolio Planning reports:

- planned variant count,
- number with known sizes,
- total steady-state storage,
- conservative sequential-install peak,
- transient allowance,
- protected-storage margin,
- count of models individually run-feasible under the shared target context/policy.

This is capacity allocation, not a ranking. It answers whether a proposed local model collection is supportable under the current machine constraints.

## IOE / systems connection

The portfolio extends the operations-engineering framing from a single decision to a small resource-allocation set:

- **capacity planning:** allocate finite local storage across several model assets,
- **robust planning:** preserve reserve and account for transient install overhead,
- **uncertainty handling:** unknown sizes invalidate a complete feasibility claim,
- **systems engineering:** separate persistent storage allocation from transient runtime residency,
- **human factors:** show the assumptions (no dedup, sequential install, per-model runtime) instead of hiding them.

## Invariants

- portfolio state is local and bounded,
- unknown-size items cannot be counted as zero,
- steady storage sums known final sizes,
- conservative peak uses steady total plus the largest per-item transient overhead,
- protected free-storage reserve remains active,
- no dedup/reuse savings are assumed without evidence,
- runtime feasibility remains per item in this slice,
- users can remove items, clear the plan, and export JSON,
- portfolio planning does not automatically install anything.
