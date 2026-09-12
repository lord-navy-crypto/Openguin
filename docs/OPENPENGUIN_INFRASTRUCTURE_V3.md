# OpenPenguin Shared AI Infrastructure v3

OpenPenguin v3 extends the shared local AI control plane with privacy-preserving request observability while preserving the v2 contracts and legacy Engineering Lab LabBridge compatibility.

## Stable topology

```text
Product applications
  ├─ Engineering Lab
  ├─ Sentinel
  └─ future local products
        ↓
OpenPenguin application API 127.0.0.1:11436
        ↓
OpenPenguin private Ollama runtime 127.0.0.1:11435
```

Port `11436` is the product-facing control plane. Port `11435` remains an internal Ollama-compatible runtime surface.

## Generic control-plane endpoints

```text
GET  /v1/health
GET  /v1/status
GET  /v1/policies
GET  /v1/requests/recent
GET  /v1/capabilities
POST /v1/advisory
```

Engineering Lab compatibility remains available under `/labbridge/v1/*`.

## Privacy-preserving recent request history

`GET /v1/requests/recent` returns at most the most recent 64 advisory metadata records from memory.

Each record may contain:

```text
request_id
started_at_unix_ms
app_id
context_schema
policy_id
model
model_route
elapsed_ms
success
outcome
```

It deliberately does **not** store or return:

```text
question text
structured context / evidence packet contents
model answer text
prompt messages
```

The endpoint declares these boundaries explicitly:

```json
{
  "retention": "memory-only-last-64",
  "metadata_only": true,
  "stores_question": false,
  "stores_context": false,
  "stores_answer": false
}
```

The ring buffer is process-memory only and is cleared when OpenPenguin restarts. It is intended for local infrastructure diagnostics, not surveillance, analytics, or long-term user-history storage.

## Why this exists

OpenPenguin is shared infrastructure. A user or product developer needs to answer questions such as:

- Is Engineering Lab or Sentinel currently using the runtime?
- Which policy handled the request?
- Which model was routed?
- Was the request successful?
- Was inference slow?
- Are clients repeatedly failing because of capacity or runtime health?

Those questions can be answered without storing the scientific/system evidence itself.

## Authority remains external

Recent-request metadata does not become scientific or system evidence.

```text
Engineering Lab remains scientific authority.
Sentinel remains system-evidence authority.
OpenPenguin remains advisory infrastructure.
```

The infrastructure response contract continues to require:

```text
executed = false
advisory_only = true
mutation_authority = false
```

## Capacity and routing

The v2 controls remain in force:

- maximum two simultaneous advisory requests;
- visible busy rejection counters;
- client identity;
- context-policy registry;
- runtime health;
- request tracing;
- bounded per-request timeout;
- `model: auto` routing preferring already-loaded models before installed models.

## Product synchronization

Engineering Lab should prefer the generic `/v1/*` API, identify itself as `engineering-lab`, and retain `/labbridge/v1/*` plus `11435 /api/chat` as rolling-upgrade fallbacks.

Sentinel should use its authenticated same-origin Go proxy, identify itself as `sentinel-macos`, use `/v1/status` and `/v1/policies` for infrastructure visibility, and retain Sentinel WebLLM as an independent fallback.

Neither product should copy OpenPenguin recent-request metadata into its authoritative evidence store unless a future explicit provenance design calls for that behavior.
