export type Strictness = 0 | 1 | 2

export interface MatchResult {
  ok: boolean
  /** Similarity evidence, not a calibrated probability. */
  score: number
  /** The normalized token or contiguous phrase that best matched. */
  heard: string
}

// All levels compare whole n-grams and accept exact text / simple plurals.
// Level | Edit distance (target letters)                  | Phonetic equality
//   2   | none                                            | none
//   1   | <=1 for 5-7; <=2 for 8+; none for 1-4            | target >=5 letters
//   0   | level 1 + <=1 for 3-4 with the same first letter | any length
// The short-word exact/plural rule in the builder spec takes precedence over
// its earlier "phonetic at 4+" wording. See README.md.
export function normalize(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, ' ')
    .replace(/(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/gu, ' ')
    .replace(/\bdr\b/g, 'doctor').replace(/\s+/g, ' ').trim()
}

export function editDistance(left: string, right: string): number {
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

/** English consonant heuristic, not a pronunciation dictionary. */
export function phoneticCode(text: string): string {
  return normalize(text).split(' ').map(word => word
    .replace(/'/g, '').replace(/^[kgp](?=n)/, '').replace(/^wr/, 'r').replace(/^wh/, 'w')
    .replace(/ph/g, 'f').replace(/sh|ch/g, 'x').replace(/th/g, '0')
    .replace(/c(?=[eiy])/g, 's').replace(/g(?=[eiy])/g, 'j')
    .replace(/ck|c|q/g, 'k').replace(/(?!^)[aeiouy]/g, '')
    .replace(/(.)\1+/g, '$1')).join(' ')
}

function singulars(word: string): string[] {
  return [word, ...(word.length > 3 && word.endsWith('s') ? [word.slice(0, -1)] : []),
    ...(word.length > 4 && word.endsWith('es') ? [word.slice(0, -2)] : [])]
}

function pluralMatch(candidate: string, target: string): boolean {
  const a = candidate.split(' ')
  const b = target.split(' ')
  return a.every((word, index) => index < a.length - 1 ? word === b[index] :
    singulars(word).some(form => singulars(b[index]).includes(form)))
}

function compare(candidate: string, target: string, strictness: Strictness): Omit<MatchResult, 'heard'> {
  if (candidate === target) return { ok: true, score: 1 }
  if (pluralMatch(candidate, target)) return { ok: true, score: 0.95 }
  const distance = editDistance(candidate, target)
  const length = [...target.replace(/[^\p{L}\p{N}]/gu, '')].length
  const score = Math.max(0, 1 - distance / Math.max([...candidate].length, [...target].length))
  if (strictness === 2) return { ok: false, score }
  const budget = length >= 8 ? 2 : length >= 5 ? 1 :
    strictness === 0 && length >= 3 && candidate[0] === target[0] ? 1 : 0
  const phonetic = (strictness === 0 || length >= 5) &&
    /^[a-z ']+$/.test(candidate + target) && phoneticCode(candidate) === phoneticCode(target)
  return { ok: distance <= budget || phonetic, score: phonetic ? Math.max(score, 0.85) : score }
}

export function matchWord(transcript: string, target: string, strictness: Strictness = 1): MatchResult {
  const expected = normalize(target)
  if (!expected) return { ok: false, score: 0, heard: '' }
  const targetTokens = expected.split(' ')
  const fillers = new Set(['um', 'uh', 'er', 'erm', 'hmm', 'like'])
  const tokens = normalize(transcript).split(' ').filter(token => token &&
    (!fillers.has(token) || targetTokens.includes(token)))
  if (/^(a|an|the)$/.test(tokens[0]) && tokens[0] !== targetTokens[0]) tokens.shift()
  let best: MatchResult = { ok: false, score: 0, heard: '' }
  for (let i = 0; i <= tokens.length - targetTokens.length; i++) {
    const heard = tokens.slice(i, i + targetTokens.length).join(' ')
    const result = { ...compare(heard, expected, strictness), heard }
    if ((result.ok && !best.ok) || (result.ok === best.ok && (!best.heard || result.score > best.score))) best = result
  }
  return best
}
