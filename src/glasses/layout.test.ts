import { measureTextWrap } from '@evenrealities/pretext'
import { describe, expect, it } from 'vitest'
import type { Screen, WordEntry } from '../core/types'
import words from '../content/words.json'
import { MAX_CONTENT, SCREEN_H, SCREEN_W, lineCount, layoutScreen, pageSignature, spaceLetters, type PageSpec } from './layout'

const items = [
  { word: 'cup', confidence: 0.9, source: 'bank' as const, imageKey: 'cup', mouthKey: 'open' },
  { word: 'mug', confidence: 0.5, source: 'bank' as const },
]

const screens: Screen[] = [
  { kind: 'blank' },
  { kind: 'prompt', sentence: 'You drink from a ____.' },
  { kind: 'cue', level: 1, word: 'cup', imageKey: 'cup', sentence: 'You drink from a ____.' },
  { kind: 'cue', level: 1, word: 'cup' },
  { kind: 'cue', level: 2, word: 'cup', masked: 'c_p' },
  { kind: 'cue', level: 2, word: 'cup' },
  { kind: 'cue', level: 3, word: 'cup' },
  { kind: 'feedback', ok: true, word: 'cup' },
  { kind: 'feedback', ok: false, word: 'cup' },
  { kind: 'candidates', items, index: 0, level: 1 },
  { kind: 'candidates', items, index: 1, level: 1 },
  { kind: 'candidates', items, index: 0, level: 2 },
  { kind: 'candidates', items, index: 0, level: 3 },
  { kind: 'candidates', items: [], index: 0, level: 1 },
  { kind: 'menu', title: 'Nudge', items: ['Step 1  Practice', 'Step 2  Assist'], index: 1 },
  { kind: 'menu', title: 'Long', items: Array.from({ length: 20 }, (_, i) => `Item ${i}`), index: 15 },
  { kind: 'status', text: 'step1 not built yet' },
  { kind: 'status', text: 'Microphone blocked. '.repeat(30) },
]

function allContent(page: PageSpec) { return page.texts.map(t => t.content).join('\n') }

describe('layoutScreen container rules', () => {
  for (const images of [false, true]) {
    for (const screen of screens) {
      it(`${screen.kind} ${JSON.stringify(screen).slice(0, 60)} (images: ${images})`, () => {
        const page = layoutScreen(screen, { images })
        expect(page.texts.filter(t => t.capture)).toHaveLength(1)
        expect(page.texts.length + page.images.length).toBeLessThanOrEqual(12)
        expect(page.texts.length).toBeLessThanOrEqual(8)
        expect(page.images.length).toBeLessThanOrEqual(4)
        const ids = [...page.texts, ...page.images].map(c => c.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const c of [...page.texts, ...page.images]) {
          expect(c.name.length).toBeLessThanOrEqual(16)
          expect(c.x).toBeGreaterThanOrEqual(0)
          expect(c.y).toBeGreaterThanOrEqual(0)
          expect(c.x + c.w).toBeLessThanOrEqual(SCREEN_W)
          expect(c.y + c.h).toBeLessThanOrEqual(SCREEN_H)
        }
        for (const img of page.images) {
          expect(img.w).toBeGreaterThanOrEqual(20); expect(img.w).toBeLessThanOrEqual(288)
          expect(img.h).toBeGreaterThanOrEqual(20); expect(img.h).toBeLessThanOrEqual(144)
        }
        for (const t of page.texts) {
          expect(t.content.length).toBeGreaterThan(0)
          expect(t.content.length).toBeLessThanOrEqual(MAX_CONTENT)
          expect(t.content).not.toMatch(/[✓✔✗✘]/)
        }
      })
    }
  }
})

describe('layoutScreen content', () => {
  it('blank is one full-screen single-space capture container', () => {
    expect(layoutScreen({ kind: 'blank' }).texts).toEqual([
      expect.objectContaining({ x: 0, y: 0, w: 576, h: 288, content: ' ', capture: true }),
    ])
  })

  it('never shows the word before cue level 3', () => {
    const word = 'cupboard'
    for (const images of [false, true]) {
      for (const level of [1, 2] as const) {
        const page = layoutScreen({ kind: 'cue', level, word, imageKey: 'x', masked: 'c______d', sentence: 'Plates go in the ____.' }, { images })
        expect(allContent(page)).not.toContain(word)
      }
      for (const level of [1, 2] as const) {
        const page = layoutScreen({ kind: 'candidates', items: [{ word, confidence: 1, source: 'model' }], index: 0, level }, { images })
        expect(allContent(page)).not.toContain(word)
      }
    }
    expect(allContent(layoutScreen({ kind: 'cue', level: 3, word }))).toBe(word)
  })

  it('spaces letters for level 2 and falls back to a first-letter mask', () => {
    expect(spaceLetters('c_p')).toBe('c _ p')
    expect(allContent(layoutScreen({ kind: 'cue', level: 2, word: 'cup', masked: 'c_p' }))).toBe('c _ p')
    expect(allContent(layoutScreen({ kind: 'cue', level: 2, word: 'cup' }))).toBe('c _ _')
  })

  it('shows a picture slot only when images are wired and a key exists', () => {
    const cue: Screen = { kind: 'cue', level: 1, word: 'cup', imageKey: 'cup', sentence: 'You drink from a ____.' }
    expect(layoutScreen(cue, { images: true }).images).toEqual([expect.objectContaining({ imageKey: 'cup', w: 200, h: 120 })])
    expect(layoutScreen(cue, { images: false }).images).toEqual([])
    const cand = layoutScreen({ kind: 'candidates', items, index: 0, level: 1 }, { images: true })
    expect(cand.images[0].imageKey).toBe('open') // mouthKey wins in Steps 2-3
    expect(allContent(cand)).toContain('1/2')
  })

  it('feedback uses √ / × and words', () => {
    expect(allContent(layoutScreen({ kind: 'feedback', ok: true, word: 'cup' }))).toBe('√ cup\nYes')
    expect(allContent(layoutScreen({ kind: 'feedback', ok: false, word: 'cup' }))).toBe('× cup\nTry again')
  })

  it('marks the menu selection and windows long menus to 8 rows', () => {
    const short = allContent(layoutScreen({ kind: 'menu', title: 'Nudge', items: ['A', 'B'], index: 1 }))
    expect(short).toBe('Nudge\n  A\n> B')
    const long = allContent(layoutScreen({ kind: 'menu', title: 'T', items: Array.from({ length: 20 }, (_, i) => `Item ${i}`), index: 15 })).split('\n')
    expect(long).toHaveLength(9)
    expect(long).toContain('> Item 15')
  })

  it('every text container fits its box without a scrollbar', () => {
    for (const screen of screens) {
      for (const t of layoutScreen(screen, { images: true }).texts) {
        expect(lineCount(t.content, t.w) * 27, `${screen.kind}: ${t.content.slice(0, 40)}`).toBeLessThanOrEqual(t.h)
      }
    }
  })

  it('the longest sentence frame in words.json fits the prompt and cue containers', () => {
    const frames = (words as WordEntry[]).flatMap(w => w.frames)
    const longest = frames.reduce((a, b) => (measureTextWrap(b, 560).lineCount * 1000 + b.length > measureTextWrap(a, 560).lineCount * 1000 + a.length ? b : a))
    for (const screen of [
      { kind: 'prompt', sentence: longest },
      { kind: 'cue', level: 1, word: 'x', imageKey: 'x', sentence: longest },
    ] as Screen[]) {
      for (const t of layoutScreen(screen, { images: true }).texts) {
        expect(lineCount(t.content, t.w) * 27, `${screen.kind}: ${longest}`).toBeLessThanOrEqual(t.h)
      }
    }
  })

  it('pages that differ only in text share a signature', () => {
    const a = layoutScreen({ kind: 'menu', title: 'Nudge', items: ['A', 'B'], index: 0 })
    const b = layoutScreen({ kind: 'menu', title: 'Nudge', items: ['A', 'B'], index: 1 })
    expect(pageSignature(a)).toBe(pageSignature(b))
    expect(pageSignature(a)).not.toBe(pageSignature(layoutScreen({ kind: 'blank' })))
  })
})
