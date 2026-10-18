# S-2 Findings: Gemini predictor against fixtures

_Status: PARTIAL, Sat Oct 17 2026, AI lane. The harness, validator, fallback baseline and model research are done. The Gemini rows are pending one run with a `GEMINI_API_KEY` (about 2 minutes)._

## How to run

```sh
# key in your shell or in .env.local at the repo root (gitignored by `.env.*`); never commit it
GEMINI_API_KEY=... node spikes/predictor/eval.mjs                                   # gemini-3.5-flash-lite, zero-shot + few-shot + fallback, 2 reps
GEMINI_API_KEY=... node spikes/predictor/eval.mjs --models gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash-lite
node spikes/predictor/eval.mjs --offline                                            # fallback + validator self-check, no key
```

Each run writes `results/<timestamp>-<models>.json` (every call: raw output, latency, validation result) and a `.md` copy of the tables below. Keys are passed in a header (`x-goog-api-key`), never in a URL, and are scrubbed from any error text before it is saved.

**What the harness does, per the spec:**
- It parses the Section 3 system prompt, the Section 5 schema and Examples 1-7 **out of `docs/PREDICTOR_PROMPT.md` at run time**, so it tests the doc as written. If the doc changes shape, the parse fails loudly.
- Section 4 input building, using the whole `words.json` bank with `sample` entries kept (38 entries).
- Section 2 generation config, plus a **thinking probe**: it tries `thinkingLevel: minimal`, then `thinkingBudget: 0`, then `thinkingLevel: low`, then the model default, and keeps the first variant the API accepts. The probe result is saved.
- Section 6 validation. It runs a self-check first: all 7 doc example outputs must pass, and an adversarial list (`um`, `the cups` vs `cup`, confidence 2, `x1!`) must reduce to one `cup` at confidence 1 with `source: 'bank'`.
- Section 7 fallback.
- Calls run one at a time so latencies are clean. Calls are not aborted at 1.2 s, so we see the real tail; `>1.2 s` counts them. The **"top-3 with 1.2 s budget"** column is what a user would actually get: the model's answer if it was valid and in time, otherwise the fallback's.

## Model ID (confirmed from docs, Oct 17 2026)

- **Use `gemini-3.5-flash-lite`** (stable). The [models page](https://ai.google.dev/gemini-api/docs/models) calls it "Our fastest, most cost-effective 3.5 model for high-throughput execution".
- Runners-up to compare in the same run: `gemini-3.1-flash-lite` (stable, older), `gemini-2.5-flash-lite` (access-limited), `gemini-3.6-flash` (stable; larger and slower).
- `gemini-2.0-flash*` and `gemini-3.1-flash-lite-preview` are shut down. Do not use them.
- **Thinking:** per the [thinking guide](https://ai.google.dev/gemini-api/docs/thinking), `gemini-3.5-flash-lite` **defaults to `minimal`**. It is controlled by `thinking_level`/`thinkingLevel`, and the guide doesn't document a way to fully turn thinking off. The probe records what the live API accepts.
- **Structured output:** the [structured-output guide](https://ai.google.dev/gemini-api/docs/structured-output) now documents a newer `response_format` object. The [`generateContent` reference](https://ai.google.dev/api/generate-content) still shows `responseMimeType` + `responseSchema`, which is what PREDICTOR_PROMPT.md specifies and what the harness sends. If the run returns 400s on `responseSchema`, that is the cause. Report it to ORCH before T-203 hard-codes the request shape.

## Results

### Configs × metrics (25 cases)

| Model | Config | top-1 | top-3 | top-3 with 1.2 s budget | p50 ms | p95 ms | TTFB p50 | JSON valid | items dropped | errors | >1.2 s |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite | zero-shot (×2) | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| gemini-3.5-flash-lite | few-shot (×2) | pending | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| none | **fallback (measured)** | **0.28** | **0.60** | 0.60 | - | - | - | 1 | 0 | 0 | 0 |

"top-3" counts a hit when `intendedWord` or any `acceptable` word appears in the top 3, compared case-insensitively. For the fallback, "intended word in top-3" is also 0.60.

### By shape: fallback (measured)

| Shape | n | top-1 | top-3 | Why |
|---|---|---|---|---|
| clean-stall | 4 | 0.00 | 0.75 | The word the user already said outranks the target ("tea" over cup, "book" over library). eval-04 (hospital) is not in the bank. |
| filler-stall | 4 | 0.25 | 0.25 | Weakest shape. See R1 and R2. |
| near-synonym-1 | 4 | 0.50 | 0.75 | |
| near-synonym-2 | 3 | 0.33 | 0.33 | |
| known-name | 3 | 0.00 | 1.00 | Finds the name, but ranks it behind topic words already said (park, garden, Sunrise Clinic). |
| not-in-bank | 3 | 0.00 | 0.00 | Expected: a bank-only ranker cannot produce these. |
| circumlocution | 2 | 1.00 | 1.00 | |
| near-miss-sound | 2 | 0.50 | 1.00 | |

Model by-shape and worst-miss tables: pending (written to `results/*.md` by the run).

### Fallback worst misses (measured)

- eval-05 wanted **lisinopril**, got glasses, book, bread. The transcript says "starting with lisi", but Section 7 has no partial-word rule, and `stalledAfter` is `um, my`, so the "take my" medication boost never fires.
- eval-06 wanted **phone**, got Maya, metformin.
- eval-07 wanted **towel**, got kitchen, bathroom, pharmacy. Nothing scored, so it used the "most recent personal entries" fallthrough.
- eval-11 wanted **armchair**: nothing scored, same fallthrough.
- eval-04 wanted **hospital**, which is not in the bank. It got Sunrise Clinic, Dr. Velrin, kitchen. Sunrise Clinic is a reasonable answer here.

## Recommendations to ORCH (do not edit PREDICTOR_PROMPT.md; these are proposals)

**Already supported by the fallback data:**
- **R0 (most important). Fallback: invert the recency rule for words said in *this* transcript.** Today Section 7 gives +0.5 to a bank word the user already said. In the measured data that pushes the *topic* word above the target: "tea" ranks above cup in eval-01, eval-09 and eval-24, and "book" above library in eval-03. Worse, eval-13 suggests **"fork", the word the user just rejected** ("not a fork"), which Section 8, Example 4 says must never happen. Proposal: give 0 (or a penalty) to non-person words already said in the transcript, and keep the +0.5 recency only for *names* (people recur in conversation) and for words *suggested* in the last 5 minutes.
- **R1. Fallback: add a partial-word prefix rule.** Give +1.0 when a transcript token of 3 or more letters, other than a stop word, is a prefix of a bank word ("lisi" matches lisinopril, "cuh"/"cu" matches cup). This mirrors Section 3, rule 3 ("a partial word is a strong clue to the first sound") and costs nothing.
- **R2. Fallback: match the category cues against the last ~8 words of the transcript, not only `stalledAfter`.** Fillers ("um, my") push "take my" out of `stalledAfter`, which kills the medication boost. Alternatively, strip fillers from `stalledAfter` before matching.
- **R3. Fallback: the "no score" fallthrough should return `[]`, not random personal entries.** Showing "kitchen, bathroom, pharmacy" at 0.05 confidence is noise on a display whose whole thesis is quiet. Step 2 can show a `status` screen instead. This is a UX call for ORCH and GLASS.
- **R4. Spec clarification:** should the `sample` tag count in tag overlap? The harness ignores it. It is metadata, and production drops sample entries anyway. Fixture eval-05's transcript literally contains "sample".

**Pending the model run** (I'll fill these in with numbers):
- Whether to ship the few-shot examples. Ship them only if few-shot top-3 is clearly better (≥ +0.08, i.e. 2+ cases) and p95 stays under 1.2 s. The seven examples add roughly 1.5k input tokens per call.
- Whether 1.2 s is a realistic timeout. Decide from p95 and the "top-3 with 1.2 s budget" column. Note that production adds one proxy hop (T-203) that this spike does not measure.
- Which thinking setting to use, from the probe result.
- Prompt changes from the model's worst misses.

## Notes for other lanes

- **T-201 (LOGIC):** `validate()` and `fallback()` in `eval.mjs` are a spec-faithful reference with a self-check. Port them; do not import from `spikes/`.
- **T-203 (AI):** the request shape that works is saved in `results/*.json` → `thinkingProbe`. Put the model ID in one constant, as Section 2 says.
