# T-303 keyword extraction

`extractKeywords(transcripts, bank, options?)` is a pure, offline helper for
Step 3. Pass the current rolling array of `Transcript` segments and word bank.
It returns up to `n` keywords (default 5) with display spelling, kind, source,
optional bank id, ranking score, and latest mention time. Scores are weights,
not confidence probabilities. No model, SDK, timers, logging, or storage is used.

```ts
import { extractKeywords } from '../ai/keywords'
const keywords = extractKeywords(transcripts, bank, { nowMs: ctx.now(), n: 3 })
```

Only final, successful segments contribute. A repeated final is counted once;
the latest final with the same `tStartMs` replaces earlier text. Callers must
use one clock and unique utterance starts. Interim STT revisions are ignored.
Future segments are ignored when `nowMs` is supplied; otherwise the latest
valid final defines the clock. Nothing is retained between calls, so callers
control the transcript window and clear it when leaving the mode.

Whole bank phrases are matched first, longest first, without substring matching.
Case, accents, possessives and punctuation between words are normalized;
sentence boundaries are preserved. Bank categories identify people and places;
other categories, including medications, become topics. Tags never cause an
unspoken bank word to appear. Duplicate bank spellings use the lowest id.

For words outside the bank, explicit context followed by capitalized words
identifies possible people (`met Elena Ruiz`) or places (`at Cedar Hospital`).
Other words of at least three characters pass through an English stop-word and
filler filter as topics. These are conservative spelling rules, not linguistic
entity recognition: unfamiliar verbs/adjectives can remain, lowercase unknown
names remain topics, and context can misclassify a capitalized noun. Bank entries
provide reliable categories; this helper does not infer missing words or stalls.

Each distinct keyword contributes once per utterance: weight 3 for bank people
and places, 2 for other bank words, 1 for rules. Each weight decays exponentially,
halving every 60 seconds by default. Mentions older than five minutes expire.
`halfLifeMs` and `maxAgeMs` accept positive finite overrides. Ranking uses total
weight, latest mention, then normalized spelling, with no wall-clock access or
locale dependence. Invalid counts return no results; fractional counts round
down. Empty input returns `[]`.

Tests cover all eleven conversation fixtures, normalization, recency, replay,
correction, timestamps, entity rules, and deterministic output. The module is
ready for the owner of T-302 to import; this task does not wire a mode or display.
