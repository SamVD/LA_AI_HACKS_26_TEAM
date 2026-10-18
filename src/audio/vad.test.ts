import { describe, expect, it } from 'vitest'
import type { SpeechState } from '../core/types'
import { chunks, quiet, synth, word } from './test-signals'
import { EnergyVad } from './vad'

function run(bytes: Uint8Array, chunkMs = 50) {
  const events: SpeechState[] = []
  const vad = new EnergyVad(1000, s => events.push(s))
  for (const c of chunks(bytes, chunkMs)) vad.push(c)
  return { vad, events }
}

describe('EnergyVad', () => {
  it('stays silent on a noise floor', () => {
    const { vad, events } = run(synth([quiet(3000)]))
    expect(events).toEqual([])
    expect(vad.heardSpeech).toBe(false)
  })

  it('emits speaking true then false around a word, on the audio clock', () => {
    const { vad, events } = run(synth([quiet(500), word(600), quiet(1000)]))
    expect(events.map(e => e.speaking)).toEqual([true, false])
    expect(events[0].tMs).toBeGreaterThanOrEqual(1000 + 480)
    expect(events[0].tMs).toBeLessThanOrEqual(1000 + 540)
    expect(events[1].tMs).toBeGreaterThanOrEqual(1000 + 1080)
    expect(events[1].tMs).toBeLessThanOrEqual(1000 + 1140)
    expect(vad.speechStartMs).toBeGreaterThanOrEqual(480)
    expect(vad.speechEndMs).toBeLessThanOrEqual(1140)
    expect(vad.silenceMs).toBeGreaterThanOrEqual(900)
  })

  it('ignores a click shorter than the onset time', () => {
    const { events } = run(synth([quiet(500), word(40), quiet(800)]))
    expect(events).toEqual([])
  })

  it('bridges a short pause inside a word (hang time)', () => {
    const { events } = run(synth([quiet(500), word(300), quiet(150), word(300), quiet(800)]))
    expect(events.map(e => e.speaking)).toEqual([true, false])
  })

  it('splits two words separated by a long pause', () => {
    const { events } = run(synth([quiet(500), word(300), quiet(700), word(300), quiet(800)]))
    expect(events.map(e => e.speaking)).toEqual([true, false, true, false])
  })

  it('does not depend on chunk size', () => {
    const bytes = synth([quiet(400), word(500), quiet(700)])
    const a = run(bytes, 50).events
    expect(run(bytes, 13).events).toEqual(a)
    expect(run(bytes, 100).events).toEqual(a)
  })

  it('adapts to a louder room instead of calling it speech', () => {
    const { events } = run(synth([{ ms: 3000, db: -32 }, word(500, -10), { ms: 800, db: -32 }]))
    expect(events.map(e => e.speaking)).toEqual([true, false])
  })
})
