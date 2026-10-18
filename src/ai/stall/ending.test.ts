import { describe, expect, it } from 'vitest'
import { classifyEnding, lastWords } from './ending'

describe('classifyEnding', () => {
  // Every annotated stall utterance in fixtures/conversations, as STT would return it (no final period).
  it.each([
    ['For breakfast I would like some', 'function-word'],
    ['And could you toast a slice of', 'function-word'],
    ['Yes, bring the sharp thing for cutting bread, the', 'function-word'],
    ['Yes, please pour my tea into the', 'function-word'],
    ['After breakfast I take my, um, my', 'function-word'],
    ['We went with my daughter, uh, with', 'function-word'],
    ['We sat near the playground in the', 'function-word'],
    ['Please bring me a cop, no, for tea, a cuh', 'self-repair'],
    ['A glass, no, with a handle, the', 'function-word'],
    ['Please bring a fork, no, not a fork, the', 'function-word'],
    ['Yes. I need the person who repairs cars, the', 'function-word'],
    ['I take my, um', 'filler'],
    ['It is the, uh', 'filler'],
    ['I would like', 'filler'],
    ["I'd like", 'filler'],
    ['It looks like', 'filler'],
    ['It is sort of like', 'filler'],
    ['Can you give me the thing', 'filler'],
    ['Can you hand me the, you know', 'filler'],
    ['Pass me the,', 'trailing-comma'],
  ])('stall: %s', (text, reason) => {
    expect(classifyEnding(text)).toEqual({ stall: true, reason })
  })

  // Complete sentences: from the fixtures' normal pauses with the period dropped, as Scribe does,
  // plus everyday endings that a greedy word list would get wrong.
  it.each([
    'We have plenty of time before your appointment',
    'Yes, I would enjoy another walk with her',
    'We can ask her when she calls',
    'I can bring the bottle over for you',
    'Here it is, and I brought a napkin',
    'Thank you',
    'I like it',
    'Pass me that',
    'Yes, I can',
    'Come in',
    'Hold on',
    'I said no',
    'I think so',
    'No, thank you',
    'Thanks, no worries',
    'See you then',
    'I need the door', // a real stall in clean-stall, but identical to a complete sentence without punctuation
    'One more thing', // ORCH watch item (#75): "thing" and "like" end complete sentences too
    'That is a good thing',
    'The one I like',
    'Do what you like',
  ])('not a stall: %s', text => {
    expect(classifyEnding(text).stall).toBe(false)
  })

  it('treats terminal punctuation and questions as complete, when STT provides them', () => {
    expect(classifyEnding('Pour my tea into the.')).toEqual({ stall: false, rejected: 'terminal-punctuation' })
    expect(classifyEnding('Would you like your usual cup?')).toEqual({ stall: false, rejected: 'question' })
    expect(classifyEnding('Is it in the?')).toMatchObject({ stall: false, rejected: 'question' })
    expect(classifyEnding('   ')).toEqual({ stall: false, rejected: 'empty' })
  })

  it('flags content-word endings only when enabled', () => {
    expect(classifyEnding('I need the door', { contentWordEndings: true })).toEqual({ stall: true, reason: 'content-word' })
    expect(classifyEnding('I need the door.', { contentWordEndings: true }).stall).toBe(false)
  })
})

describe('lastWords', () => {
  it('matches the fixtures\' 4-word stalledAfter', () => {
    expect(lastWords('Yes, please pour my tea into the')).toBe('my tea into the')
    expect(lastWords('After breakfast I take my, um, my')).toBe('take my, um, my')
    expect(lastWords('the', 4)).toBe('the')
  })
})
