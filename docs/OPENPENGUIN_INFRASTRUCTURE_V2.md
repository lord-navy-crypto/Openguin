# OpenPenguin Shared AI Infrastructure v2

OpenPenguin is the shared local-AI substrate for the product family. Product applications remain the authorities for their own evidence and actions; OpenPenguin supplies local model runtime, bounded advisory inference, routing, governance, and operational observability.

## Architecture

```text
BetterBoard ───────┐
                   │
Engineering Lab ───┼──> OpenPenguin 127.0.0.1:11436
                   │          │
Sentinel ──────────┘          ▼
                    private runtime 127.0.0.1:11435
```

`11435` is the private Ollama-compatible runtime. `11436` is the OpenPenguin product infrastructure API. Product clients should integrate through `11436` rather than treating the private runtime as the long-term application contract.

## Authority rule

OpenPenguin never becomes the source of truth for a caller's domain.

- BetterBoard owns acquired physical measurements and hardware facts.
- Engineering Lab owns scientific evidence, models, results, V&V/UQ, provenance, experiments, and approved actions.
- Sentinel owns observed system evidence and Safe Change decisions.
- OpenPenguin owns local-AI runtime state, routing, request governance, and advisory output only.

Every advisory response therefore carries:

```json
{
  "executed": false,
  "advisory_only": true,
  "mutation_authority": false
}
```

These fields are protocol guarantees, not model-generated claims.

## Generic API

### `GET /v1/health`

Fast service/runtime health. The service may be available while the private runtime is degraded.

### `GET /v1/status`

Operational snapshot containing:

- infrastructure uptime;
- maximum and available advisory slots;
- total, active, succeeded, failed, and busy-rejected request counts;
- private runtime reachability/version;
- installed and currently loaded models;
- registered context policies.

This endpoint is intended for product diagnostics and local observability. It is not a telemetry upload surface.

### `GET /v1/policies`

Returns the registered structured-context policies. Policies define interpretation boundaries and the source product that retains authority.

Current policies:

- `engineering-lab-evidence/v1` for `labbridge.ai-context/v1`;
- `sentinel-system-evidence/v1` for `sentinel.system-evidence-context/v1`.

Adding a future product requires an explicit policy entry. Unknown context schemas are rejected instead of being forwarded as arbitrary prompts.

### `GET /v1/capabilities`

Returns installed/loaded models, accepted context schemas, infrastructure capabilities, and hard request limits.

### `POST /v1/advisory`

Example request:

```json
{
  "api_version": "openguin-local-api/v1",
  "client": {
    "app_id": "sentinel-macos",
    "app_version": "2.8.0",
    "instance_id": "optional-local-instance-id"
  },
  "context": {
    "schema": "sentinel.system-evidence-context/v1",
    "packet_id": "sentinel-context-..."
  },
  "question": "Separate observed facts from interpretation and suggest the next read-only check.",
  "model": "auto",
  "temperature": 0.2,
  "timeout_ms": 120000
}
```

`client` is caller-supplied local metadata for tracing and diagnostics. It is **not authentication** and must never be treated as proof of caller identity. If `app_id` is omitted, OpenPenguin infers a descriptive app id from the accepted context schema for backward compatibility.

## Model routing

A caller may provide an explicit local model name or use:

```json
{"model":"auto"}
```

Automatic routing is intentionally conservative:

1. prefer a model already loaded by the private runtime;
2. otherwise select an installed model;
3. fail clearly if no model is available.

The response records `model` and `model_route` (`explicit`, `loaded-first`, or `installed-first`) so routing is observable rather than hidden.

OpenPenguin v2 does not silently download models during an advisory request.

## Capacity governance

Local LLM inference can saturate CPU/GPU/memory. OpenPenguin therefore owns a bounded advisory gate rather than allowing every product to submit unlimited concurrent work.

Current contract:

```text
MAX_INFLIGHT_ADVISORIES = 2
```

When capacity is full, another request receives a clear service-unavailable response and the busy rejection is recorded in `/v1/status`. Source products may then keep their UI responsive, retry later, or use a local product-specific fallback such as Sentinel WebLLM.

The concurrency limit is an infrastructure safety limit, not a product priority score.

## Time budgets

Requests may supply `timeout_ms`.

OpenPenguin clamps it to the bounded infrastructure range:

```text
minimum  5,000 ms
maximum 600,000 ms
default 600,000 ms
```

The effective value is returned as `effective_timeout_ms`.

## Request tracing

Each successful advisory returns a locally generated `request_id`, caller metadata, selected policy, context schema, selected model/route, runtime identity, and elapsed time.

Example response shape:

```json
{
  "api_version": "openguin-local-api/v1",
  "schema": "openguin.local-advisory-response/v1",
  "request_id": "opg-...",
  "client": {
    "app_id": "sentinel-macos",
    "app_version": "2.8.0",
    "instance_id": "...",
    "inferred": false
  },
  "policy_id": "sentinel-system-evidence/v1",
  "authority": "Sentinel remains authoritative ...",
  "answer": "...",
  "model": "...",
  "model_route": "loaded-first",
  "runtime": "private-ollama-11435",
  "source_context_schema": "sentinel.system-evidence-context/v1",
  "context_packet_id": "sentinel-context-...",
  "elapsed_ms": 1234,
  "effective_timeout_ms": 120000,
  "executed": false,
  "advisory_only": true,
  "mutation_authority": false
}
```

## Compatibility

Engineering Lab's existing endpoints remain available:

```text
GET  /labbridge/v1/health
GET  /labbridge/v1/capabilities
POST /labbridge/v1/advisory
```

They continue to use `labbridge-openguin-api/v1` and accept only `labbridge.ai-context/v1`.

The generic API is additive. Product migrations can therefore be gradual.

## Failure and fallback semantics

OpenPenguin failure must not corrupt the source product's evidence state.

- No advisory request mutates source evidence.
- No failed model request becomes a domain event automatically.
- No cloud fallback is selected automatically by this infrastructure layer.
- A busy, unavailable, or timed-out OpenPenguin request returns an explicit failure.
- Product-specific fallbacks remain a product decision.

For Sentinel, WebLLM can remain an independent local fallback. For Engineering Lab, the scientific record stays valid whether or not OpenPenguin is available.

## Future extension rule

A new product should not receive a generic unrestricted prompt tunnel. Integration should add a named structured context schema and an explicit policy describing:

1. source-of-truth authority;
2. facts OpenPenguin may interpret;
3. facts it must not invent;
4. actions it cannot execute;
5. any required response structure.

This keeps OpenPenguin reusable without turning the shared infrastructure into an unbounded local agent with accidental cross-product authority.
