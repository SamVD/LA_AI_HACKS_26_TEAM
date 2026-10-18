# src/ai/predictor (T-201)

`PredictorService` for Steps 2-3. It implements `docs/PREDICTOR_PROMPT.md` prompt version 2:
- Section 4: input trimming
- Section 6: client validation
- Section 7: bank-only fallback
- Section 10: free-tier throttle and HTTP 429 cooldown

It calls T-203's `api/predict` and **never rejects**.

```ts
import { createPredictor, createThrottledPredictor } from './ai/predictor'
const predictor = createPredictor({
  endpoint: `${import.meta.env.VITE_API_BASE}/api/predict`, // omitted → fallback only
  log: ctx.log,                // fallback reasons for the T-206 debug panel
  dropSamples: false,          // Section 4 says true in production; ORCH decides for demo builds
})
// Create once per mode entry. All final segments and help taps use this wrapper.
const throttle = createThrottledPredictor(predictor, { now: ctx.now })
throttle.onFinal(request)                   // coalesced speculative refresh
const suggestions = await throttle.onHelp(request) // cache, live, stale, fallback
// On mode exit:
throttle.stop()
```

| Outcome | Result | Log event |
|---|---|---|
| 2xx, valid JSON | model suggestions (Section 6) | `predictor.model` `{ms, dropped, words}` |
| > `timeoutMs` (1200) | fallback | `predictor.fallback` `{reason:'timeout'}` |
| fetch throws | fallback | `reason:'network'` |
| HTTP 429 or active server cooldown | fallback, no retry | `reason:'rate-limited', blockedUntil` |
| other non-2xx | fallback | `reason:'http', status` |
| invalid output / nothing survives | fallback | `reason:'invalid', why` |
| no `endpoint` | fallback | `reason:'unconfigured'` |
| caller's `signal` aborts | `[]` | none |

Asset keys come only from `resolveAssets` (src/content), never from the model. Words not in the bank resolve through an ad-hoc entry, so they still get a mouth shape.

## Fallback v2

Tag overlap ignores `sample` and `personal` metadata. Names already mentioned get
a small boost; other just-said words get a penalty instead of a boost. The last
eight non-filler words supply category cues and partial prefixes (`lisi` →
`lisinopril`). Recently suggested words get a boost only when not just said.
No positive scores means `[]`; modes show "No suggestion yet". Matching remains
literal and bank-only, so it cannot recover an out-of-bank word on its own.

## Limiter lifecycle and cache

The wrapper defaults to a sliding 60-second window of 15 calls. Prefetch uses at
most 12 slots, with at least five seconds between calls; three slots remain for
help. New finals replace queued requests. Help never waits for a quota slot:
it returns a matching cache, shares a matching in-flight call, makes one live
call if allowed, or returns stale cache then bank fallback. A live call still
uses the service's 1.2-second budget. Same-request simultaneous taps share one
call; different requests reserve quota synchronously.

Cache identity includes transcript, stall suffix, bank, place and `n`; requests
are snapshotted and results copied. Empty results are cached too, preventing
automatic re-requests for an idle transcript. Exact cache hits expire after
60 seconds (`cacheMaxAgeMs`); stale cache may still serve quota-blocked taps.
Late older completions cannot overwrite newer cache entries. Create a wrapper
on mode enter and call `stop()` on exit: it cancels pending prefetch, aborts live
calls, clears conversation cache/history, and discards late results. A stopped
instance stays stopped.

The service reads `Retry-After` (seconds or HTTP date) and JSON `retryDelay`
duration strings, taking the longest valid hint and defaulting to 20 seconds
when neither is usable. Cooldown metadata is shared privately with the wrapper
through a WeakMap; the frozen `PredictorService` contract is unchanged. All
wrappers using one service see its cooldown; create one active wrapper per
conversation to share the local quota. Other clients in the same Gemini
project also consume its quota, so an external 429 can still occur. Fetch and
body reading are bounded even if a transport ignores abort.

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
npx vite-node scripts/eval-predictor.ts                      # offline fallback v2: top-1 0.56, top-3 0.68
npx vite-node scripts/eval-predictor.ts --endpoint <url>      # live through the proxy, with p50/p95
```

On the current 25 cases, v2 improves the v1 result (top-1 0.32 / top-3 0.64)
to top-1 0.56 / top-3 0.68. Eval-04 also accepts "Sunrise Clinic" — for this
user their own clinic is a sensible answer to the wards-and-nurses cue.
No live-model or
G2 result is claimed here.

Vitest ports the S-2 fixture, busy-talk, worst-case and shared-project-quota
scenarios, asserting no self-caused 429, no more than 15 calls per sliding
minute, 12 prefetch calls per minute, and help latency within one model call.
Additional cases cover empty caches, coalescing, concurrent taps, stale
completions, stop/abort cleanup, server cooldown formats, and hung transports.
