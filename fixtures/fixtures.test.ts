import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { PredictRequest, WordEntry } from '../src/core/types'

const categories = ['object', 'food', 'person', 'place', 'medication', 'other']
const shapes = [
  'clean-stall', 'filler-stall', 'near-synonym-1', 'near-synonym-2',
  'known-name', 'not-in-bank', 'circumlocution', 'near-miss-sound',
]
const load = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()
function object(value: unknown): asserts value is Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value))
}
function string(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.trim().length > 0)
}
function number(value: unknown): asserts value is number {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= 0)
}
function strings(value: unknown): asserts value is string[] {
  assert(Array.isArray(value) && value.length > 0)
  value.forEach(string)
}
function word(value: unknown): asserts value is WordEntry {
  object(value)
  string(value.id)
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id))
  string(value.word)
  assert(categories.includes(value.category as string))
  strings(value.frames)
  assert.equal(value.frames.length, 2)
  for (const frame of value.frames) {
    assert.equal(frame.match(/____/g)?.length, 1)
    assert(frame.length <= 55)
    assert(!frame.includes('_____'))
  }
  strings(value.tags)
  assert(value.tags.length >= 2 && value.tags.length <= 4)
  assert(value.tags.every(tag => tag === tag.toLowerCase()))
  if (value.firstSound !== undefined) string(value.firstSound)
  if (value.imageKey !== undefined) string(value.imageKey)
}
const rawBank = load('../src/content/words.json')
assert(Array.isArray(rawBank))
const bank: WordEntry[] = rawBank.map(entry => { word(entry); return entry })
const inBank = (target: string) => bank.some(entry => entry.word.toLowerCase() === target.toLowerCase())

interface EvalCase extends Omit<PredictRequest, 'bank'> {
  id: string
  shape: string
  intendedWord: string
  acceptable: string[]
  inBank: boolean
}
function evalCase(value: unknown): asserts value is EvalCase {
  object(value)
  string(value.id)
  assert(shapes.includes(value.shape as string))
  string(value.transcriptTail)
  string(value.stalledAfter)
  const count = value.transcriptTail.split(/\s+/).length
  assert(count >= 10 && count <= 40)
  assert(value.stalledAfter.split(/\s+/).length <= 6)
  assert(normalize(value.transcriptTail).endsWith(normalize(value.stalledAfter)))
  assert.equal(value.n, 3)
  assert(!('bank' in value))
  string(value.intendedWord)
  strings(value.acceptable)
  assert(value.acceptable.some(target => target.toLowerCase() === (value.intendedWord as string).toLowerCase()))
  assert.equal(value.inBank, inBank(value.intendedWord))
  if (value.place !== undefined) {
    object(value.place)
    assert(typeof value.place.lat === 'number' && Number.isFinite(value.place.lat) && Math.abs(value.place.lat) <= 90)
    assert(typeof value.place.lon === 'number' && Number.isFinite(value.place.lon) && Math.abs(value.place.lon) <= 180)
    if (value.place.label !== undefined) string(value.place.label)
  }
}

describe('word bank', () => {
  it('has 30 everyday entries and 8 explicitly marked fictional/sample entries', () => {
    expect(bank).toHaveLength(38)
    expect(new Set(bank.map(entry => entry.id)).size).toBe(38)
    expect(new Set(bank.map(entry => entry.word.toLowerCase())).size).toBe(38)
    const everyday = bank.filter(entry => !entry.tags.includes('sample'))
    expect(everyday.filter(entry => entry.category === 'object')).toHaveLength(12)
    expect(everyday.filter(entry => entry.category === 'food')).toHaveLength(10)
    expect(everyday.filter(entry => entry.category === 'place')).toHaveLength(8)
    const personal = bank.filter(entry => entry.tags.includes('sample'))
    expect(personal).toHaveLength(8)
    expect(personal.every(entry => entry.id.startsWith('p-'))).toBe(true)
    expect(personal.filter(entry => entry.category === 'person')).toHaveLength(3)
    expect(personal.filter(entry => entry.category === 'medication')).toHaveLength(2)
    expect(personal.filter(entry => entry.category === 'place')).toHaveLength(2)
    expect(personal.filter(entry => entry.category === 'other')).toHaveLength(1)
    expect(bank.every(entry => entry.imageKey === undefined)).toBe(true)
  })
  it('rejects invalid categories, duplicate blanks, and overflowing frames', () => {
    expect(() => word({ ...bank[0], category: 'invalid' })).toThrow()
    expect(() => word({ ...bank[0], frames: ['____ and ____', 'One ____.'] })).toThrow()
    expect(() => word({ ...bank[0], frames: ['x'.repeat(56) + '____', 'One ____.'] })).toThrow()
  })
})

const conversationDir = new URL('./conversations/', import.meta.url)
const filenames = readdirSync(conversationDir).filter(name => name.endsWith('.json')).sort()
describe('conversations', () => {
  it('covers all eight required shapes', () => {
    expect(filenames.length).toBeGreaterThanOrEqual(11)
    for (const shape of [...shapes, 'no-stall']) expect(filenames).toContain(`${shape}.json`)
  })
  it.each(filenames)('%s has valid events, stalls and negative pauses', filename => {
    const fixture = load(`./conversations/${filename}`)
    object(fixture)
    expect(fixture.id).toBe(filename.replace(/\.json$/, ''))
    string(fixture.description)
    assert(Array.isArray(fixture.events) && fixture.events.length > 0)
    const events: Record<string, unknown>[] = []
    let lastTime = -1
    for (const event of fixture.events) {
      object(event)
      number(event.tMs)
      assert(event.tMs >= lastTime)
      lastTime = event.tMs
      if (event.type === 'speech') {
        assert.equal(typeof event.speaking, 'boolean')
      } else {
        assert.equal(event.type, 'transcript')
        string(event.text)
        assert.equal(typeof event.isFinal, 'boolean')
        number(event.tStartMs)
        assert(event.tStartMs <= event.tMs)
        assert(!('tEndMs' in event)) // Replayer derives this from tMs.
      }
      events.push(event)
    }
    assert(lastTime >= 20000 && lastTime <= 90000)
    assert(events.some(event => event.type === 'transcript' && event.isFinal === false))
    assert(events.filter(event => event.type === 'transcript' && /[.!?]$/.test(String(event.text))).length >= 2)
    assert(Array.isArray(fixture.stalls))
    for (const stall of fixture.stalls) {
      object(stall)
      number(stall.tMs)
      string(stall.stalledAfter)
      string(stall.intendedWord)
      strings(stall.expectedTop3)
      assert(stall.stalledAfter.split(/\s+/).length <= 6)
      const preceding = events.filter(event => Number(event.tMs) <= Number(stall.tMs))
      const final = preceding.findLast(event => event.type === 'transcript' && event.isFinal === true)
      assert(final)
      assert(normalize(String(final.text)).endsWith(normalize(stall.stalledAfter)))
      const speech = preceding.findLast(event => event.type === 'speech')
      assert(speech && speech.speaking === false)
      const nextSpeech = events.find(event => Number(event.tMs) > Number(stall.tMs) && event.type === 'speech' && event.speaking)
      assert(nextSpeech)
      const silentMs = Number(nextSpeech.tMs) - Number(speech.tMs)
      assert(silentMs >= 2000 && silentMs <= 4000)
      // Ground truth marks silence onset. The detector chooses its own delay.
      assert.equal(stall.tMs, speech.tMs)
      assert(Number(final.tMs) <= Number(stall.tMs))
      expect(stall.inBank).toBe(inBank(stall.intendedWord))
      assert(stall.expectedTop3.some(target => target.toLowerCase() === String(stall.intendedWord).toLowerCase()))
    }
  })
  it('varies timing and turn counts, with overlapping normal/stall pauses', () => {
    const fixtures = filenames.map(filename => {
      const fixture = load(`./conversations/${filename}`)
      object(fixture)
      return fixture
    })
    const durations = new Set<number>()
    const counts = new Set<number>()
    const timelines = new Set<string>()
    const normalPauses: number[] = []
    const stallPauses: number[] = []
    let multiStall = 0
    let noStall = 0
    for (const fixture of fixtures) {
      assert(Array.isArray(fixture.events) && Array.isArray(fixture.stalls))
      const events = fixture.events as Array<Record<string, unknown>>
      const stalls = fixture.stalls as Array<Record<string, unknown>>
      const starts = new Set(stalls.map(stall => stall.tMs))
      durations.add(Number(events.at(-1)?.tMs))
      counts.add(events.length)
      timelines.add(events.map(event => event.tMs).join(','))
      if (stalls.length > 1) multiStall++
      if (stalls.length === 0) noStall++
      for (const [i, event] of events.entries()) {
        if (event.type !== 'speech' || event.speaking !== false) continue
        const nextSpeech = events.slice(i + 1).find(next => next.type === 'speech' && next.speaking)
        if (!nextSpeech) continue
        const pause = Number(nextSpeech.tMs) - Number(event.tMs)
        const pauses = starts.has(event.tMs) ? stallPauses : normalPauses
        pauses.push(pause)
      }
    }
    expect(durations.size).toBeGreaterThanOrEqual(8)
    expect(counts.size).toBeGreaterThanOrEqual(4)
    expect(timelines.size).toBe(filenames.length)
    expect(multiStall).toBeGreaterThanOrEqual(2)
    expect(noStall).toBeGreaterThanOrEqual(1)
    expect(new Set(stallPauses).size).toBeGreaterThanOrEqual(5)
    expect(Math.max(...normalPauses)).toBeGreaterThan(Math.min(...stallPauses))
    // Exhaust every threshold boundary, in either direction. Duration alone
    // must never classify every stall and every ordinary pause correctly.
    const durationsToCheck = [...normalPauses, ...stallPauses]
    const thresholds = [0, ...durationsToCheck, ...durationsToCheck.map(ms => ms + 0.5), Infinity]
    for (const threshold of thresholds) {
      for (const predictStall of [(ms: number) => ms >= threshold, (ms: number) => ms < threshold]) {
        const errors = normalPauses.filter(predictStall).length + stallPauses.filter(ms => !predictStall(ms)).length
        expect(errors).toBeGreaterThan(0)
      }
    }
    expect(Math.min(...durations)).toBeLessThanOrEqual(30000)
    expect(Math.max(...durations)).toBeGreaterThanOrEqual(80000)
  })
})

describe('predictor evaluation', () => {
  it('validates 31 requests with balanced shapes and five out-of-bank targets', () => {
    const data = load('./predictor-eval.json')
    object(data)
    expect(data.version).toBe(1)
    assert(Array.isArray(data.cases))
    const cases = data.cases.map(value => { evalCase(value); return value })
    expect(cases).toHaveLength(31)
    expect(new Set(cases.map(value => value.id)).size).toBe(31)
    for (const shape of shapes.slice(0, 6)) {
      expect(cases.filter(value => value.shape === shape).length).toBeGreaterThanOrEqual(3)
    }
    for (const shape of shapes) expect(cases.some(value => value.shape === shape)).toBe(true)
    expect(cases.filter(value => !value.inBank)).toHaveLength(5)
    expect(cases.filter(value => value.place)).toHaveLength(3)
    // Actual PredictRequests are built without changing the fixture format.
    const requests: PredictRequest[] = cases.map(value => ({
      transcriptTail: value.transcriptTail, stalledAfter: value.stalledAfter,
      bank, n: value.n, ...(value.place ? { place: value.place } : {}),
    }))
    expect(requests.every(request => request.bank === bank)).toBe(true)
  })
})
