import type { Transcript, WordEntry } from '../../core/types'

export interface Keyword {
  word: string
  kind: 'person' | 'place' | 'topic'
  source: 'bank' | 'rules'
  bankId?: string
  /** Ranking weight, not a probability. */
  score: number
  lastMentionMs: number
}

export interface KeywordOptions {
  /** Same clock as the transcripts. Defaults to the latest valid final. */
  nowMs?: number
  n?: number
  halfLifeMs?: number
  maxAgeMs?: number
}

const stopWords = new Set(`a an the i me my mine we us our ours you your yours he him his she her hers it its
  they them their this that these those who what which where when why how and or but if so because as
  at by for from in into of on onto to with without before after between beside near over under
  is am are was were be been being have has had do does did can could will would shall should may might
  must not no yes yeah yep okay ok good please thank thanks uh um er erm ah hmm well like just really
  very some any all each both much many more most other another same such than then there here now
  already again also too only still even enough about up down out off back through together
  go goes going went come comes came get gets got take takes took bring brings brought put make makes
  made let want wants need needs say says said tell know think see look looks find give try help
  enjoy enjoyed sounds feel feels finish finished leave wait ask calls called named meet met visit
  i'm i've i'll i'd you're you've you'll you'd we're we've we'll we'd they're they've they'll they'd
  he's she's it's that's there's don't doesn't didn't can't couldn't won't wouldn't isn't aren't
  wasn't weren't haven't hasn't hadn't let's`.split(/\s+/))

const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/[’‘]/g, "'").toLowerCase()
const tokensOf = (value: string) => [...value.matchAll(/\p{L}[\p{L}\p{M}]*(?:['’‘][\p{L}\p{M}]+)*/gu)]
  .map(match => ({ raw: match[0], key: normalize(match[0]).replace(/'s$/, ''), start: match.index! }))
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const positive = (value: number | undefined, fallback: number) =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback

/** Pure extraction from committed segments; never retains or persists transcripts. */
export function extractKeywords(
  transcripts: readonly Transcript[], bank: readonly WordEntry[], options: KeywordOptions = {},
): Keyword[] {
  const n = options.n === undefined ? 5 : Number.isFinite(options.n) ? Math.max(0, Math.floor(options.n)) : 0
  if (!n) return []
  const halfLifeMs = positive(options.halfLifeMs, 60_000)
  const maxAgeMs = positive(options.maxAgeMs, 300_000)
  const valid = transcripts.filter(t => t.isFinal && !t.error && t.text.trim() &&
    Number.isFinite(t.tStartMs) && Number.isFinite(t.tEndMs) && t.tEndMs >= t.tStartMs)
  const now = options.nowMs ?? valid.reduce((latest, t) => Math.max(latest, t.tEndMs), 0)
  if (!Number.isFinite(now)) return []

  // A corrected final for one utterance replaces the earlier version. Sorting
  // makes replay order immaterial, including conflicting equal-time finals.
  const segments = new Map<number, Transcript>()
  for (const t of [...valid].sort((a, b) => a.tEndMs - b.tEndMs || compare(a.text, b.text))) {
    if (t.tEndMs <= now) segments.set(t.tStartMs, t)
  }
  const entries = bank.map(entry => ({ entry, keys: tokensOf(entry.word).map(t => t.key) }))
    .filter(item => item.keys.length)
    .sort((a, b) => b.keys.length - a.keys.length || compare(a.entry.id, b.entry.id))
  const result = new Map<string, Keyword>()
  for (const segment of [...segments.values()].sort((a, b) => a.tEndMs - b.tEndMs || a.tStartMs - b.tStartMs)) {
    const age = now - segment.tEndMs
    if (age > maxAgeMs) continue
    const weight = 2 ** (-age / halfLifeMs)
    const tokens = tokensOf(segment.text)
    const seen = new Set<string>()
    const add = (word: string, kind: Keyword['kind'], entry?: WordEntry) => {
      const key = tokensOf(word).map(t => t.key).join(' ')
      if (seen.has(key)) return
      seen.add(key)
      const score = weight * (entry ? kind === 'topic' ? 2 : 3 : 1)
      const previous = result.get(key)
      result.set(key, {
        word: entry?.word ?? word, kind, source: entry ? 'bank' : 'rules',
        ...(entry ? { bankId: entry.id } : {}),
        score: (previous?.score ?? 0) + score, lastMentionMs: segment.tEndMs,
      })
    }
    for (let i = 0; i < tokens.length;) {
      const match = entries.find(({ keys }) => keys.every((key, offset) => tokens[i + offset]?.key === key) &&
        // Don't join unrelated words across sentences (Dr. is a title).
        !/[.!?;]/.test(segment.text.slice(tokens[i].start, tokens[i + keys.length - 1].start).replace(/\bDr\./gi, 'Dr')))
      if (match) {
        const { entry, keys } = match
        add(entry.word, entry.category === 'person' ? 'person' : entry.category === 'place' ? 'place' : 'topic', entry)
        i += keys.length
        continue
      }
      const token = tokens[i]
      const previous = tokens[i - 1]
      // Unknown proper names require an explicit context cue. Sentence-start
      // capitalization alone is not enough to infer a person or a place.
      const cue = previous?.key
      const kind = cue && /^(called|named|with|meet|met)$/.test(cue) ? 'person' :
        cue && /^(at|in|from|to|visit)$/.test(cue) ? 'place' : undefined
      const capitalized = (index: number) => tokens[index] && /^\p{Lu}/u.test(tokens[index].raw) &&
        !stopWords.has(tokens[index].key)
      if (kind && capitalized(i) && !/[.!?;]/.test(segment.text.slice(previous.start + previous.raw.length, token.start))) {
        let end = i + 1
        while (capitalized(end) && /^\s+$/.test(segment.text.slice(
          tokens[end - 1].start + tokens[end - 1].raw.length, tokens[end].start))) end++
        add(tokens.slice(i, end).map(t => t.raw).join(' '), kind)
        i = end
        continue
      }
      if (token.key.length >= 3 && !stopWords.has(token.key)) add(token.key, 'topic')
      i++
    }
  }
  return [...result.values()].sort((a, b) => b.score - a.score || b.lastMentionMs - a.lastMentionMs ||
    compare(normalize(a.word), normalize(b.word))).slice(0, n)
}
