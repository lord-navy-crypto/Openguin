# OpenPenguin LabBridge v1

OpenPenguin exposes a thin, local-only scientific advisory API for Engineering Lab while keeping its existing private Ollama runtime unchanged.

## Port ownership

```text
127.0.0.1:11435  OpenPenguin private Ollama runtime (existing compatibility surface)
127.0.0.1:11436  OpenPenguin native LabBridge API
```

The ports are intentionally separate. OpenPenguin does not replace or proxy Ollama's `/api/*` surface.

## System roles

- **BetterBoard** — real-world ingress and measurement producer.
- **Engineering Lab** — scientific computation and evidence core.
- **OpenPenguin** — local AI advisory layer.

OpenPenguin may explain evidence and suggest falsifiable next experiments. It does not become an authoritative measurement source, solver, validation system, or automatic actuator.

## Endpoints

### `GET /labbridge/v1/health`

Returns the local LabBridge service state.

### `GET /labbridge/v1/capabilities`

Returns:

```json
{
  "api_version": "labbridge-openguin-api/v1",
  "service": "OpenPenguin LabBridge",
  "service_version": "0.10.1",
  "runtime_base": "http://127.0.0.1:11435",
  "models": ["installed-model"],
  "capabilities": [
    "text-advisory",
    "labbridge.ai-context/v1",
    "labbridge.ai-suggestion/v1",
    "read-only-scientific-advisory"
  ],
  "advisory_only": true
}
```

The model list is read from the existing private Ollama runtime.

### `POST /labbridge/v1/advisory`

Request:

```json
{
  "api_version": "labbridge-openguin-api/v1",
  "context": {
    "schema": "labbridge.ai-context/v1",
    "packet_id": "ai-context-..."
  },
  "question": "What is the strongest unresolved uncertainty?",
  "model": "installed-model",
  "temperature": 0.2,
  "requested_response_schema": "labbridge.ai-suggestion/v1"
}
```

OpenPenguin validates the API version, context schema, size limits, model name, question size, temperature and requested response schema before forwarding a bounded advisory prompt to its private Ollama runtime.

Initial native response:

```json
{
  "api_version": "labbridge-openguin-api/v1",
  "schema": "openguin.labbridge-advisory-response/v1",
  "answer": "...",
  "model": "installed-model",
  "runtime": "private-ollama-11435",
  "context_packet_id": "ai-context-...",
  "executed": false,
  "boundary": "Advisory only..."
}
```

Engineering Lab remains responsible for wrapping advisory text into the canonical content-addressed `labbridge.ai-suggestion/v1` packet. This deliberately avoids duplicate canonical-JSON/SHA implementations across Rust and Python.

## Compatibility policy

Engineering Lab should:

1. Probe native LabBridge at `127.0.0.1:11436`.
2. Prefer native advisory when the API version and required capabilities match.
3. If native LabBridge is absent or temporarily fails, fall back locally to the existing OpenPenguin private Ollama `/api/chat` at `127.0.0.1:11435`.
4. Preserve the native failure reason in advisory provenance when fallback occurs.
5. Never send Engineering Lab scientific context to a cloud fallback automatically.

This allows rolling upgrades where OpenPenguin and Engineering Lab may temporarily run different versions without breaking local AI support.

## Safety / authority boundary

The native bridge is loopback-only and bounded. It must not:

- execute an Engineering Lab ActionProposal;
- mutate BetterBoard measurements;
- mutate Engineering Lab datasets, solver results, uncertainty, validation or provenance;
- execute code embedded in AI context;
- relabel simulation as measurement;
- invent missing units or calibration/validation status.

The intended closed loop is:

```text
BetterBoard measurement
      ↓
Engineering Lab evidence
      ↓
OpenPenguin advisory
      ↓
human approval
      ↓
new Engineering Lab experiment
```

Human approval remains a separate, explicit provenance step.
