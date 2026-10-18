# Word matching (T-103)

`matchWord(transcript, target, strictness = 1)` is a pure function. It returns
`{ ok, score, heard }`. `heard` is the normalized full transcript. `score` is
similarity evidence between 0 and 1, not confidence or a clinical measurement.

Normalization lowercases text, removes accents, joins apostrophes, replaces
other punctuation with spaces, and collapses whitespace. Matching uses whole
words and contiguous phrases: `cup` is not contained in `cupboard`, and
`ice cream` must contain both words in order.

| Strictness | Accepted evidence |
| --- | --- |
| 0 (lenient) | Exact utterance or contained target, bounded phonetic-code match, or small edit distance. |
| 1 (normal) | Exact utterance or contained target, tighter phonetic match for words of 4+ letters, or tighter edit distance. |
| 2 (exact) | The entire normalized utterance equals the entire normalized target. `cup uh` fails; `Cup!` passes. |

For a candidate and target, let **L** be the shorter length excluding spaces.
For one or two letters, only exact matches pass. For three letters, lenient
mode permits only a matching phonetic code within one edit; normal mode
requires exact text. This accepts `cop` for `cup` in lenient mode while
rejecting `cap` for `cat` and short fragments such as `up` for `cup`.

For L >= 4 the maximum edit distance is `min(3, floor(L / 4))` in lenient
mode and `min(2, floor(L / 5))` in normal mode. The phonetic edit limit is
`max(1, floor(L / 2))` in lenient mode or `max(1, floor(L / 3))` in normal mode.

The English-oriented phonetic code handles initial `kn`, `wr`, `wh`, plus
`ph`, `ght`, `qu`, soft/hard `c`, repeated letters, and noninitial vowels.
It preserves consonant order and word boundaries. It is a lightweight
heuristic, so it does not cover every homophone, accent, or pronunciation.
Non-Latin words use exact/edit matching only.

Exact utterance score = 1; contained exact target = 0.95. Otherwise the score
is `1 - distance / max(candidate.length, target.length)`, with a floor of 0.85
for an accepted phonetic match. Empty inputs always fail with score 0.
