# OpenPenguin Local AI Infrastructure v1

> **Current shared-infrastructure contract:** see `docs/OPENPENGUIN_INFRASTRUCTURE_V2.md` for client identity, policy registry, runtime status, bounded concurrency, model routing, request tracing, and timeout governance. This v1 document remains the compatibility reference for existing LabBridge consumers.

OpenPenguin now exposes a thin, loopback-only advisory service for multiple products while keeping its private Ollama runtime unchanged.

The first supported consumers are **Engineering Lab** and **Sentinel**. The old LabBridge endpoints remain as a compatibility surface for Engineering Lab.

## Port ownership

```text
127.0.0.1:11435  OpenPenguin private Ollama runtime
127.0.0.1:11436  OpenPenguin application-level local AI infrastructure API
```

These ports are intentionally separate. `11435` remains an Ollama-compatible runtime. Product integrations should prefer `11436` so OpenPenguin can enforce product-specific evidence and authority policies.

## Product roles

- **BetterBoard** — real-world ingress and measurement producer.
- **Engineering Lab** — scientific computation and evidence core.
- **Sentinel** — macOS system-evidence authority.
- **OpenPenguin** — shared local model/runtime and advisory infrastructure.

OpenPenguin reasons over bounded context. It does not become the authoritative source of measurements, scientific results, system observations, validation state, or executed actions.

## Generic infrastructure API

### `GET /v1/health`

Returns local service state and confirms loopback/advisory-only operation.

### `GET /v1/capabilities`

Returns installed models, limits, capabilities and accepted context schemas.

Current accepted schemas:

```text
labbridge.ai-context/v1
sentinel.system-evidence-context/v1
```

Representative response:

```json
{
  "api_version": "openguin-local-api/v1",
  "service": "OpenPenguin Local AI Infrastructure",
  "runtime_base": "http://127.0.0.1:11435",
  "models": ["installed-model"],
  "capabilities": [
    "text-advisory",
    "bounded-structured-context",
    "read-only-advisory",
    "labbridge.ai-context/v1",
    "sentinel.system-evidence-context/v1"
  ],
  "accepted_context_schemas": [
    "labbridge.ai-context/v1",
    "sentinel.system-evidence-context/v1"
  ],
  "advisory_only": true,
  "limits": {
    "max_context_bytes": 1048576,
    "max_question_chars": 20000,
    "max_answer_chars": 200000,
    "loopback_only": true
  }
}
```

### `POST /v1/advisory`

Generic request:

```json
{
  "api_version": "openguin-local-api/v1",
  "context": {
    "schema": "sentinel.system-evidence-context/v1"
  },
  "question": "What changed and what should I inspect next?",
  "model": "installed-model",
  "temperature": 0.18
}
```

OpenPenguin validates API version, context schema, request bounds, model name, question size and temperature. It then applies the policy associated with the context schema before forwarding inference to the private local runtime.

Response:

```json
{
  "api_version": "openguin-local-api/v1",
  "schema": "openguin.local-advisory-response/v1",
  "request_id": "opg-...",
  "answer": "...",
  "model": "installed-model",
  "runtime": "private-ollama-11435",
  "source_context_schema": "sentinel.system-evidence-context/v1",
  "context_packet_id": null,
  "elapsed_ms": 1234,
  "executed": false,
  "advisory_only": true,
  "boundary": "Advisory only..."
}
```

OpenPenguin does not generate the authoritative scientific/evidence packet identity for consuming products. The source product owns its evidence/provenance model.

## Context-specific policy

### Engineering Lab

For `labbridge.ai-context/v1`, OpenPenguin must not:

- invent measurements, units, uncertainty or solver results;
- claim scientific validation that is absent from the context;
- relabel simulated data as measured data;
- execute ActionProposal objects;
- mutate Engineering Lab evidence.

Engineering Lab remains responsible for canonical `labbridge.ai-suggestion/v1` packet identity and provenance.

### Sentinel

For `sentinel.system-evidence-context/v1`, OpenPenguin must preserve Sentinel's core rule:

> Evidence is not a verdict.

The advisory policy requires separation of:

```text
OBSERVED
INTERPRETATION
UNKNOWN
NEXT STEP
```

OpenPenguin must not convert Attention, Risk, Confidence, Drift, novelty, startup presence, public network access, or missing visibility into malware probability. It must not invent paths, PIDs, hashes, signatures, endpoints, timestamps, causes, intent or commands that were run. It has no shell or Sentinel Safe Change execution authority.

## Sentinel transport architecture

Sentinel's browser/WebView does **not** connect directly to port 11436.

```text
Sentinel UI
   ↓ same-origin + X-Sentinel-Token
Sentinel Go engine
   ↓ fixed loopback proxy
OpenPenguin 127.0.0.1:11436
   ↓
private Ollama 127.0.0.1:11435
```

This preserves Sentinel's existing session-token, Host, Origin, Fetch-Metadata and CSP boundaries. It also avoids adding arbitrary OpenPenguin URLs to the browser-facing attack surface.

Sentinel's vendored WebLLM path remains an independent local fallback. OpenPenguin is optional shared infrastructure, not a mandatory dependency for Sentinel evidence collection.

## Engineering Lab compatibility API

The existing endpoints remain available:

```text
GET  /labbridge/v1/health
GET  /labbridge/v1/capabilities
POST /labbridge/v1/advisory
```

They continue to advertise `labbridge-openguin-api/v1` and accept only `labbridge.ai-context/v1`. This preserves compatibility with existing Engineering Lab adapters while the generic `/v1/*` API becomes the preferred infrastructure surface for new consumers.

Engineering Lab may still fall back locally to `127.0.0.1:11435/api/chat` during rolling upgrades and records that downgrade in provenance. No cloud fallback is automatic.

## Security / authority boundary

The OpenPenguin infrastructure service is deliberately narrow:

1. Bind to `127.0.0.1` only.
2. Keep request/response sizes bounded.
3. Accept only allow-listed structured context schemas.
4. Do not expose arbitrary proxy destinations.
5. Do not execute code, shell commands, Safe Change actions or scientific ActionProposals.
6. Always return `executed: false` and `advisory_only: true`.
7. Keep private Ollama on 11435 isolated from app-level product contracts.
8. Let each source product remain authoritative over its own evidence and provenance.

## Architecture direction

OpenPenguin should evolve as reusable local AI infrastructure rather than accumulating product-specific business logic:

```text
BetterBoard / Engineering Lab / Sentinel / future product
                     ↓
            bounded product context
                     ↓
         OpenPenguin Local AI API :11436
                     ↓
       model/runtime management and inference
                     ↓
          private Ollama runtime :11435
```

Product-specific evidence collection, decisions, actions and provenance remain outside OpenPenguin.
