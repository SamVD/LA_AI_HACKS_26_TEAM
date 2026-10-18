import type { Screen } from '../../core/types'
import { glassesCanvas } from './tokens'

const W = glassesCanvas.width
const H = glassesCanvas.height
const G = glassesCanvas.phosphor
const GD = glassesCanvas.phosphorDim
const LH = glassesCanvas.lineHeightPx
const FONT = LH

export type LayoutSketchId =
  | 'blank'
  | 'prompt'
  | 'cue-1'
  | 'cue-2'
  | 'cue-3'
  | 'feedback'
  | 'candidates-1'
  | 'candidates-3'
  | 'menu'
  | 'status'

export const LAYOUT_SKETCH_IDS: LayoutSketchId[] = [
  'blank',
  'prompt',
  'cue-1',
  'cue-2',
  'cue-3',
  'feedback',
  'candidates-1',
  'candidates-3',
  'menu',
  'status',
]

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function containerRect(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  eventCapture: boolean,
): string {
  const dash = eventCapture ? ' stroke-dasharray="8 5"' : ''
  const stroke = eventCapture ? G : GD
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke}" stroke-width="1.5"${dash}/>
  <text x="${x + 6}" y="${y + 18}" fill="${GD}" font-family="monospace" font-size="14">${esc(label)}${eventCapture ? ' · evt' : ''}</text>`
}

function g2Lines(x: number, startY: number, lines: string[]): string {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${startY + i * LH}" fill="${G}" font-family="monospace" font-size="${FONT}" dominant-baseline="hanging">${esc(line)}</text>`,
    )
    .join('\n')
}

function wrapG2(text: string, maxChars = 60): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

/** Wireframe SVG for a layout at native G2 resolution (T-101 reference). */
export function renderLayoutSketch(id: LayoutSketchId): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<rect width="${W}" height="${H}" fill="${glassesCanvas.background}"/>`,
    `<text x="8" y="16" fill="${GD}" font-family="monospace" font-size="14">${esc(id)} · ${FONT}px lines · left-aligned</text>`,
  ]

  switch (id) {
    case 'blank':
      parts.push(
        containerRect(0, 0, W, H, 'text (space)', true),
        g2Lines(16, H - LH - 8, ['(no visible glyphs)']),
      )
      break

    case 'prompt': {
      const sentence = 'You drink from a ____.'
      parts.push(containerRect(8, 99, 560, 81, 'text prompt', true))
      parts.push(g2Lines(16, 108, [sentence]))
      break
    }

    case 'cue-1':
      parts.push(containerRect(16, 54, 200, 120, 'image cup', false))
      parts.push(containerRect(232, 54, 328, 162, 'text cues', true))
      parts.push(g2Lines(16, 27, ['You drink from a ____.']))
      parts.push(g2Lines(240, 72, ['(picture)', 'cup']))
      break

    case 'cue-2':
      parts.push(containerRect(8, 108, 560, 81, 'text masked', true))
      parts.push(g2Lines(16, 117, ['c _ p']))
      break

    case 'cue-3':
      parts.push(containerRect(8, 108, 560, 81, 'text word', true))
      parts.push(g2Lines(16, 117, ['cup']))
      break

    case 'feedback':
      parts.push(containerRect(8, 99, 560, 108, 'text feedback', true))
      parts.push(g2Lines(16, 108, ['√ cup', 'Yes']))
      break

    case 'candidates-1':
      parts.push(containerRect(16, 54, 180, 108, 'image mouth', false))
      parts.push(containerRect(208, 54, 360, 135, 'text candidate', true))
      parts.push(g2Lines(216, 72, ['cup', '1/3 · L1']))
      parts.push(g2Lines(16, 216, ['swipe · tap']))
      break

    case 'candidates-3':
      parts.push(containerRect(8, 99, 560, 108, 'text word', true))
      parts.push(g2Lines(16, 108, ['cup', '3/3 · L3']))
      break

    case 'menu': {
      parts.push(containerRect(8, 40, 560, 240, 'list menu', true))
      const items = ['> Step 1 — Say the word', '  Step 2 — Help', '  Word bank']
      parts.push(g2Lines(16, 52, items))
      parts.push(
        `<text x="16" y="232" fill="${GD}" font-family="monospace" font-size="14">6 rows visible (40px items, firmware scroll)</text>`,
      )
      break
    }

    case 'status': {
      const msg =
        'Microphone is off. Open Settings on your phone to allow mic access.'
      parts.push(containerRect(8, 54, 560, 189, 'text status', true))
      parts.push(g2Lines(16, 72, wrapG2(msg, 60)))
      break
    }

    default:
      break
  }

  parts.push('</svg>')
  return parts.join('\n')
}

/** Map a Screen to the default layout sketch for that kind. */
export function renderGlassesSketch(screen: Screen): string {
  switch (screen.kind) {
    case 'blank':
      return renderLayoutSketch('blank')
    case 'prompt':
      return renderLayoutSketch('prompt')
    case 'cue':
      if (screen.level === 1) return renderLayoutSketch('cue-1')
      if (screen.level === 3) return renderLayoutSketch('cue-3')
      return renderLayoutSketch('cue-2')
    case 'feedback':
      return renderLayoutSketch('feedback')
    case 'candidates':
      return screen.level >= 3 ? renderLayoutSketch('candidates-3') : renderLayoutSketch('candidates-1')
    case 'menu':
      return renderLayoutSketch('menu')
    case 'status':
      return renderLayoutSketch('status')
    default:
      return renderLayoutSketch('blank')
  }
}
