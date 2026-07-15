# AutoValuate Intelligence — API reference

Base URL: `https://autovaluate-api.onrender.com`
Interactive schema: `GET /docs` (Swagger UI) · `GET /openapi.json`

Stable, versioned integration paths live under **`/v1`** (exact aliases of the root
paths — same handlers, same schemas, same limits). Programmatic integrations should use
`/v1/...`; the web app itself uses the root paths.

> Free-tier note: the backend sleeps when idle (Render free). The first request after a
> quiet period can take ~50 s; poll `GET /health` first if latency matters.

## Authentication & limits

| Caller | How | Limit |
|---|---|---|
| Browser / demo | no key | per-IP sliding window (20 req/min default) |
| Programmatic | `Authorization: Bearer av_live_...` | per-key tier quota, metered |

Mint and revoke keys on the **Developers** page of the app. Only `sha256(key)` is ever
stored or transmitted server-side; the plaintext exists once, in your browser, at
creation time. Exceeding a quota returns `429` with a plain-English message.

## Endpoints

### `GET /health`
Liveness (used by keep-alive). → `{"status": "healthy"}`

### `GET /ready`
Readiness: can this instance actually serve?
→ `{"status": "ready" | "degraded", "checks": {"valuation_model": bool, "comparables_index": bool, "llm_provider": bool}}`
`llm_provider: false` is not degraded — reports fall back to the deterministic writer.

### `POST /v1/estimate`
Fast model-only valuation (no comparables/RAG/LLM; powers the what-if sliders).

```json
{ "make": "toyota", "model": "corolla", "year": 2019, "kilometers": 90000 }
```

Optional fields: `bodyType`, `transmissionType`, `fuelType`, `regionalSpecs`,
`noOfCylinders`, `city`, `sellerType`, `client_condition` (on-device damage scan output).

→ `{ "ok": true, "valuation": { "price_low_aed", "price_mid_aed", "price_high_aed",
"interval_coverage", "explanation": { "top_factors": [...] },
"model_meta": { "model_version", "cv_median_ape_pct", ... } } }`

`model_meta.model_version` is a content hash of the exact model artifact that priced the
request — pin it if you need attributable, reproducible valuations.

### `POST /v1/estimate/batch`
Value a fleet (1–100 vehicles) in one request — one rate-limit/metering unit. A bad row
fails alone, never the fleet.

```json
{ "vehicles": [ { "make": "toyota", "model": "corolla", "year": 2019, "kilometers": 90000 },
                { "make": "nissan", "model": "patrol", "year": 2021, "kilometers": 40000 } ] }
```

→ `{ "ok": true, "count": 2, "results": [ { "ok": true, "valuation": {...} },
{ "ok": false, "error": "..." } ] }` (order matches the request)

### `POST /v1/valuate`
The full pipeline: valuation + comparables retrieval + cited, Verifier-checked report.
Same request schema as `/estimate` (plus optional `photos`). Slower; LLM-dependent parts
degrade to deterministic templates rather than failing.

### `POST /v1/valuate/stream`
Same as `/valuate` over Server-Sent Events: one event per reasoning-trace step, then a
final `result` event (or an `error` event — never a raw mid-stream 500).

### `POST /v1/chat`
One grounded question about a finished valuation. Every number in the answer is traced
to the evidence pack by the deterministic Verifier; ungrounded LLM answers are replaced,
never served.

```json
{ "question": "Is AED 120,000 a good deal?", "context": { "valuation": { ... } }, "history": [] }
```

## Errors

`422` invalid request (field-level detail) · `429` rate/quota exceeded · `500`
`{"ok": false, "error": "internal error"}` — details are logged server-side, never leaked.
