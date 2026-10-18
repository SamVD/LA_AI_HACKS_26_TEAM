import { describe, expect, it } from 'vitest'
import type { SpeechState } from '../core/types'
import { chunks, quiet, synth, word, zeros } from './test-signals'
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
  // Regression: the simulator's first frame after audioControl(true) is digital silence, then
  // room tone. A floor seeded from that frame made the room tone look like speech, and the
  // floor froze while "speaking", so utterances only ended at maxMs.
  it('is not fooled by a digital-silence first frame before room tone', () => {
    const { events } = run(synth([zeros(20), { ms: 2000, db: -48 }, word(500), { ms: 1500, db: -48 }]))
    expect(events.map(e => e.speaking)).toEqual([true, false])
    expect(events[0].tMs).toBeGreaterThanOrEqual(1000 + 2000)
  })

  it('is not fooled on the G2 floor either (-40 dBFS after a silent first frame)', () => {
    const { events } = run(synth([zeros(20), quiet(1500), word(500), quiet(1500)]))
    expect(events.map(e => e.speaking)).toEqual([true, false])
  })

  it('recovers from a false onset: steady noise stops counting as speech within the floor window', () => {
    const { events } = run(synth([quiet(500), { ms: 4000, db: -20 }, quiet(500)]))
    expect(events.map(e => e.speaking)).toEqual([true, false])
    expect(events[1].tMs - events[0].tMs).toBeLessThan(3600) // floorWindowMs 3000 + hang 300
  })

  it('never reports speech during the warm-up frames', () => {
    const { events } = run(synth([word(150), quiet(1500)]))
    expect(events).toEqual([])
  })

  it('reports speechDb near the burst level (T-316)', () => {
    const { vad } = run(synth([quiet(500), word(500, -15), quiet(1000)]))
    expect(vad.speechDb).toBeGreaterThanOrEqual(-16)
    expect(vad.speechDb).toBeLessThanOrEqual(-14)
  })

  it('power-averages speechDb across frames: a mixed-level burst lands under its peak', () => {
    // 250 ms at -10 dB + 250 ms at -20 dB → power mean ≈ -12.6, peak ≈ -10
    const { vad } = run(synth([quiet(500), word(250, -10), word(250, -20), quiet(1000)]))
    expect(vad.speechDb).toBeGreaterThanOrEqual(-15)
    expect(vad.speechDb).toBeLessThanOrEqual(-12)
    expect(vad.speechDb).toBeLessThan(vad.peakDb)
  })

  it('keeps speechDb at -120 when nothing was confirmed as speech', () => {
    expect(run(synth([quiet(3000)])).vad.speechDb).toBe(-120)
    // a click under the onset time is never confirmed, so it never counts
    expect(run(synth([quiet(500), word(40), quiet(800)])).vad.speechDb).toBe(-120)
  })
})
