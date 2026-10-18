# T-317 Findings: StepFun `step-5-preview` as a word predictor (Phase A, local only)

_Status: DONE, Sun Oct 18 2026, 8:20 AM PT, AI lane (Sam). Raw data: `results/2026-10-18T15-09-23-868Z-step-5-preview.{json,md}` (every call's output, latency, tokens and validation; no key)._

## TL;DR for ORCH

- **FAIL on latency.** When `step-5-preview` answers, its answers are perfect: **34/34 correct in the top 3, valid JSON every time**. But the median answer took **6.6 s** (p95 9.4 s), against a bar of ≤ 1.2 s, and **28 of 62 calls didn't finish within 10 s**. It's a reasoning model: even at `reasoning_effort: low` it writes about 500 tokens of reasoning (about 1,800 characters) before the answer.
- **In the app it would add nothing.** No call finished inside the 1.2 s budget, so every help tap would fall back to the word list. The "top-3 with 1.2 s budget" column equals the fallback's 0.677.
- **Don't start T-318 with this model.** A StepFun-first, Gemini-fallback setup would spend the whole client budget waiting for StepFun.
- Extra data point: `step-3.7-flash` is worse. It spent all 1,024 tokens on reasoning and returned an empty answer after 6.8–8.7 s.

## Results (prompt v2, 31 cases, few-shot, 2 reps, latency from Sam's laptop at the venue)

| Model | Config | top-1 | top-3 | valid JSON | p50 ms | p95 ms |
|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite (S-2, prompt v1, 25 cases) | few-shot | 0.96 | 0.98 | 1.00 | 671 | 885 |
| gemini-3.5-flash-lite (S-2, prompt v1, 25 cases) | zero-shot | 0.94 | 0.94 | 1.00 | 651 | 835 |
| **step-5-preview**, all 62 calls (timeouts count as misses) | few-shot | 0.55 | 0.55 | 0.55 | – | – |
| **step-5-preview**, the 34 calls that answered | few-shot | **1.00** | **1.00** | **1.00** | **6,605** | **9,353** |
| word-list fallback (no model) | – | 0.39 | 0.68 | 1.00 | – | – |

- Fastest successful call: 2,861 ms. Slowest: 9,623 ms. Rep spread: p50 6.8 s and 6.3 s.
- **Zero-shot was not run.** It removes the few-shot turns but not the reasoning step, so it can't get close to 1.2 s, and the deadline was close.
- **Comparability:** S-2's Gemini numbers used prompt v1 and 25 cases. This run used prompt v2 and the current 31 cases. A Gemini re-run on the same set was started and **stopped on purpose**: it uses the production key's free-tier quota (15/min), which the team needs for the demo and video right now. The latency gap is about 10×, far larger than any effect of that difference.

## Pass bar

| Bar | Needed | step-5-preview | |
|---|---|---|---|
| top-3 | ≥ 0.90 | 1.00 when it answers; 0.55 over all calls | ✗ over all calls |
| valid JSON | ≥ 95% | 100% when it answers; 55% over all calls | ✗ over all calls |
| p50 latency | ≤ 1.2 s | **6.6 s** | ✗ |

## API facts (from StepFun's docs, not guessed)

| Question | Answer | Source |
|---|---|---|
| Model ID | `step-5-preview`, confirmed by `GET /v1/models` on our key | [Chat Completions API](https://platform.stepfun.ai/docs/en/api-reference/chat/chat-completion-create), [Hugging Face card](https://huggingface.co/stepfun-ai/Step-5-Preview) |
| Endpoint | `POST https://api.stepfun.ai/v1/chat/completions`, OpenAI-compatible. The Chinese docs use `api.stepfun.com`; `--base` switches. | [Chat Completions API](https://platform.stepfun.ai/docs/en/api-reference/chat/chat-completion-create), [zh docs](https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create) |
| Auth | `Authorization: Bearer <key>` | same page (curl examples) |
| JSON output | `response_format: { "type": "json_object" }` only; **no schema option** is documented. JSON mode forces an object, and our schema is an array, so the script unwraps `{"x":[…]}`. In practice the probe call with JSON mode on timed out at 10 s. Without it, all 34 answers were a valid array (0 unwrapped). | same page |
| Reasoning | `reasoning_effort` = `low` / `medium` / `high`; the reasoning text comes back in `message.reasoning`. `low` was used. The API reports `reasoning_tokens: 0` in `usage`, but `completion_tokens` (p50 492) includes the reasoning. | same page |
| Rate limits | **Not documented** anywhere we found. No 429s in 63 calls at 30/min. | – |
| Price | ¥7 per 1M input and ¥20 per 1M output (about $1 / $2.70 via OpenRouter), from secondary sources. At about 2,350 prompt tokens and about 490 completion tokens per call, that's **about 0.37¢ per call**, roughly 3–4× our Gemini estimate. | [AI Weekly](https://aiweekly.co/alerts/stepfun-ships-step-5-preview-api-a-600b-moe-at-1270-that-scores-44-on), [developersdigest](https://www.developersdigest.tech/blog/stepfun-step-5-preview-open-weights-oct-15-2026) |

## Failure modes seen

- **Timeouts:** 28/62 calls hit the 10 s hard stop, with no response at all.
- **JSON mode plus reasoning:** the probe call timed out, so JSON mode was left off. Prompt-only JSON was valid every time.
- **None of these appeared:** refusals, prose instead of JSON, wrong language, or invented personal names.

## Method

- `spikes/stepfun/eval.mjs` is a copy of `spikes/predictor/eval.mjs` (S-2) with **only the API call swapped**. Prompt parsing from `docs/PREDICTOR_PROMPT.md`, input building, the validator, scoring, the fallback and the 1.2 s budget column are identical.
- A config probe picks the first request variant that returns parseable JSON: `reasoning_effort=low` with JSON mode (timed out), then `reasoning_effort=low` (**chosen**).
- `max_tokens` is 1024, not Gemini's 128, so reasoning can't truncate the answer. Every finish reason was `stop`.
- Run: `node spikes/stepfun/eval.mjs --configs few-shot,fallback --reps 2 --rpm 30`. The key comes from `.env.local` (gitignored) and is never logged or written. The results files were checked for the key.

## Extra: `step-3.7-flash` (not part of the T-317 verdict)

`GET /v1/models` on our key also lists `step-3.5-flash`, `step-3.5-flash-2603` and `step-3.7-flash`. `step-3.7-flash` was probed as a possibly faster option (`results/2026-10-18T15-18-35-742Z-step-3.7-flash.*`).

- **No usable answer.** Every request variant (low effort with and without JSON mode, JSON mode only) spent all 1,024 output tokens on reasoning (about 3,700 characters) and returned **empty content**, in 6.8–8.7 s.
- It is also a reasoning model, so it doesn't fix latency. A non-reasoning StepFun model, or a documented way to switch reasoning off, would be needed. **None is documented** on the Chat Completions page.

## Verdict

**FAIL: `step-5-preview` does not meet the bar (p50 6.6 s vs ≤ 1.2 s, 45% timeouts).** Gemini stays the only provider. T-318 should not start with this model.
