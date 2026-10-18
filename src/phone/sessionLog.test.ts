import { describe, expect, it } from 'vitest'
import type { Screen } from '../core/types'
import { createHintLog } from './sessionLog'

const candidates = (words: string[], level = 1, index = 0): Screen => ({
  kind: 'candidates',
  level: level as 1 | 2 | 3,
  index,
  items: words.map(word => ({ word, confidence: 0.5, source: 'model' as const })),
})

describe('sessionLog', () => {
  it('opens an episode on a candidates screen and closes it on the next screen', () => {
    const log = createHintLog()
    log.feed(candidates(['cup', 'mug']), 1000)
    log.feed({ kind: 'blank' }, 2000)
    expect(log.entries()).toEqual([
      { at: 1000, endedAt: 2000, words: ['cup', 'mug'], level: 1, word: 'cup', outcome: 'cleared' },
    ])
  })

  it('updates an open episode on browse/escalate screens', () => {
    const log = createHintLog()
    log.feed(candidates(['cup', 'mug'], 1), 1000)
    log.feed(candidates(['cup', 'mug'], 2, 1), 1500)
    const [entry] = log.entries()
    expect(entry).toMatchObject({ level: 2, word: 'mug', outcome: 'open' })
  })

  it('marks an open episode helped when a final transcript matches a suggestion', () => {
    const log = createHintLog()
    log.feed(candidates(['cup', 'mug']), 1000)
    log.feedTranscript('oh yes, the cup', true, 2000)
    expect(log.entries()[0].outcome).toBe('helped')
  })

  it('marks a recently cleared episode helped (screen cleared because the word was found)', () => {
    const log = createHintLog()
    log.feed(candidates(['cup', 'mug']), 1000)
    log.feed({ kind: 'blank' }, 1500)
    log.feedTranscript('the cup, thanks', true, 3000)
    expect(log.entries()[0].outcome).toBe('helped')
  })

  it('leaves old cleared episodes alone and ignores partials and misses', () => {
    const log = createHintLog({ heardWindowMs: 1000 })
    log.feed(candidates(['cup']), 1000)
    log.feed({ kind: 'blank' }, 1500)
    log.feedTranscript('the cup', false, 1600)
    log.feedTranscript('something else', true, 1700)
    log.feedTranscript('the cup', true, 4000)
    expect(log.entries()[0].outcome).toBe('cleared')
  })

  it('caps the log at max entries, newest first', () => {
    const log = createHintLog({ max: 3 })
    for (let i = 0; i < 5; i++) {
      log.feed(candidates([`w${i}`]), i)
      log.feed({ kind: 'blank' }, i + 0.5)
    }
    expect(log.entries().map(e => e.word)).toEqual(['w4', 'w3', 'w2'])
  })
})
