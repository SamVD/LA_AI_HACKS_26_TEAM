# src/ai/predictor (T-201)

`PredictorService` for Steps 2-3. It implements `docs/PREDICTOR_PROMPT.md` prompt version 1:
- Section 4: input trimming
- Section 6: client validation
- Section 7: bank-only fallback

It calls T-203's `api/predict` and **never rejects**.

```ts
import { createPredictor } from './ai/predictor'
const predictor = createPredictor({
  endpoint: `${import.meta.env.VITE_API_BASE}/api/predict`, // omitted → fallback only
  log: ctx.log,                // fallback reasons for the T-206 debug panel
  dropSamples: false,          // Section 4 says true in production; ORCH decides for demo builds
})
```

| Outcome | Result | Log event |
|---|---|---|
| 2xx, valid JSON | model suggestions (Section 6) | `predictor.model` `{ms, dropped, words}` |
| > `timeoutMs` (1200) | fallback | `predictor.fallback` `{reason:'timeout'}` |
| fetch throws | fallback | `reason:'network'` |
| non-2xx (429 too: **never retried**, per S-2 R5) | fallback | `reason:'http', status` |
| invalid output / nothing survives | fallback | `reason:'invalid', why` |
| no `endpoint` | fallback | `reason:'unconfigured'` |
| caller's `signal` aborts | `[]` | none |

Asset keys come only from `resolveAssets` (src/content), never from the model. Words not in the bank resolve through an ad-hoc entry, so they still get a mouth shape.

## Wire contract with api/predict (for T-203)

**Request:** `POST`, `content-type: application/json`, body `PredictWireRequest` (`input.ts`):

```json
{ "transcriptTail": "…last ≤40 words / 300 chars, no [STALL]…", "stalledAfter": "pass me the",
  "bank": [{ "word": "Maya", "category": "person", "tags": ["family"] }],
  "place": { "label": "Home kitchen" }, "n": 3 }
```

- The bank is already ordered personal-first and capped at 150, with no frames or ids. The fixture bank is about 3 KB (3,127 bytes measured), under the 16 KB limit.
- `place` carries the label only. Raw lat/lon never leave the phone.
- The proxy turns this into the model turn with `buildModelInput()`: it appends ` [STALL]` and moves `place` to a string. T-203 can copy that function or mirror it.

**Response:** the model's JSON text as-is (an array of `{word, confidence}`), status 200. Anything else is treated as a failure, and the client falls back.

## Eval

```
npx vite-node scripts/eval-predictor.ts                      # offline fallback: top-1 0.32, top-3 0.64
npx vite-node scripts/eval-predictor.ts --endpoint <url>      # live through the proxy, with p50/p95
```

The offline result matches S-2's fallback exactly, word for word and confidence for confidence, on S-2's fixture version. The 0.28 → 0.32 top-1 change comes from T-007 rewording eval-05.

## Open for ORCH

- Section 7 is implemented as written. S-2's proposed fixes (R0 inverted recency, R1 prefix rule, R2 filler-tolerant cues, R3 `[]` when nothing scores) are not applied. Each rule is one line in `fallback.ts`.
- `sample` tags are ignored for tag overlap (S-2 R4).
- "Most recently used personal entries" means the most recently *suggested* ones, then bank order.
