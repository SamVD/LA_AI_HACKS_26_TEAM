/** Mouth cue lookup based on the first pronounced sound (or its spelling proxy).
 * The output keys correspond to the ten static mouth drawings in content/assets/mouth.
 * This is intentionally a broad visual cue, not a pronunciation or phoneme engine.
 */
export type MouthShape =
  | 'back' | 'lip-teeth' | 'lips-closed' | 'open' | 'pucker'
  | 'rounded' | 'teeth-together' | 'tongue-teeth' | 'tongue-up' | 'wide'

const prefixShape: ReadonlyArray<readonly [RegExp, MouthShape]> = [
  [/^(?:th)/, 'tongue-teeth'],
  [/^(?:sh|ch|zh|j)/, 'pucker'],
  [/^(?:ph|f|v)/, 'lip-teeth'],
  [/^(?:wh|wr|w|oo|u|o|r)/, 'rounded'],
  [/^(?:kn|gn|t|d|n|l)/, 'tongue-up'],
  [/^(?:ps|c(?=[eiy])|s|z)/, 'teeth-together'],
  [/^(?:ng|k|g|c|q)/, 'back'],
  [/^(?:ee|e|i|y)/, 'wide'],
  [/^(?:ah|a|h)/, 'open'],
  [/^(?:p|b|m)/, 'lips-closed'],
]

/**
 * Resolve a mouth picture from a word and optional firstSound override.
 * firstSound may be a spelling ("sh", "th") or a coarse phonetic label ("/f/").
 * Returns undefined when there is no usable onset so callers can show text only.
 */
export function mouthKeyFor(word: string, firstSound?: string): string | undefined {
  const raw = (firstSound || word).normalize('NFKD').replace(/\p{M}/gu, '')
    .trim().toLowerCase().replace(/^\/+|\/+$/g, '')
  if (!raw) return undefined

  // Silent initial letters are resolved by their pronounced onset.
  const sound = /^(?:kn|gn|wr|ps)/.test(raw) ? raw :
    /^(?:hour|honest|honor|heir|herb)/.test(raw) ? raw.slice(/^(?:hour|honest|honor|heir|herb)/.exec(raw)![0].length) || 'ah' :
    /^one(?:\b|$)/.test(raw) || /^once(?:\b|$)/.test(raw) ? 'w' :
    /^(?:use|user|usual|unicorn|university|unit|Europe|eulogy)/i.test(raw) ? 'y' : raw

  for (const [pattern, shape] of prefixShape) {
    if (pattern.test(sound)) return `mouth:${shape}`
  }
  return undefined
}
