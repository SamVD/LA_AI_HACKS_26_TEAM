# Predictor Prompt (Gemini)

Owner: ORCH. Implemented by T-201 (`src/ai/predictor/`), evaluated by S-2 (`spikes/predictor/`). Contract types: `PredictRequest` and `Suggestion` in `src/core/types.ts` (CONTRACT_VERSION 1).

**Prompt version: 1.** Bump it on any change to the system prompt, the input format or the examples, and log the change at the bottom of this file. Eval results are only comparable within a version.

## 1. Job

A person with aphasia is in a conversation and has stalled: they know the word but cannot retrieve it. Given what they said just before the stall, their personal word bank, and optionally where they are, return up to `n` (normally 3) words they are most likely trying to say, each with a confidence.

What makes this different from "next-word prediction":

- The target is almost always a **content word**: a noun (object, food, place, person's name, medication), sometimes a verb or adjective. Never a filler or function word.
- The user may produce **circumlocution** ("the thing you drink out of"), a **near-miss sound** ("cop" for cup, "fork" for "spoon"), or a **semantic neighbour** ("knife" when they mean fork). These are strong clues, not noise.
- The **personal bank** matters: names, medications and places the user cares about are much more likely than generic words, when the context fits.
- Being wrong is cheap (the user swipes), but showing nothing useful wastes the moment. Return three distinct, plausible options rather than three spellings of one guess.

## 2. Model call

- Model: the fastest current Gemini Flash-class model. **S-2 confirms the exact model ID from the Gemini docs; do not hard-code a guess.** The ID lives in one constant in `api/predict/`.
- Called only from the server proxy (`api/predict`, T-203). The client never sees the key.
- `systemInstruction`: the system prompt in Section 3, verbatim.
- `contents`: one user turn containing the JSON input in Section 4.
- Generation config:
  - `responseMimeType: "application/json"`
  - `responseSchema`: the schema in Section 5
  - `temperature: 0.2` (we want stable rankings, not creativity)
  - `maxOutputTokens: 128`
  - Disable or minimise "thinking" if the chosen model supports a thinking budget. Latency matters more than reasoning depth here.
- Client timeout: **1.2 s** end-to-end via `AbortSignal`, then fall back (Section 7).

## 3. System prompt

```text
You help a person with aphasia find a word they are stuck on during a conversation. They know what they want to say but cannot retrieve the word.

You receive JSON with:
- "transcript": what was said recently. The person stalled at the [STALL] marker at the end.
- "stalledAfter": the last words they said before stalling.
- "bank": their personal word list. Each entry has a word, a category, and tags. Names, medications and places in it are people and things they care about.
- "place": where they are right now (optional).
- "n": how many suggestions to return.

Return the n words they are most likely trying to say at [STALL], most likely first.

Rules:
1. Suggest the single word that fills the gap, usually a noun: an object, food, place, person's name, or medication. Use a verb or adjective only when the grammar clearly needs one. A two-word item is fine only when it is one thing ("ice cream", "living room").
2. Never suggest filler or function words (um, uh, the, a, and, like, with, but, or, it, that, thing, stuff) or a word that just repeats the last word said.
3. Treat these as strong clues:
   - Circumlocution: "the thing you cut with" means knife or scissors.
   - Near-miss sounds: "cop" or "cuh" probably means cup; a partial word is a strong clue to the first sound.
   - Wrong word in the same category: "fork, no, the..." means a related utensil.
   - Earlier mentions: a topic or name from earlier in the transcript is likely to come up again.
4. Prefer a word from the bank when it fits the context about as well as a general word. Copy bank words exactly as written, including capitals. Do not force a bank word that does not fit.
5. Use "place" only as a tie-breaker.
6. The suggestions should be different words, not variants of one word (cup, mug, glass is fine; cup, cups, a cup is not).
7. Confidence is your probability, from 0 to 1, that this exact word is the one they want. The values do not need to sum to 1. Use low numbers when the context is vague.

Output only a JSON array of objects with "word" and "confidence". No explanation.
```

## 4. Input format

The proxy builds the user turn from `PredictRequest` as compact JSON:

```json
{
  "transcript": "<transcriptTail> [STALL]",
  "stalledAfter": "<stalledAfter>",
  "bank": [{ "word": "Maya", "category": "person", "tags": ["family", "daughter"] }],
  "place": "Ralphs supermarket",
  "n": 3
}
```

Building rules (T-201 / T-203):

- `transcript`: `transcriptTail`, trimmed, with ` [STALL]` appended. At most ~40 words / 300 characters; cut from the front, at a word boundary.
- Keep fillers ("um", "uh") and false starts in the transcript. They tell the model where the stall is and may carry near-miss sounds.
- `bank`: map each `WordEntry` to `{word, category, tags}` only (no `frames`, `id`, or asset keys). Order: personal entries first (`category` is `person`, `place` or `medication`), then the rest. Cap at **150 entries**. Drop entries tagged `sample` in production builds.
- `place`: `place.label` if present, otherwise omit the field. Never send raw lat/lon to the model.
- `n`: from the request, clamped to 1-5.
- The proxy rejects requests larger than 16 KB or with an empty `transcriptTail` (T-203).

## 5. Output schema

`responseSchema` passed to Gemini:

```json
{
  "type": "ARRAY",
  "maxItems": 5,
  "items": {
    "type": "OBJECT",
    "properties": {
      "word": { "type": "STRING" },
      "confidence": { "type": "NUMBER" }
    },
    "required": ["word", "confidence"],
    "propertyOrdering": ["word", "confidence"]
  }
}
```

The proxy returns the model's raw JSON text. **The client validates it again** (Section 6); never trust the schema alone.

## 6. Client validation (T-201)

Apply in order. Drop an item that fails a rule, and keep going with the rest.

1. Parse JSON. If parsing fails or the result is not an array → whole response invalid.
2. Each item must be an object with a string `word` and a finite number `confidence`.
3. `word`: trim; collapse inner whitespace; strip surrounding punctuation and quotes. Strip a leading article ("the", "a", "an"). Length 1-40 characters; at most 3 words; letters, spaces, hyphens, apostrophes and periods only (for "Dr. Patel").
4. Reject stop words: `um, uh, er, hmm, the, a, an, and, or, but, with, like, it, that, this, thing, stuff, something`. Reject an item equal (case-insensitive) to the last word of `stalledAfter`.
5. Clamp `confidence` to [0, 1].
6. Dedupe case-insensitively, keeping the higher confidence. Also treat a simple plural as a duplicate (`cup` / `cups`).
7. If a word matches a bank entry (case-insensitive on `word`), use the bank's spelling and set `source: 'bank'`. Otherwise `source: 'model'`.
8. Sort by confidence, descending; take the first `n`.
9. Fill `imageKey` and `mouthKey` from `resolveAssets` (T-106 / T-205). **Never take asset keys from the model.**

If zero items survive → whole response invalid → fallback.

## 7. Fallback (bank-only)

Used on timeout (1.2 s), network error, non-2xx from the proxy, or invalid output. Built into `PredictorService.predict`, which never rejects.

Score every bank entry:

- **Tag and word overlap**: +1.0 for each tag or `word` token that appears in the last 40 words of the transcript (lowercase, after stripping punctuation; tags match on whole tokens).
- **Category fit** from the words in `stalledAfter`: +0.5 for `medication` after "take", "took", "my pill"/"pills"; +0.5 for `person` after "my" + a family word (daughter, son, wife, husband, friend, doctor, nurse), or after "call"/"see"/"talk to"; +0.5 for `place` after "to the", "at the", "go to".
- **Recency**: +0.5 if the word was said earlier in this transcript or suggested in the last 5 minutes.
- **Place**: +0.25 if a tag matches a token in `place.label`.

Take the top `n` with score > 0. Use `confidence = min(0.6, 0.15 * score)` so fallback results never look more certain than the model. `source: 'bank'`. If nothing scores > 0, return the `n` most recently used personal entries with `confidence: 0.05`, or `[]` if the bank is empty.

Log every fallback with its reason (`timeout`, `network`, `http`, `invalid`) through `ModeContext.log` so the companion debug panel (T-206) can show it.

## 8. Worked examples

These follow the conversation shapes T-004 must cover in `fixtures/` (clean stall, stall after a filler, near-synonyms, a known name, a word not in the bank) plus three common aphasia patterns. Bank contents are abbreviated; names are fictional sample entries. S-2 should turn these into eval cases and may include them in the prompt as few-shot examples if top-3 accuracy improves without hurting p95 latency.

### Example 1: clean stall, generic object

```json
{"transcript": "I'm so thirsty. Can you pass me the [STALL]", "stalledAfter": "pass me the",
 "bank": [{"word":"cup","category":"object","tags":["kitchen","drink"]},{"word":"water","category":"food","tags":["drink"]},{"word":"spoon","category":"object","tags":["kitchen"]}], "n": 3}
```
```json
[{"word":"water","confidence":0.45},{"word":"cup","confidence":0.3},{"word":"glass","confidence":0.15}]
```
Why: "thirsty" points to a drink or something to drink from. `glass` is not in the bank but is the obvious third option.

### Example 2: stall after a filler, personal medication

```json
{"transcript": "Every morning after breakfast I take my, um, my [STALL]", "stalledAfter": "I take my, um, my",
 "bank": [{"word":"Lisinopril","category":"medication","tags":["morning","blood pressure","sample"]},{"word":"coffee","category":"food","tags":["morning","drink"]},{"word":"Maya","category":"person","tags":["family","daughter","sample"]}], "n": 3}
```
```json
[{"word":"Lisinopril","confidence":0.6},{"word":"pills","confidence":0.2},{"word":"medicine","confidence":0.1}]
```
Why: "take my" plus a morning medication in the bank. The bank spelling and capital are kept. "coffee" is not taken; "take my coffee" is unlikely.

### Example 3: a known name

```json
{"transcript": "We went to the park on Sunday with my daughter, uh, with [STALL]", "stalledAfter": "my daughter, uh, with",
 "bank": [{"word":"Maya","category":"person","tags":["family","daughter","sample"]},{"word":"Dr. Patel","category":"person","tags":["doctor","sample"]},{"word":"park","category":"place","tags":["outside"]}], "n": 3}
```
```json
[{"word":"Maya","confidence":0.8},{"word":"grandkids","confidence":0.05},{"word":"dog","confidence":0.05}]
```
Why: the bank links "daughter" to Maya. The other two are weak guesses, and their confidences say so.

### Example 4: near-synonyms after a wrong word

```json
{"transcript": "This soup smells great. Can I have a fork, no, not a fork, the, the [STALL]", "stalledAfter": "not a fork, the, the",
 "bank": [{"word":"spoon","category":"object","tags":["kitchen","eat"]},{"word":"fork","category":"object","tags":["kitchen","eat"]},{"word":"knife","category":"object","tags":["kitchen"]}], "n": 3}
```
```json
[{"word":"spoon","confidence":0.85},{"word":"ladle","confidence":0.07},{"word":"bowl","confidence":0.05}]
```
Why: the user rejected "fork" and is about to eat soup. "fork" must not appear.

### Example 5: near-miss sound

```json
{"transcript": "I would love some tea. Can I have a cop, a, a cuh [STALL]", "stalledAfter": "a, a cuh",
 "bank": [{"word":"cup","category":"object","tags":["kitchen","drink"]},{"word":"tea","category":"food","tags":["drink"]},{"word":"cake","category":"food","tags":["dessert"]}], "n": 3}
```
```json
[{"word":"cup","confidence":0.85},{"word":"mug","confidence":0.08},{"word":"pot","confidence":0.04}]
```
Why: "cop" and "cuh" both start with the /k/ sound, and tea goes in a cup. "cake" also starts with /k/ but fits "have a" less well than cup once tea is the topic.

### Example 6: circumlocution, word not in the bank

```json
{"transcript": "The car is making that noise again. I need to take it to the, you know, the guy who fixes it, the [STALL]", "stalledAfter": "who fixes it, the",
 "bank": [{"word":"Ralphs","category":"place","tags":["shopping","food","sample"]},{"word":"keys","category":"object","tags":["house","car"]}], "n": 3}
```
```json
[{"word":"mechanic","confidence":0.7},{"word":"garage","confidence":0.15},{"word":"shop","confidence":0.08}]
```
Why: nothing in the bank fits; the model must not force "keys". All three get `source: 'model'`.

### Example 7: place as a tie-breaker, vague context

```json
{"transcript": "Okay we still need to get some [STALL]", "stalledAfter": "need to get some",
 "bank": [{"word":"milk","category":"food","tags":["breakfast","fridge"]},{"word":"bread","category":"food","tags":["breakfast"]},{"word":"stamps","category":"object","tags":["post office"]}],
 "place": "Ralphs supermarket", "n": 3}
```
```json
[{"word":"milk","confidence":0.25},{"word":"bread","confidence":0.2},{"word":"eggs","confidence":0.12}]
```
Why: the context is vague, so the confidences are low. The supermarket makes groceries more likely than stamps.

## 9. What S-2 should measure

Against `fixtures/predictor-eval.json`, with this prompt version:

- top-1 and top-3 accuracy (`intendedWord` in the suggestions, case-insensitive, after Section 6 validation)
- p50 and p95 latency, measured at the client including the proxy hop
- JSON validity rate before Section 6 (and how many items Section 6 dropped)
- the same three numbers with Examples 1-7 added as few-shot turns, to decide whether to ship them in the prompt
- the fallback's top-3 accuracy alone, as a baseline

Report recommended prompt changes to ORCH; do not edit this file.

## Change log

| Version | Date | Change |
|---|---|---|
| 1 | 2026-10-17 | First draft (T-001). |
