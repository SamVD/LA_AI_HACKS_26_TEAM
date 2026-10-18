import type { Screen } from '../../core/types'
import { glassesCanvas } from './tokens'

const W = glassesCanvas.width
const H = glassesCanvas.height
const G = glassesCanvas.phosphor
const GD = glassesCanvas.phosphorDim

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function box(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  dashed = false,
): string {
  const dash = dashed ? ' stroke-dasharray="6 4"' : ''
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${GD}" stroke-width="1"${dash}/>
  <text x="${x + 8}" y="${y + 22}" fill="${G}" font-family="monospace" font-size="14">${esc(label)}</text>`
}

/** Wireframe SVG for a Screen at native G2 resolution (preview / T-006 sketches). */
export function renderGlassesSketch(screen: Screen): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<rect width="${W}" height="${H}" fill="${glassesCanvas.background}"/>`,
  ]

  switch (screen.kind) {
    case 'blank':
      parts.push(
        box(0, 0, W, H, 'event capture (invisible)', true),
        `<text x="16" y="${H - 16}" fill="${GD}" font-family="monospace" font-size="12">blank — touchpad active, no pixels</text>`,
      )
      break
    case 'prompt':
      parts.push(
        box(8, 96, W - 16, 96, 'text container'),
        `<text x="24" y="140" fill="${G}" font-family="monospace" font-size="18">${esc(screen.sentence)}</text>`,
      )
      break
    case 'cue': {
      const imgW = 200
      const imgH = 120
      parts.push(
        box(16, 72, imgW, imgH, screen.imageKey ? `image ≤288×144` : 'visual cue'),
        box(240, 72, W - 256, 144, 'cue text'),
        `<text x="256" y="120" fill="${G}" font-family="monospace" font-size="16">L${screen.level} · ${esc(screen.masked ?? screen.word)}</text>`,
      )
      if (screen.sentence) {
        parts.push(
          `<text x="24" y="56" fill="${GD}" font-family="monospace" font-size="14">${esc(screen.sentence)}</text>`,
        )
      }
      break
    }
    case 'feedback':
      parts.push(
        box(8, 80, W - 16, 128, 'feedback'),
        `<text x="24" y="130" fill="${G}" font-family="monospace" font-size="28">${screen.ok ? '√' : '×'} ${esc(screen.word)}</text>`,
        `<text x="24" y="168" fill="${GD}" font-family="monospace" font-size="14">${screen.ok ? 'Yes' : 'Try again'}</text>`,
      )
      break
    case 'candidates': {
      const item = screen.items[screen.index]
      parts.push(
        box(16, 64, 180, 108, 'mouth / picture'),
        box(210, 64, W - 226, 120, 'word + ladder'),
        `<text x="226" y="110" fill="${G}" font-family="monospace" font-size="20">${esc(item?.word ?? '—')}</text>`,
        `<text x="226" y="140" fill="${GD}" font-family="monospace" font-size="14">L${screen.level} · ${screen.index + 1}/${screen.items.length}</text>`,
        `<text x="24" y="200" fill="${GD}" font-family="monospace" font-size="12">swipe: cycle · tap: escalate cue</text>`,
      )
      break
    }
    case 'menu':
      parts.push(box(8, 40, W - 16, 40, 'title'))
      parts.push(
        `<text x="24" y="68" fill="${G}" font-family="monospace" font-size="16">${esc(screen.title)}</text>`,
      )
      screen.items.forEach((item, i) => {
        const y = 88 + i * 44
        const active = i === screen.index
        parts.push(
          box(8, y, W - 16, 40, active ? '● selected' : 'item', !active),
          `<text x="24" y="${y + 26}" fill="${active ? G : GD}" font-family="monospace" font-size="15">${esc(item)}</text>`,
        )
      })
      break
    case 'status':
      parts.push(
        box(8, 72, W - 16, 144, 'status message'),
        `<text x="24" y="110" fill="${G}" font-family="monospace" font-size="16">${esc(screen.text.slice(0, 48))}</text>`,
        `<text x="24" y="138" fill="${G}" font-family="monospace" font-size="16">${esc(screen.text.slice(48, 96))}</text>`,
      )
      break
    default:
      break
  }

  parts.push('</svg>')
  return parts.join('\n')
}
