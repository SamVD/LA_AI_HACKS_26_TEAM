import type { Screen } from '../core/types'
import { glassesCanvas } from './theme/tokens'

const W = glassesCanvas.width
const H = glassesCanvas.height
const G = glassesCanvas.phosphor
const GD = glassesCanvas.phosphorDim
const LH = glassesCanvas.lineHeightPx

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function lines(x: number, y: number, rows: string[]): string {
  return rows
    .map(
      (row, i) =>
        `<text x="${x}" y="${y + i * LH}" fill="${G}" font-family="monospace" font-size="${LH}" dominant-baseline="hanging">${esc(row)}</text>`,
    )
    .join('\n')
}

/** Readable 576×288 preview of a `Screen` (green on black). */
export function renderScreenPreview(screen: Screen): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="G2 preview ${screen.kind}">`,
    `<rect width="${W}" height="${H}" fill="${glassesCanvas.background}"/>`,
  ]

  switch (screen.kind) {
    case 'blank':
      parts.push(
        lines(16, 120, [' ']),
        `<text x="16" y="${H - 32}" fill="${GD}" font-family="monospace" font-size="14">quiet — listening</text>`,
      )
      break
    case 'prompt':
      parts.push(lines(16, 108, [screen.sentence]))
      break
    case 'cue': {
      const rows: string[] = []
      if (screen.sentence) rows.push(screen.sentence)
      if (screen.level === 1 && screen.imageKey) rows.push(`(picture: ${screen.imageKey})`)
      rows.push(screen.level === 2 && screen.masked ? screen.masked : screen.word)
      rows.push(`cue level ${screen.level}`)
      parts.push(lines(16, 54, rows))
      break
    }
    case 'feedback':
      parts.push(
        lines(16, 108, [
          `${screen.ok ? '√' : '×'} ${screen.word}`,
          screen.ok ? 'Yes' : 'Try again',
        ]),
      )
      break
    case 'candidates': {
      const item = screen.items[screen.index]
      const rows = [
        item ? item.word : '—',
        `${screen.index + 1} of ${screen.items.length}`,
        `level ${screen.level}`,
      ]
      if (screen.level === 1 && item?.imageKey) rows.unshift(`(picture: ${item.imageKey})`)
      parts.push(lines(16, 72, rows))
      break
    }
    case 'menu':
      parts.push(
        lines(16, 40, [
          screen.title,
          ...screen.items.map((item, i) => (i === screen.index ? `> ${item}` : `  ${item}`)),
        ]),
      )
      break
    case 'status':
      parts.push(lines(16, 72, wrapLines(screen.text, 58)))
      break
    default:
      break
  }

  parts.push('</svg>')
  return parts.join('\n')
}

function wrapLines(text: string, maxChars: number): string[] {
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
