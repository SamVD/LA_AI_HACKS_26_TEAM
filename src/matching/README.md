# Word matching (T-103)

`matchWord(transcript, target, strictness = 1)` is pure and returns
`{ ok, score, heard }`. `heard` is the best normalized token or n-gram, including
on a failed match (empty when there is no complete n-gram). Score is evidence
in [0, 1], not clinical confidence.

`normalize`, `phoneticCode`, and Levenshtein `editDistance` are also exported.
Normalization lowercases, removes accents and punctuation, preserves inner
apostrophes, turns hyphens into spaces, expands `dr` to `doctor`, and collapses
whitespace. Matching removes fillers `um/uh/er/erm/hmm/like` (unless present in
the target), ignores a leading article, and checks whole contiguous n-grams.
`cup` never matches inside `cupboard`; `ice cream` requires both words in order.

| Strictness | Rules |
| --- | --- |
| 2 (exact) | Exact n-gram or simple final-word plural (`s` / `es`). |
| 1 (default) | Exact/plural; edit distance ≤1 for targets of 5–7 letters, ≤2 for 8+; equal phonetic code for targets of 5+ letters. |
| 0 (lenient) | Level 1 plus distance ≤1 for 3–4 letters with the same first letter; equal phonetic code at any length. |

The builder prompt says both "phonetic at 4+" and "3–4 letters only exact or a
plural" for level 1. The latter, explicit short-word restriction takes
precedence here. Lenient mode accepts `cop/cup` and `cap/cat`; levels 1 and 2
reject them. Exact mode accepts `cup uh`, `the cup`, `cups`, and `it's a cup`.

The English phonetic heuristic handles silent initial k/g/p before n, wr/wh,
ph→f, soft c→s and soft g→j before e/i/y, ck/c/q→k, sh/ch→x, th→0,
noninitial vowels, and repeated letters. It preserves word boundaries.
It is not a pronunciation dictionary. Non-Latin words use text/edit matching.

Exact score = 1; plural score = 0.95. Otherwise score is
`1 - distance / max(candidate.length, target.length)`, with an accepted phonetic
match scoring at least 0.85. Empty input always fails with score 0.
