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

The planner converts model size and requested context into estimates for:

- resident model memory,
- KV-cache memory,
- runtime overhead,
- macOS reserve,
- total projected runtime memory.

These are engineering estimates, not guarantees. The UI labels them as estimates and the later calibration stage will compare them against Observatory measurements.

### Operating Envelope

0.11 now renders a two-dimensional operating-envelope map over **estimated model footprint × context window**. Each operating point is classified as:

- **Safe** — projected load stays within the controller's preferred margin.
- **Constrained** — projected load remains inside the selected policy budget but with reduced headroom.
- **Outside** — projected load exceeds the recommended runtime budget.

Envelope cells are interactive: selecting one feeds the operating point back into the runtime planner. This makes the map part of the controller workflow rather than a decorative chart.

The planner also exposes **control margin**, the estimated percentage of runtime budget remaining after the selected operating point is applied.

## Layer C — Controller / policy

Three policies are exposed:

- **Safe** — larger operating reserve and short keep-alive.
- **Balanced** — default compromise between responsiveness and memory headroom.
- **Maximum** — permits a larger fraction of the available operating envelope.

The controller can recommend a smaller context window when the requested operating point exceeds the estimated budget. It can also recommend unloading other models when headroom is narrow.

## Layer D — Actuators

0.11 initially keeps the planner advisory. The future actuator layer can safely apply validated controls such as:

- `num_ctx`,
- `keep_alive`,
- unloading inactive models,
- runtime selection,
- bounded concurrency.

Automatic changes should always be reversible, visible in Task Center, and explainable in the Engineering drawer.

## Layer E — Verification

**Penguin Doctor** provides preflight checks for platform, architecture, unified memory, storage and runtime availability. Observatory should later provide post-actuation feedback so planned versus measured memory and performance can be compared.

This creates a closed loop rather than a one-shot recommendation system.

### Backend command contract

0.11 adds a prepared-backend contract test after the legacy preparation layer runs. It verifies that the final Tauri handler actually registers the production commands required by:

- core runtime and model management,
- Global Library,
- runtime repair,
- persistent diagnostics / Full Logs.

This test was added after 0.11 found a real patch-order defect: `apply-full-logs.py` imported diagnostic commands but its old exact-string handler replacement no longer matched after v0.10 commands had been appended. The patcher now registers commands by inspecting the handler body and fails loudly if the handler cannot be found.

## Engineering disciplines represented

### Electrical and Computer Engineering / Control

The runtime is modeled as a constrained dynamic system. Sensors measure state, an estimator converts raw measurements into operating variables, a controller selects policy, actuators change runtime parameters, and Observatory closes the feedback loop.

### Computer Systems

The work includes process lifecycle, local APIs, memory pressure, model residency, KV-cache growth, storage, runtime isolation and Apple Silicon execution paths.

### Industrial and Operations Engineering

Model selection and runtime configuration become resource-allocation problems: maximize useful inference performance while respecting memory, storage, latency and stability constraints.

### Software Engineering / Reliability Engineering

Penguin Doctor, runtime repair, deterministic startup, Task Center state, fault reporting, command-contract verification and reproducible builds make reliability a first-class subsystem rather than an error dialog.

### Human–Computer Interaction

Ordinary users should see simple recommendations such as **Safe**, **Balanced**, or **Constrained**. Engineering Mode exposes the state estimate and policy explanation without forcing every user to understand KV cache or memory pressure.

## Special OpenPenguin features to build from this foundation

1. **Operating Envelope** — implemented in 0.11; next step is measured calibration.
2. **Plan vs. Measured** — compare predicted memory and speed with Observatory telemetry after every benchmark.
3. **Adaptive Context** — automatically lower context only when necessary and explain the change.
4. **Memory Guard** — unload idle models before macOS reaches severe pressure.
5. **Penguin Doctor fault tree** — identify whether a failure originates in runtime, API, storage, memory or model metadata.
6. **Per-Mac hardware profile** — learn benchmark baselines for the user's exact Apple Silicon configuration.
7. **Engineering export** — save benchmark inputs, environment, policy, measurements and results as a reproducible report.

## Architecture debt discovered during 0.11 kickoff

The current `desktop:prepare` pipeline uses patch scripts to modify core Rust and React source before a desktop build. That helped evolve 0.7–0.10 quickly, but it means the checked-in source is not always identical to the source that is compiled.

0.11 should migrate toward a static source-of-truth:

- production modules imported directly in Rust/React,
- build scripts limited to assets or generated data,
- verification scripts read/check source but do not mutate it,
- CI builds from a clean checkout and confirms no tracked source changed during preparation.

CI now includes an explicit **build-time source mutation audit**. It is informational while issue #2 is open, so the existing build remains usable while the mutation layer is removed incrementally.

## 0.11 acceptance sequence

- [x] Create isolated 0.11 feature branch.
- [x] Add Engineering control drawer.
- [x] Add explainable memory/context planner.
- [x] Add Operating Envelope and control-margin visualization.
- [x] Add advisory Penguin Doctor checks.
- [x] Add staged native adaptive-runtime backend prototype.
- [x] Build a macOS Universal2 `.app` and `.dmg` in CI.
- [x] Add prepared-backend command-contract verification.
- [x] Add build-time source-mutation audit to CI.
- [ ] Launch and interactively test the 0.11 drawer on a physical Mac.
- [ ] Validate planner estimates against Observatory measurements.
- [ ] Move validated native sensors into the production Tauri handler.
- [ ] Connect safe actuators and Task Center events.
- [ ] Remove build-time mutation of core source.
- [ ] Enforce clean-checkout / no-source-mutation CI after the migration.
