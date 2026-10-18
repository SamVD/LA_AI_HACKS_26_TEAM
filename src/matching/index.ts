export type Strictness = 0 | 1 | 2

export interface MatchResult {
  ok: boolean
  /** Similarity/evidence score in [0, 1], not a calibrated probability. */
  score: number
  /** The normalized full utterance, including words outside the target. */
  heard: string
}

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function editDistance(left: string, right: string): number {
  const a = [...left]
  const b = [...right]
  let previous = b.map((_, index) => index + 1)
  previous.unshift(0)
  for (let i = 0; i < a.length; i++) {
    const current = [i + 1]
    for (let j = 0; j < b.length; j++) {
      current.push(Math.min(current[j] + 1, previous[j + 1] + 1,
        previous[j] + (a[i] === b[j] ? 0 : 1)))
    }
    previous = current
  }
  return previous[b.length]
}

// A small English-oriented consonant code, not a pronunciation dictionary.
// Keep word boundaries, the initial vowel (if any), and consonant order.
function phoneticCode(text: string): string {
  return text.split(' ').map(word => word
    .replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/^wh/, 'w')
    .replace(/ph/g, 'f').replace(/ght/g, 't').replace(/qu/g, 'k')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k')
    .replace(/(.)\1+/g, '$1').replace(/(?!^)[aeiouy]/g, '')).join(' ')
}

function compare(candidate: string, target: string, strictness: 0 | 1): Omit<MatchResult, 'heard'> {
  if (candidate === target) return { ok: true, score: 0.95 }
  const distance = editDistance(candidate, target)
  const length = Math.min([...candidate.replace(/ /g, '')].length, [...target.replace(/ /g, '')].length)
  const similarity = Math.max(0, 1 - distance / Math.max([...candidate].length, [...target].length))
  // One- and two-letter words must be exact. Short words otherwise only accept
  // very close phonetic matches in lenient mode (cup/cop, cup/cupp).
  if (length <= 2) return { ok: false, score: similarity }
  const phonetic = /^[a-z ]+$/.test(candidate + target) && phoneticCode(candidate) === phoneticCode(target)
  const phoneticLimit = strictness === 0 ? Math.max(1, Math.floor(length / 2)) : Math.max(1, Math.floor(length / 3))
  const phoneticOk = phonetic && distance <= phoneticLimit && (length >= 4 || strictness === 0)
  const budget = length <= 3 ? 0 : strictness === 0 ? Math.min(3, Math.floor(length / 4)) : Math.min(2, Math.floor(length / 5))
  const ok = phoneticOk || distance <= budget
  return { ok, score: phoneticOk ? Math.max(similarity, 0.85) : similarity }
}

/** See README.md for exact thresholds and the meaning of each strictness. */
export function matchWord(transcript: string, target: string, strictness: Strictness = 1): MatchResult {
  const heard = normalize(transcript)
  const expected = normalize(target)
  if (!heard || !expected) return { ok: false, score: 0, heard }
  if (heard === expected) return { ok: true, score: 1, heard }
  if (strictness === 2) {
    return { ok: false, score: 1 - editDistance(heard, expected) / Math.max([...heard].length, [...expected].length), heard }
  }
  const tokens = heard.split(' ')
  const width = expected.split(' ').length
  // Only whole tokens / contiguous phrases count. "cup" inside "cupboard"
  // or the token "cream" inside a request for "ice cream" cannot pass.
  let best: Omit<MatchResult, 'heard'> = { ok: false, score: 0 }
  for (let i = 0; i <= tokens.length - width; i++) {
    const result = compare(tokens.slice(i, i + width).join(' '), expected, strictness)
    if ((result.ok && !best.ok) || (result.ok === best.ok && result.score > best.score)) best = result
  }
  return { ...best, heard }
}
