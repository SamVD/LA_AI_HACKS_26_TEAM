# S-2 Findings: Gemini predictor against fixtures

_Status: DONE, Sat Oct 17 2026, AI lane. Prompt v1, 25 cases × 2 reps per model config, `gemini-3.5-flash-lite`. Raw data: `results/2026-10-18T02-42-51-724Z-gemini-3.5-flash-lite.{json,md}` (every call's raw output, latency and validation result) and `results/*-offline.*` (fallback)._

## TL;DR for ORCH

- **Model: `gemini-3.5-flash-lite`** with `thinkingConfig: { thinkingLevel: 'minimal' }`. The API accepts it and uses 0 thinking tokens. The Section 2 request shape (`responseMimeType` + `responseSchema`) works as written.
- **Accuracy:** top-3 is **0.94 zero-shot** and **0.98 few-shot**, against 0.60 for the bank-only fallback. JSON was valid on 100% of calls.
- **Latency:** p50 ~650 ms and p95 ~840-890 ms, measured client-to-Gemini **without** the proxy hop. 1 of 100 calls went over 1.2 s (1350 ms). **1.2 s is realistic** if the proxy adds about 150 ms or less.
- **Ship the few-shot examples.** Few-shot is +0.04 top-3 for about +20 ms p50, and it fixes the one systematic zero-shot failure: forcing a bank word that doesn't fit.
- **Rate limit:** the free tier is **15 requests/minute per project per model** (measured from the 429). Unthrottled, Step 2 prefetch would hit it within a minute and silently fall back to 0.60 accuracy. **Decision: stay free and throttle.** `throttle.mjs` holds the reference policy, which T-201 ports. It is checked in simulation and live. See R5.
- **The fallback has real bugs in the Section 7 spec** (R0-R3). It matters more than it looks, because of the rate limit.

## How to run

```sh
# key in your shell or in .env.local at the repo root (gitignored by `.env.*`); never commit it
node spikes/predictor/eval.mjs                                    # gemini-3.5-flash-lite, zero-shot + few-shot + fallback, 2 reps
node spikes/predictor/eval.mjs --models gemini-3.5-flash-lite,gemini-3.6-flash --rpm 14
node spikes/predictor/eval.mjs --offline                          # fallback + validator self-check, no key
```

- Calls are paced (`--rpm`, default 14) and retried on 429 using the server's `retryDelay`. Only the final attempt is timed. The measured run needed **0 retries**.
- The key goes in a header (`x-goog-api-key`), never in a URL, and is scrubbed from saved error text.
- The harness parses the Section 3 system prompt, the Section 5 schema and Examples 1-7 **out of `docs/PREDICTOR_PROMPT.md` at run time**, so it tests the doc as written.
- It implements Section 4 input building on the whole `words.json` bank (38 entries, `sample` kept per the S-2 brief), Section 6 validation and Section 7 fallback.
- The validator self-checks before each run. All 7 doc example outputs must pass, and an adversarial list must reduce correctly.
- Calls run one at a time and are not aborted at 1.2 s, so the real tail is visible. **"top-3 with 1.2 s budget"** is what a user would actually get: the model's answer if valid and in time, otherwise the fallback's.

## Model and API (confirmed from docs and the live API, Oct 17 2026)

- The [models page](https://ai.google.dev/gemini-api/docs/models) lists `gemini-3.5-flash-lite` (stable) as "Our fastest, most cost-effective 3.5 model". `gemini-2.0-flash*` and `gemini-3.1-flash-lite-preview` are shut down.
- **Thinking:** per the [thinking guide](https://ai.google.dev/gemini-api/docs/thinking), `thinkingLevel` is the control. Live probe results:

| Model | `thinkingLevel: minimal` | Fallback that worked | Probe latency |
|---|---|---|---|
| `gemini-3.5-flash-lite` | **200, 0 thought tokens** | (not needed) | 669-1095 ms |
| `gemini-3.1-flash-lite` | hung >10 s, then `thinkingBudget: 0` → 503 "high demand" | `low` → 200, 102 thought tokens | 2710 ms |
| `gemini-flash-latest` | 400 "MINIMAL is not supported" | `thinkingBudget: 0` → 200 | 4682 ms |

- **Structured output:** the [structured-output guide](https://ai.google.dev/gemini-api/docs/structured-output) now documents a newer `response_format` object. The [`generateContent` reference](https://ai.google.dev/api/generate-content) and the live API still accept `responseMimeType` + `responseSchema` (uppercase `ARRAY`/`OBJECT`, `propertyOrdering`). No change is needed for T-203.
- Don't use `gemini-flash-latest`: it is an alias that can move under us, it was about 7× slower here, and it rejects `minimal`.

## Results

### Configs × metrics (25 cases; model rows are 2 reps = 50 calls)

| Model | Config | top-1 | top-3 | intended in top-3 | top-3 with 1.2 s budget | p50 ms | p95 ms | TTFB p50 | JSON valid | items dropped | errors | >1.2 s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite | zero-shot | 0.94 | 0.94 | 0.94 | 0.94 | 651 | 835 | 650 | 1.00 | 0 | 0 | 0 |
| gemini-3.5-flash-lite | **few-shot** | **0.96** | **0.98** | **0.98** | **0.98** | 671 | 885 | 669 | 1.00 | 2 | 0 | 1 |
| none | fallback | 0.28 | 0.60 | 0.60 | 0.60 | - | - | - | 1.00 | 0 | 0 | 0 |

- "top-3" counts a hit when `intendedWord` or any `acceptable` word is in the top 3, compared case-insensitively.
- TTFB ≈ total latency because `generateContent` is not streamed. Streaming would not help a 3-item answer.
- The 2 dropped items were both the plural duplicate `stamps` next to `stamp` (eval-21). That breaks prompt rule 6. Section 6.6 caught it, as designed.

### Spread by rep

| Run | top-1 | top-3 | p50 | p95 |
|---|---|---|---|---|
| zero-shot rep 0 | 0.92 | 0.92 | 651 | 942 |
| zero-shot rep 1 | 0.96 | 0.96 | 660 | 801 |
| few-shot rep 0 | 0.96 | 1.00 | 677 | 885 |
| few-shot rep 1 | 0.96 | 0.96 | 641 | 872 |

At `temperature: 0.2` the reps differ by one case each. Zero-shot vs few-shot is a difference of 2 calls out of 50, so read it as "few-shot fixes a failure mode", not as a statistically solid accuracy gain.

### By shape (top-3)

| Shape | n per rep | zero-shot | few-shot | fallback |
|---|---|---|---|---|
| clean-stall | 4 | 0.75 | 0.875 | 0.75 |
| filler-stall | 4 | 1.00 | 1.00 | 0.25 |
| near-synonym-1 | 4 | 1.00 | 1.00 | 0.75 |
| near-synonym-2 | 3 | 1.00 | 1.00 | 0.33 |
| known-name | 3 | 1.00 | 1.00 | 1.00 (top-1 0.00) |
| not-in-bank | 3 | 0.83 | 1.00 | 0.00 |
| circumlocution | 2 | 1.00 | 1.00 | 1.00 |
| near-miss-sound | 2 | 1.00 | 1.00 | 1.00 |

### Worst misses (model)

Every model miss, all reps:

1. **eval-04, wanted `hospital` (zero-shot ×2, few-shot ×1).** Got `Sunrise Clinic` (0.75-0.95), `pharmacy`, `Dr. Velrin`. The transcript is "My appointment is in the big building with wards and nurses. Please drive me to the". For *this* user, their own clinic is a sensible answer. **This is a fixture problem, not a model problem.** Proposal for LOGIC (T-007): add `Sunrise Clinic` to `acceptable`, or reword the case so it clearly points to a hospital.
2. **eval-20, wanted `umbrella` (zero-shot rep 0 only).** Got `towel` 0.80, `glasses` 0.40, `phone` 0.20, all bank words, for "Rain is falling outside and I want to stay dry on my walk. Please bring my". The model **forced bank words**, against rule 4. Zero-shot rep 1 and both few-shot reps returned `umbrella` 0.85. Example 6 ("nothing in the bank fits; must not force") is exactly what fixes this.

### Fallback (bank-only), measured

top-1 0.28, top-3 0.60. Worst misses, with the cause in Section 7:
- eval-13, wanted spoon. Got **`fork`, the word the user just rejected** ("not a fork"), plus tea and soup. Section 8, Example 4 says this must never appear. Cause: the recency +0.5.
- eval-01, -09, -24, wanted cup. **`tea` (already said) ranks above `cup`** every time. eval-03: `book` ranks above library. Same cause.
- eval-05, wanted lisinopril ("starting with lisi … my, um, my"). Got glasses, book, bread. There is no partial-word rule, and the filler pushed "take my" out of `stalledAfter`.
- eval-07, -11, -21: nothing scored, so the last-resort fallthrough returned `kitchen, bathroom, pharmacy` at 0.05 confidence. That is noise.
- known-name 3/3 in top-3 but 0/3 at top-1: names rank behind topic words already said (park, garden, Sunrise Clinic). Same recency cause.

## Recommendations to ORCH

These are proposals. I have not edited `PREDICTOR_PROMPT.md`, which ORCH owns. Any of them that changes the prompt or examples means a prompt version bump.

**Model call (Section 2):**
- **R-A. Pin `gemini-3.5-flash-lite`** and add `thinkingConfig: { thinkingLevel: 'minimal' }` to the generation config. No other change is needed; `responseSchema` works.
- **R-B. Ship Examples 1-7 as few-shot turns** (user/model pairs before the real user turn). The cost is about 20 ms p50 and about 30-50 ms p95, which leaves headroom under 1.2 s.
- **R-C. Keep the 1.2 s timeout.** The p95 here is 835-885 ms before the proxy. T-203 should be deployed in a US region and should measure its own hop. If proxy p95 pushes the total past ~1.1 s, raise the timeout to 1.5 s rather than lose model answers. Step 2's speculative prefetch hides most of this latency anyway.

**System prompt (Section 3), small:**
- **R-D. Rule 6:** the model still returned `stamp` + `stamps`. Add an explicit line: "Never return both a word and its plural." The validator already catches it, but each duplicate wastes a slot, and slots are only 3.

**Fallback (Section 7).** This matters more because of R5. On a rate-limited key, the fallback is what users see:
- **R0 (most important). Invert recency for words said in *this* transcript.** Give 0 (or a penalty) to non-person words already said. Keep +0.5 only for names (people recur) and for words *suggested* in the last 5 minutes. This fixes the `fork` case, the `tea` > `cup` cases, and the names ranking second.
- **R1. Add a partial-word prefix rule:** +1.0 when a transcript token of 3 or more letters, other than a stop word, is a prefix of a bank word ("lisi" matches lisinopril). This mirrors prompt rule 3.
- **R2. Match the category cues against the last ~8 transcript words with fillers removed,** not only `stalledAfter`. Fillers ("um, my") currently kill the "take my" medication boost.
- **R3. When nothing scores, return `[]`** instead of random personal entries at 0.05. Step 2 can show a quiet `status` screen. This is a UX call for ORCH and GLASS.
- **R4. Clarify** whether the `sample` tag counts in tag overlap. The harness ignores it as metadata.

**Ops (blocking for the G2 gate and the demo):**
- **R5. Rate limit. Decision for now: stay on the free tier and throttle.** The free tier caps us at **15 requests/minute per project per model**. That number comes from the API itself: 429 `quotaId: GenerateRequestsPerMinutePerProjectPerModel-FreeTier`, `quotaValue: "15"`, `retryDelay: "19s"`, reached after 17 calls in 5.9 s. Google no longer publishes free-tier numbers ([rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits) points to AI Studio), and the limits are **per project, not per key**, so extra keys don't help.
  - **Why not another free model:** they were 3-7× slower (above), and the limit is per model anyway. `gemini-3.5-flash-lite` at 15/min is the best free option.
  - **Without a throttle,** Step 2 prefetch on every final segment runs 30-60 calls/min in busy talk and hits 429 within the first minute.
  - **Reference throttle: `spikes/predictor/throttle.mjs`** (pure, injectable clock). T-201 should port it.
    - Prefetch is trailing-edge: at most 1 call per 5 s, always on the *latest* transcript, and in-between segments are coalesced. Prefetch can use at most 12 of the 15 slots, so **3 slots/min are reserved for help taps**.
    - A tap uses the cache if it matches the current transcript. Otherwise it makes a live call if the window has room, and otherwise uses the stale cache or the fallback. **It never waits on the limiter.**
    - A 429 blocks calls for its `retryDelay` and is **never retried** inside the 1.2 s budget.
  - **Fake-clock check** (`node spikes/predictor/throttle-check.mjs`, deterministic, enforces the real 15/min quota):

| Scenario | Finals | Taps | Model calls | Max per 60 s | 429s | Taps answered from | Max tap wait |
|---|---|---|---|---|---|---|---|
| 8 fixture conversations back to back | 48 | 8 | 48 | 12 | 0 | cache 8/8 | 0 ms |
| Busy talk: final every 2 s, tap every 10 s, 10 min | 300 | 59 | 122 | 13 | 0 | live 59 | 650 ms (one call) |
| Worst case: final every 1 s, tap every 4 s, 10 min | 600 | 149 | 150 | **15** | 0 | live 142, stale cache 7 | 650 ms |
| Shared quota: +6 req/min used elsewhere in the project | 200 | 37 | 54 | 12 | 8 (others' traffic) | live 15, cache 3, stale 19 | 650 ms |
| Unthrottled, final every 1 s | | | | 60 | 429 within the first minute | | |

    In the real fixture conversations every help tap was an **instant cache hit**: the user stops talking at a stall, so prefetch has caught up. The worst case sits exactly at the cap with 0 429s. When someone else on the project eats quota, taps degrade to the stale cache, not to errors.
  - **Live check** (`--live`, 3 min against real Gemini, a final every 1.5 s, a tap every 8 s): **PASS, 0 HTTP 429s.** All 22 help taps were answered by a live model call, with a max tap wait of 683 ms. The total call count and max per 60 s weren't captured (output was truncated). Re-run `--live` to get them. The fake-clock run above bounds them at ≤15/min.
  - **Also needed:** prefetch only while Step 2/3 is active. **The daily cap (RPD) is unknown**; it isn't in the 429 or the docs, so check AI Studio → Rate limits. At ≤12 prefetches a minute, an hour of continuous talk is ≤720 calls. If the RPD cap turns out low, raise `minGapMs` to 10 s for the demo.
  - **If we get billing later:** Tier 1 removes the bottleneck. Keep the throttle anyway, at `minGapMs` ~2 s.

## Notes for other lanes

- **T-201 (LOGIC):** `validate()` and `fallback()` in `eval.mjs` are a spec-faithful reference with a self-check. Port them; do not import from `spikes/`. Also port `throttle.mjs` (R5) and keep `throttle-check.mjs`'s scenarios as Vitest cases. Handle 429 as an immediate fallback.
- **T-204 (GLASS, Step 2):** call `onFinal` on each final segment and `onHelp` on SELECT. Don't call `predict` directly, or the prefetch will blow the 15/min quota.
- **T-203 (AI):** the exact request body that worked is `body()` in `eval.mjs` plus `thinkingConfig.thinkingLevel = 'minimal'`. Put the model ID in one constant.
- **T-007 (LOGIC):** see eval-04 above. The eval set is also near ceiling (0.94-0.98). Add harder cases, such as noisy STT-style transcripts with mis-hearings, two plausible bank names, or long tails, so the next prompt change can be measured.
