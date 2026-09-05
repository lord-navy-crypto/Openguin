# OpenPenguin — Task Center Operations Engineering

## Goal

Task Center should evolve from a progress list into an operations-observability layer before it becomes a scheduler.

The first slice therefore measures task lifecycle evidence and classifies work, but deliberately does **not** reorder, throttle or prioritize tasks automatically.

## Why measurement comes before scheduling

Queueing and scheduling decisions require evidence about arrivals, waits, service times, resource contention and task classes. The existing Task Center historically knew only broad state/progress/cancellation. Treating every running timestamp as a queue observation, or treating direct-start tasks as zero-wait jobs, would produce misleading operations metrics.

The first operations slice adds explicit metadata and preserves missing evidence as missing.

## Task metadata

`TaskUpdate` can now carry:

- priority: `low | normal | high`,
- resource class: `network | storage | runtime | compute | control | mixed | unclassified`,
- explicit `queued` state through `queueTask(...)`.

Metadata remains advisory/observational. A `high` priority label does not currently move a task ahead of another task.

Known native model pull/import progress is classified as `mixed` because these workflows combine network transfer and storage work. Other call sites remain `unclassified` until they supply defensible metadata.

## Lifecycle timestamps

Task Center records lifecycle evidence only when the transition is actually observed:

- `queuedAt` — first observed queued state,
- `startedAt` — first observed running state,
- `finishedAt` — first observed done / failed / cancelled state.

### Queue wait

Queue wait is available only when both `queuedAt` and `startedAt` exist:

`queue wait = startedAt - queuedAt`

A task whose first observed state is `running` has **unknown queue wait**, not zero queue wait.

### Service time

Service time is available only when `startedAt` and a terminal `finishedAt` exist:

`service time = finishedAt - startedAt`

Interrupted/restored tasks are marked stalled as before; the first operations slice does not fabricate missing lifecycle transitions during restart recovery.

## Operations Observatory

The Task Center panel now exposes:

- queued tasks now,
- running tasks now,
- stalled tasks,
- median measured queue wait + sample count,
- median measured service time + sample count,
- classified active tasks and active resource-class counts.

Medians are computed only from rows with valid measured transitions.

The UI explicitly labels the panel **observational only · no automatic scheduler**.

## IOE / broader Engineering mapping

This first slice connects Task Center to operations engineering without overstating what the data supports:

- **IOE / queueing:** observe queue arrival/start evidence before fitting queue models.
- **Scheduling:** introduce priority/resource metadata before any dispatch policy exists.
- **Performance measurement:** retain queue wait and service-time sample counts alongside medians.
- **Capacity analysis:** count active work by resource class without calling it utilization, because no resource-capacity denominator is measured yet.
- **Reliability engineering:** retain stalled/interrupted/cancelled/failed states and cancellation ownership.
- **Systems engineering:** classify which subsystem a task consumes rather than treating all work as interchangeable.
- **Human factors:** distinguish measured values from unavailable values and prevent a priority label from implying hidden automatic behavior.

## What this slice intentionally does not claim

It does not yet compute:

- arrival rate,
- throughput rate over a statistically defined window,
- server utilization,
- Little's Law quantities,
- queue discipline performance,
- optimal dispatch priority,
- predicted completion time,
- automatic concurrency limits.

Those require more complete and trustworthy task lifecycle/resource evidence.

## Next evidence steps before scheduling

1. Migrate long-running task producers to emit explicit `queued` state when a real wait exists.
2. Classify more task producers by resource class.
3. Record bounded completed-task lifecycle samples across sessions.
4. Determine which operations actually contend for the same scarce resource.
5. Only then evaluate queue disciplines/concurrency policies using measured workload evidence.

The goal is not to make the UI look like an operations dashboard. The goal is to build an auditable data foundation from which later scheduling decisions can be justified.
