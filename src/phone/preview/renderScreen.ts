import type { Screen } from '../../core/types'
import { glassesCanvas } from '../theme/tokens'

const W = glassesCanvas.width
const H = glassesCanvas.height
const G = glassesCanvas.phosphor
const GD = glassesCanvas.phosphorDim
const LH = glassesCanvas.lineHeightPx

export type RenderScreenOptions = {
  imageUrl?: (key: string) => string | null
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function spacedMasked(masked: string): string {
  return masked.split('_').join(' _ ')
}

function g2Line(x: number, y: number, text: string): string {
  return `<text x="${x}" y="${y}" fill="${G}" font-family="monospace" font-size="${LH}" dominant-baseline="hanging">${esc(text)}</text>`
}

function g2Lines(x: number, startY: number, rows: string[]): string {
  return rows.map((row, i) => g2Line(x, startY + i * LH, row)).join('\n')
}

function imageBox(x: number, y: number, w: number, h: number, key: string, opts?: RenderScreenOptions): string {
  const url = opts?.imageUrl?.(key)
  if (url) {
    return `<image href="${esc(url)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${GD}" stroke-width="1"/>
${g2Line(x + 8, y + 8, key)}`
}

function wrapLines(text: string, maxChars = 60): string[] {
  const words = text.split(/\s+/)
  const out: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      out.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) out.push(line)
  return out.length ? out : [' ']
}

/** 576×288 SVG preview matching glasses layout conventions. */
export function renderScreen(screen: Screen, opts?: RenderScreenOptions): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="G2 ${screen.kind}">`,
    `<rect width="${W}" height="${H}" fill="${glassesCanvas.background}"/>`,
  ]

  switch (screen.kind) {
    case 'blank':
      break
    case 'prompt':
      parts.push(g2Lines(16, 108, [screen.sentence]))
      break
    case 'cue': {
      if (screen.level === 1) {
        const rows: string[] = []
        if (screen.sentence) rows.push(screen.sentence)
        const visualKey = screen.imageKey ?? screen.mouthKey
        if (visualKey) {
          parts.push(imageBox(16, 54, 200, 120, visualKey, opts))
        }
        if (rows.length) parts.push(g2Lines(16, 27, rows))
      } else if (screen.level === 2 && screen.masked) {
        parts.push(g2Lines(16, 117, [spacedMasked(screen.masked)]))
      } else {
        parts.push(g2Lines(16, 117, [screen.word]))
      }
      break
    }
    case 'feedback':
      parts.push(
        g2Lines(16, 108, [
          `${screen.ok ? '√' : '×'} ${screen.word}`,
          screen.ok ? 'Yes' : 'Try again',
        ]),
      )
      break
    case 'candidates': {
      const item = screen.items[screen.index]
      const meta = [`${screen.index + 1}/${screen.items.length}`, `L${screen.level}`]
      if (screen.level === 1 && item) {
        const visualKey = item.mouthKey ?? item.imageKey
        if (visualKey) {
          parts.push(imageBox(16, 54, 180, 108, visualKey, opts))
        }
        parts.push(g2Lines(visualKey ? 208 : 16, 72, meta))
        break
      } else if (screen.level === 2 && item) {
        parts.push(g2Lines(16, 108, [item.word.slice(0, 1), ...meta]))
      } else if (item) {
        parts.push(g2Lines(16, 108, [item.word, ...meta]))
      }
      break
    }
    case 'menu':
      parts.push(
        g2Lines(
          16,
          40,
          [
            screen.title,
            ...screen.items.map((item, i) => (i === screen.index ? `> ${item}` : `  ${item}`)),
          ],
        ),
      )
      break
    case 'status':
      parts.push(g2Lines(16, 72, wrapLines(screen.text)))
      break
    default:
      break
  }

  parts.push('</svg>')
  return parts.join('\n')
}
