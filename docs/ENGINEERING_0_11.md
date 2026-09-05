# OpenPenguin 0.11 — Adaptive Runtime Engineering

## Product thesis

OpenPenguin should not behave as a thin Ollama GUI. It should behave as a local-AI engineering workstation that observes the Mac, estimates an operating envelope, chooses a safe runtime policy, exposes the reasoning behind that policy, and verifies the resulting system state.

The engineering loop is:

**Sense → Estimate → Decide → Actuate → Verify**

0.11 starts the first four visible layers while keeping automatic actuation conservative until the measurements and controller have been validated on real Macs.

## Layer A — Sensors

Current 0.10 commands already expose machine and runtime facts through `system_profile` and `runtime_discovery`. The 0.11 Engineering drawer consumes those stable commands first.

A staged Rust module, `src-tauri/src/adaptive_runtime.rs`, explores richer native macOS observations such as memory availability, swap and thermal state. It is intentionally not yet connected to the Tauri command handler; it is a backend prototype to validate before becoming part of the production control loop.

## Layer B — State estimator

The planner converts model size and requested context into estimates for resident model memory, KV-cache memory, runtime overhead, macOS reserve and total projected runtime memory.

These are engineering estimates, not guarantees. The UI labels them as estimates and Observatory now exposes measured residency factors and decode variation so the estimator can later be calibrated against real behavior.

## Layer C — Controller / policy

Three policies are exposed:

- **Safe** — larger operating reserve and short keep-alive.
- **Balanced** — default compromise between responsiveness and memory headroom.
- **Maximum** — permits a larger fraction of the available operating envelope.

The controller can recommend a smaller context window when the requested operating point exceeds the estimated budget. It can also recommend unloading other models when headroom is narrow.

The interactive **Operating Envelope** renders this controller as model-footprint × context operating points with safe, constrained and outside states. A **Control Margin** reports remaining estimated budget headroom.

## Layer D — Actuators

Runtime Control now demonstrates the verification rule required for future automatic actuators. A preload or unload request is not considered complete merely because the request returned: OpenPenguin queries `/api/ps` and confirms that the model actually entered or left the resident set.

Future validated actuators can include `num_ctx`, `keep_alive`, unloading inactive models, runtime selection and bounded concurrency. Automatic changes should always be reversible, visible in Task Center and explainable in the Engineering drawer.

## Layer E — Verification

**Penguin Doctor** provides preflight checks for platform, architecture, unified memory, storage and runtime availability.

**Observatory** now adds a runtime health strip with memory-allocation pressure, measured residency factor, recent decode coefficient of variation and telemetry state. These values are intended to become the measured side of Plan-vs-Measured calibration.

**Runtime Repair** now performs post-install `runtime_discovery`; an archive extraction is not reported as success unless OpenPenguin can rediscover the private runtime executable.

## Existing-feature hardening in 0.11

0.11 deliberately strengthens earlier 0.7–0.10 subsystems instead of only layering new UI on top.

### Task Center

- Persists the most recent task history locally.
- Restores interrupted active tasks as `stalled` after a UI restart instead of silently losing them.
- Separates Active and Issues views.
- Surfaces failed/stalled state in the floating indicator.
- Keeps backend cancellation only where a real cancellable operation exists.

### Full Logs

- Adds severity classification and error/warning counts.
- Adds bounded 1–8 MB tail reads.
- Adds keyword + severity filtering, live refresh and optional tail following.
- Protects against overlapping refresh responses.
- Reports clipboard/clear errors rather than silently ignoring them.

### Global Library

- Adds a bounded local result cache for temporary network failures.
- Guards search and variant requests with monotonic request IDs so stale responses cannot overwrite a newer query.
- Preserves the current query when changing source.
- Adds known-license / lower-risk filtering and popularity sorting.
- Adds duplicate-install click suppression while an install command is starting.

### Runtime Control

- Verifies preload/unload state against `/api/ps`.
- Preserves user model selection across polling cycles.
- Pauses background polling while the window is hidden.
- Reports estimated memory headroom alongside context recommendations.

### Advanced Settings

Adds reversible Balanced, Reproducible, Creative and Low-residency presets. Presets only update local inference settings and do not alter macOS or install software.

### Cold / Warm Benchmark

- Verifies that the target model is actually unloaded before measuring a cold start.
- Uses a fixed seed and deterministic short prompt for improved repeatability.
- Pauses memory sampling while hidden.
- Reports latest warm-load savings and decode-speed delta.

## Engineering disciplines represented

### Electrical and Computer Engineering / Control

The runtime is modeled as a constrained dynamic system. Sensors measure state, an estimator converts raw measurements into operating variables, a controller selects policy, actuators change runtime parameters, and Observatory closes the feedback loop.

### Computer Systems

The work includes process lifecycle, local APIs, memory pressure, model residency, KV-cache growth, storage, runtime isolation and Apple Silicon execution paths.

### Industrial and Operations Engineering

Model selection and runtime configuration become resource-allocation problems: maximize useful inference performance while respecting memory, storage, latency and stability constraints.

### Software / Reliability Engineering

Penguin Doctor, runtime repair, deterministic startup, persistent Task Center state, fault reporting, backend command contracts and reproducible builds make reliability a first-class subsystem rather than an error dialog.

### Human–Computer Interaction

Ordinary users should see simple recommendations such as Safe, Balanced, Constrained and clear issue counts. Engineering Mode exposes state estimates and policy explanations without forcing every user to understand KV cache or memory pressure.

## Regression contracts

The desktop path now runs three classes of verification before Tauri launch/build:

1. `verify-engineering011.py` — checks the 0.11 Engineering UI contract.
2. `verify-prepared-backend.py` — checks that prepared Tauri commands are actually registered.
3. `verify-legacy-hardening011.py` — protects Task Center recovery, Full Logs diagnostics, Library request ordering/cache, Observatory health signals, Runtime Repair rediscovery, Runtime Control verification, Advanced Settings presets and cold/warm benchmark methodology.

## Architecture debt discovered during 0.11 kickoff

The current `desktop:prepare` pipeline still uses patch scripts to modify core Rust and React source before a desktop build. That helped evolve 0.7–0.10 quickly, but it means checked-in source is not always identical to compiled source.

0.11 should continue migrating toward a static source-of-truth:

- production modules imported directly in Rust/React,
- build scripts limited to assets or generated data,
- verification scripts read/check source but do not mutate it,
- CI builds from a clean checkout and eventually confirms no tracked source changed during preparation.

## 0.11 acceptance sequence

- [x] Create isolated 0.11 feature branch.
- [x] Add Engineering control drawer.
- [x] Add explainable memory/context planner and Operating Envelope.
- [x] Add advisory Penguin Doctor checks.
- [x] Add staged native adaptive-runtime backend prototype.
- [x] Add prepared-backend command contract.
- [x] Harden major 0.7–0.10 user-facing subsystems and add regression contracts.
- [x] Produce Universal2 app/DMG successfully on an earlier 0.11 PR head.
- [ ] Validate the latest hardened head through Universal2 CI.
- [ ] Interactively validate the hardened controls on a physical Mac.
- [ ] Calibrate planner estimates against Observatory measurements.
- [ ] Move validated native sensors into the production Tauri handler.
- [ ] Connect safe automatic actuators and Task Center events.
- [ ] Remove build-time mutation of core source.
