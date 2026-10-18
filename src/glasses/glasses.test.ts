import { describe, expect, it, vi } from 'vitest'
import type { GreyImage, Mode, ModeContext, Screen } from '../core/types'
import { MemoryStore, MockPredictor, MockStt } from '../mocks'
import { startApp } from './app'
import { toIntent, toSystemSignal } from './input'
import { CueLadder, maskWord } from './ladder'
import { createBridgeKeyValue } from './storage'
import { createFakeHub, flush } from './testing'
import { createGlassesUI } from './ui'
import { createSerialQueue } from './bridge'

describe('touchpad mapping', () => {
  const table: Array<[string, Parameters<typeof toIntent>[0], ReturnType<typeof toIntent>]> = [
    ['click (protobuf-omitted 0)', { sysEvent: {} }, 'SELECT'],
    ['click (explicit 0)', { sysEvent: { eventType: 0 } }, 'SELECT'],
    ['double-click', { sysEvent: { eventType: 3 } }, 'BACK'],
    ['double-click on text envelope', { textEvent: { eventType: 3 } }, 'BACK'],
    ['swipe up', { textEvent: { eventType: 1 } }, 'PREV'],
    ['swipe down', { textEvent: { eventType: 2 } }, 'NEXT'],
    ['audio frame', { audioEvent: {} }, null],
    ['list event', { listEvent: {} }, null],
    ['IMU sample', { sysEvent: { eventType: 8, imuData: { x: 0 } } }, null],
    ['foreground exit', { sysEvent: { eventType: 5 } }, null],
    ['text envelope without type', { textEvent: {} }, null],
  ]
  for (const [name, event, intent] of table) it(name, () => expect(toIntent(event)).toBe(intent))

  it('maps lifecycle events', () => {
    expect(toSystemSignal({ sysEvent: { eventType: 4 } })).toBe('foreground-enter')
    expect(toSystemSignal({ sysEvent: { eventType: 5 } })).toBe('foreground-exit')
    expect(toSystemSignal({ sysEvent: { eventType: 6 } })).toBe('exit')
    expect(toSystemSignal({ sysEvent: { eventType: 7 } })).toBe('exit')
    expect(toSystemSignal({ sysEvent: {} })).toBeNull()
  })
})

describe('GlassesUI rendering', () => {
  it('creates the startup page once, upgrades text in place, rebuilds on layout change', async () => {
    const fake = createFakeHub()
    const ui = createGlassesUI(fake.hub)
    await ui.show({ kind: 'menu', title: 'Nudge', items: ['A', 'B'], index: 0 })
    await ui.show({ kind: 'menu', title: 'Nudge', items: ['A', 'B'], index: 1 })
    await ui.show({ kind: 'menu', title: 'Nudge', items: ['A', 'B'], index: 1 })
    await ui.show({ kind: 'blank' })
    expect(fake.calls.map(c => c.op)).toEqual(['create', 'upgrade', 'rebuild'])
    expect(fake.calls.filter(c => c.op === 'create')).toHaveLength(1)
  })

  it('refresh() redraws the last screen with a rebuild', async () => {
    const fake = createFakeHub()
    const ui = createGlassesUI(fake.hub)
    await ui.show({ kind: 'status', text: 'hi' })
    await ui.refresh()
    expect(fake.calls.map(c => c.op)).toEqual(['create', 'rebuild'])
  })

  it('sends pictures after the text and skips a stale one', async () => {
    const fake = createFakeHub()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const images = vi.fn(async (key: string, width: number, height: number): Promise<GreyImage> => {
      if (key === 'slow') await gate
      return { key, width, height, png: new Uint8Array(4) }
    })
    const ui = createGlassesUI(fake.hub, { images })
    await ui.show({ kind: 'cue', level: 1, word: 'cup', imageKey: 'slow', sentence: 'You drink from a ____.' })
    await ui.show({ kind: 'cue', level: 1, word: 'mug', imageKey: 'fast', sentence: 'Coffee goes in a ____.' })
    release()
    await flush(); await flush()
    const sent = fake.calls.filter(c => c.op === 'image')
    expect(sent).toHaveLength(1)
    expect(images).toHaveBeenCalledWith('slow', 200, 120)
  })

  it('renders text-only when the image source has nothing', async () => {
    const fake = createFakeHub()
    const ui = createGlassesUI(fake.hub, { images: async () => null })
    await ui.show({ kind: 'cue', level: 1, word: 'cup', imageKey: 'none', sentence: 'x ____' })
    await flush()
    expect(fake.calls.filter(c => c.op === 'image')).toHaveLength(0)
  })
})

describe('serial queue', () => {
  it('times out a hung call, logs it and keeps going', async () => {
    vi.useFakeTimers()
    const log = vi.fn()
    const run = createSerialQueue(100, log)
    const hung = run('hung', () => new Promise<boolean>(() => {}), false)
    const next = run('next', async () => true, false)
    await vi.advanceTimersByTimeAsync(150)
    await expect(hung).resolves.toBe(false)
    await expect(next).resolves.toBe(true)
    expect(log).toHaveBeenCalledWith('bridge timeout', { name: 'hung', timeoutMs: 100 })
    vi.useRealTimers()
  })
})

function listeningMode(id: 'step1' | 'step2' | 'step3', seen: string[]): Mode {
  let ctx: ModeContext | null = null
  let off = () => {}
  return {
    id,
    title: `Mode ${id}`,
    async enter(c) {
      ctx = c
      off = c.ui.onIntent(i => {
        seen.push(i)
        if (i === 'BACK') ctx?.leave?.()
      })
      await c.ui.show({ kind: 'status', text: `${id} running` })
    },
    async exit() { off() },
  }
}

const stub = (id: 'step1' | 'step2' | 'step3'): Mode => ({
  id, title: id, async enter(c) { await c.ui.show({ kind: 'status', text: `${id} not built yet` }) }, async exit() {},
})

async function boot(modes = { step1: stub('step1'), step2: stub('step2'), step3: stub('step3') }, flags = {}) {
  const fake = createFakeHub()
  const store = new MemoryStore()
  const doc = { visibilityState: 'visible' as DocumentVisibilityState, handlers: [] as Array<() => void>,
    addEventListener(_: string, h: () => void) { this.handlers.push(h) }, removeEventListener() {} }
  const allFlags = { step2Enabled: false, step3Enabled: false, imuEnabled: false, mockServices: true, ...flags }
  const { shell } = await startApp({
    hub: fake.hub, modes, flags: allFlags, store, doc,
    makeContext: ({ ui, leave }) => ({ ui, leave, stt: new MockStt(), predictor: new MockPredictor(), store, now: () => 0, log: () => {}, flags: allFlags }),
  })
  const screens: Screen[] = []
  shell.onScreen(s => screens.push(s))
  const tap = async (event: Parameters<typeof fake.fire>[0]) => { fake.fire(event); await flush(); await flush() }
  return { fake, shell, screens, doc, tap }
}

const CLICK = { sysEvent: {} }
const DOUBLE = { sysEvent: { eventType: 3 } }
const DOWN = { textEvent: { eventType: 2 } }

describe('app shell', () => {
  it('boots to the launcher with only enabled modes', async () => {
    const { fake, shell } = await boot()
    expect(fake.texts()).toEqual(['Nudge\n> Step 1  step1'])
    expect(shell.modes().map(m => m.enabled)).toEqual([true, false, false])
    expect(shell.lastScreen()).toEqual({ kind: 'menu', title: 'Nudge', items: ['Step 1  step1'], index: 0 })
  })

  it('flags reveal Step 2 and 3; NEXT moves the marker', async () => {
    const { fake, tap } = await boot(undefined, { step2Enabled: true, step3Enabled: true })
    await tap(DOWN)
    expect(fake.texts()).toEqual(['Nudge\n  Step 1  step1\n> Step 2  step2\n  Step 3  step3'])
  })

  it('double-click at the launcher opens the exit dialog; inside a stub it returns to the launcher', async () => {
    const { fake, shell, tap } = await boot()
    await tap(CLICK)
    expect(shell.activeMode()).toBe('step1')
    expect(fake.texts()).toEqual(['step1 not built yet'])
    await tap(DOUBLE)
    expect(shell.activeMode()).toBeNull()
    expect(fake.calls.some(c => c.op === 'exit')).toBe(false)
    expect(fake.texts()[0]).toMatch(/^Nudge/)
    await tap(DOUBLE)
    expect(fake.calls.filter(c => c.op === 'exit')).toHaveLength(1)
  })

  it('a listening mode gets intents and leaves through ctx.leave()', async () => {
    const seen: string[] = []
    const { shell, tap, fake } = await boot({ step1: listeningMode('step1', seen), step2: stub('step2'), step3: stub('step3') })
    await tap(CLICK)
    expect(fake.texts()).toEqual(['step1 running'])
    await tap(DOWN); await tap(CLICK); await tap(DOUBLE)
    expect(seen).toEqual(['NEXT', 'SELECT', 'BACK'])
    expect(shell.activeMode()).toBeNull()
    expect(fake.calls.some(c => c.op === 'exit')).toBe(false)
  })

  it('drops screens a mode shows after it has left', async () => {
    let late: ((s: Screen) => Promise<void>) | null = null
    const lingering: Mode = { id: 'step1', title: 'L', async enter(c) { late = c.ui.show; await c.ui.show({ kind: 'status', text: 'on' }) }, async exit() {} }
    const { shell, fake } = await boot({ step1: lingering, step2: stub('step2'), step3: stub('step3') })
    await shell.startMode('step1')
    await shell.leaveMode()
    await late!({ kind: 'status', text: 'too late' })
    expect(fake.texts()[0]).toMatch(/^Nudge/)
  })

  it('mirrors every screen for the phone preview', async () => {
    const { shell, screens } = await boot()
    await shell.startMode('step1')
    expect(screens.map(s => s.kind)).toEqual(['status'])
    await shell.leaveMode()
    expect(screens.map(s => s.kind)).toEqual(['status', 'menu'])
  })

  it('redraws on visibilitychange to visible and cleans up on system exit', async () => {
    const { fake, doc, tap } = await boot()
    const before = fake.calls.length
    doc.visibilityState = 'visible'
    doc.handlers.forEach(h => h())
    await flush(); await flush()
    expect(fake.calls.slice(before).map(c => c.op)).toEqual(['rebuild'])
    await tap({ sysEvent: { eventType: 7 } })
    expect(fake.listenerCount()).toBe(0)
  })
})

describe('cue ladder', () => {
  it('masks words for Step 1', () => {
    expect(maskWord('cup')).toBe('c_p')
    expect(maskWord('milk')).toBe('m__k')
    expect(maskWord('go')).toBe('g_')
  })

  it('escalates 1 → 2 → 3 and stops; reset goes back to 1', () => {
    const ladder = new CueLadder()
    expect(ladder.cue('cup', { imageKey: 'cup', sentence: 'You drink from a ____.' })).toEqual({ kind: 'cue', level: 1, word: 'cup', imageKey: 'cup', sentence: 'You drink from a ____.' })
    expect(ladder.escalate()).toBe(2)
    expect(ladder.cue('cup')).toMatchObject({ level: 2, masked: 'c_p' })
    expect(ladder.escalate()).toBe(3)
    expect(ladder.escalate()).toBe(3)
    expect(ladder.atTop).toBe(true)
    ladder.reset()
    expect(ladder.candidates([], 0)).toEqual({ kind: 'candidates', items: [], index: 0, level: 1 })
  })
})

describe('bridge key-value store', () => {
  it('maps a missing key to null and round-trips values', async () => {
    const fake = createFakeHub()
    const kv = createBridgeKeyValue(fake.hub)
    expect(await kv.get('nope')).toBeNull()
    await kv.set('k', 'v')
    expect(await kv.get('k')).toBe('v')
  })

  it('rejects when the SDK reports a failed write', async () => {
    const kv = createBridgeKeyValue({ getItem: async () => '', setItem: async () => false })
    await expect(kv.set('k', 'v')).rejects.toThrow(/setLocalStorage failed/)
  })
})
