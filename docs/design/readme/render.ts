// Renders the README glasses images from the real layout code (src/glasses/layout.ts),
// with G2 font widths from @evenrealities/pretext. Run: npx vite-node docs/design/readme/render.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { getTextWidth } from '@evenrealities/pretext'
import { layoutScreen, LINE_H, SCREEN_W, SCREEN_H } from '../../../src/glasses/layout'
import type { Screen } from '../../../src/core/types'

const ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '')
const OUT = `${ROOT}/docs/design/readme`
const G = '#5cff8a'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Greedy wrap with the G2 font metrics (pretext), like the firmware does.
function wrap(line: string, w: number): string[] {
  const words = line.split(' '); const out: string[] = []; let cur = ''
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word
    if (cur && getTextWidth(next) > w) { out.push(cur); cur = word } else cur = next
  }
  out.push(cur); return out
}

function svg(screen: Screen): string {
  const page = layoutScreen(screen, { images: true })
  const parts: string[] = []
  for (const t of page.texts) {
    const lines = t.content.split('\n').flatMap(l => wrap(l, t.w))
    lines.forEach((l, i) => {
      if (!l.trim()) return
      parts.push(`<text x="${t.x}" y="${t.y + i * LINE_H + 21}" fill="${G}" font-family="Helvetica, Arial, sans-serif" font-size="22" textLength="${getTextWidth(l)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${esc(l)}</text>`)
    })
  }
  for (const im of page.images) {
    const raw = readFileSync(`${ROOT}/src/content/assets/pictures/${im.imageKey}.svg`, 'utf8').replace(/#fff(fff)?/gi, G)
    const inner = raw.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    const vb = /viewBox="([^"]+)"/.exec(raw)?.[1] ?? '0 0 24 24'
    const s = Math.min(im.w, im.h) - 16
    parts.push(`<svg x="${im.x + (im.w - s) / 2}" y="${im.y + (im.h - s) / 2}" width="${s}" height="${s}" viewBox="${vb}" fill="none" stroke="${G}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCREEN_W} ${SCREEN_H}" width="${SCREEN_W}" height="${SCREEN_H}"><rect width="100%" height="100%" rx="14" fill="#050805"/>${parts.join('')}</svg>\n`
}

const sunny = [{ word: 'sunny' }, { word: 'warm' }, { word: 'nice' }] as never
const screens: Record<string, Screen> = {
  'launcher': { kind: 'menu', title: 'Nudge', items: ['Practice', 'Conversation'], index: 1 },
  'conversation-blank': { kind: 'blank' },
  'conversation-L1': { kind: 'candidates', items: sunny, index: 0, level: 1 },
  'conversation-L2': { kind: 'candidates', items: sunny, index: 0, level: 2 },
  'conversation-L3': { kind: 'candidates', items: sunny, index: 0, level: 3 },
  'practice-prompt': { kind: 'prompt', sentence: 'I drink tea from a ____ with a handle.' },
  'practice-L1': { kind: 'cue', level: 1, word: 'cup', sentence: 'I drink tea from a ____ with a handle.' },
  'practice-L2': { kind: 'cue', level: 2, word: 'cup', imageKey: 'cup', sentence: 'I drink tea from a ____ with a handle.' },
  'practice-answer': { kind: 'cue', level: 3, word: 'cup' },
}
for (const [name, s] of Object.entries(screens)) writeFileSync(`${OUT}/${name}.svg`, svg(s))
console.log('wrote', Object.keys(screens).join(' '))
