// Screen -> container geometry, following docs/design/GLASSES_LAYOUTS.md.
// Pure: no SDK imports, so every rule here is unit-tested in Node.
import { getTextWidth, measureTextWrap, pxTruncate } from '@evenrealities/pretext'
import type { Screen } from '../core/types'
import { revealWord } from './ladder'

export const SCREEN_W = 576
export const SCREEN_H = 288
export const LINE_H = 27
export const MAX_CONTENT = 1000
const MENU_ROWS = 8
// Very narrow text containers lose their position in the simulator (seen with 27 px and 42 px boxes), so centered boxes are at least this wide.
const MIN_TEXT_W = 96

export interface TextSpec {
  kind: 'text'
  id: number
  /** At most 16 characters (firmware limit). */
  name: string
  x: number
  y: number
  w: number
  h: number
  content: string
  capture: boolean
}

export interface ImageSpec {
  kind: 'image'
  id: number
  name: string
  x: number
  y: number
  w: number
  h: number
  imageKey: string
}

export interface PageSpec {
  texts: TextSpec[]
  images: ImageSpec[]
}

export interface LayoutOptions {
  /** False when no ImageSource is wired: picture slots collapse to text-only layouts. */
  images: boolean
}

// Containers use no padding or border, so the inner box is the container box.
function text(name: string, x: number, y: number, w: number, h: number, content: string, capture = true, id = 1): TextSpec {
  const clipped = content.length > MAX_CONTENT ? content.slice(0, MAX_CONTENT) : content
  return { kind: 'text', id, name, x, y, w, h, content: clipped === '' ? ' ' : clipped, capture }
}

function image(name: string, x: number, y: number, w: number, h: number, imageKey: string, id = 2): ImageSpec {
  return { kind: 'image', id, name, x, y, w, h, imageKey }
}

/** Lines `content` wraps to in a box `width` px wide (explicit newlines included). */
export function lineCount(content: string, width: number): number {
  return content.split('\n').reduce((n, line) => n + Math.max(1, measureTextWrap(line, width).lineCount), 0)
}

/**
 * Approximate centering. The firmware is always left-aligned, so a short
 * single-line text gets a narrow container placed in the middle of `box`.
 * Slack keeps rounding in the measurement from forcing a wrap.
 */
function centered(name: string, box: { x: number; y: number; w: number; h: number }, content: string, capture = true, id = 1): TextSpec {
  if (content.includes('\n') || measureTextWrap(content, box.w).lineCount > 1) {
    return text(name, box.x, box.y, box.w, box.h, content, capture, id)
  }
  // Text starts at the container's left edge, so place the container by the
  // text's width and let only the box extend right (to the minimum width).
  const textW = getTextWidth(content)
  const x = Math.max(box.x, Math.min(box.x + Math.floor((box.w - textW) / 2), box.x + box.w - MIN_TEXT_W))
  const width = Math.min(box.x + box.w - x, Math.max(MIN_TEXT_W, textW + 16))
  return text(name, x, box.y, width, box.h, content, capture, id)
}

/**
 * A few short lines, each centered in its own one-line container (the firmware
 * cannot center lines inside one container). The first line captures events.
 * Falls back to one left-aligned block if any line would wrap.
 */
function centeredLines(box: { x: number; y: number; w: number; h: number }, lines: string[]): TextSpec[] {
  if (lines.length * LINE_H > box.h || lines.some(line => measureTextWrap(line, box.w).lineCount > 1)) {
    return [text('main', box.x, box.y, box.w, box.h, lines.join('\n'))]
  }
  return lines.map((line, i) =>
    centered(i === 0 ? 'main' : `line${i + 1}`, { x: box.x, y: box.y + i * LINE_H, w: box.w, h: LINE_H }, line, i === 0, i + 1))
}

/** `c_p` -> `c _ p`: one font size, so letter spacing is the only emphasis. */
export function spaceLetters(masked: string): string {
  return [...masked].join(' ')
}

/** The first letter followed by one `_` per remaining letter, e.g. `cup` -> `c _ _`. */
function firstLetterMask(word: string): string {
  const letters = [...word]
  return spaceLetters(letters[0] + '_'.repeat(Math.max(0, letters.length - 1)))
}

function truncateLines(lines: string[], width: number): string {
  return lines.map(line => pxTruncate(line, width)).join('\n')
}

/** Picture slot plus a text column beside it, or a full-width text block when there is no picture. */
function withPicture(key: string | undefined, opts: LayoutOptions, pic: { x: number; y: number; w: number; h: number }, side: { x: number; y: number; w: number; h: number }, content: string): PageSpec {
  if (!key || !opts.images) {
    return { texts: centeredLines({ x: 8, y: 99, w: 560, h: 108 }, content.split('\n')), images: [] }
  }
  // Image ids start after the text ids, so they stay unique per page.
  return {
    texts: [text('main', side.x, side.y, side.w, side.h, content)],
    images: [image('picture', pic.x, pic.y, pic.w, pic.h, key, 9)],
  }
}

export function layoutScreen(screen: Screen, opts: LayoutOptions = { images: false }): PageSpec {
  switch (screen.kind) {
    case 'blank':
      // Confirmed on the G2 (S-3): a single-space capture container still gets taps and swipes.
      return { texts: [text('blank', 0, 0, SCREEN_W, SCREEN_H, ' ')], images: [] }

    case 'prompt':
      return { texts: [centered('main', { x: 8, y: 99, w: 560, h: 81 }, screen.sentence)], images: [] }

    case 'cue': {
      if (screen.level === 1) {
        // Never `word` before level 3 (cue ladder rule).
        const key = screen.imageKey ?? screen.mouthKey
        return withPicture(key, opts, { x: 16, y: 54, w: 200, h: 120 }, { x: 232, y: 54, w: 328, h: 162 }, screen.sentence ?? ' ')
      }
      const content = screen.level === 2
        ? (screen.masked ? spaceLetters(screen.masked) : firstLetterMask(screen.word))
        : screen.word
      return { texts: [centered('main', { x: 8, y: 108, w: 560, h: 81 }, content)], images: [] }
    }

    case 'feedback': {
      const lines = screen.ok ? [`√ ${screen.word}`, 'Yes'] : [`× ${screen.word}`, 'Try again']
      return { texts: centeredLines({ x: 8, y: 99, w: 560, h: 108 }, lines), images: [] }
    }

    case 'candidates': {
      const item = screen.items[screen.index]
      if (!item) return { texts: [centered('main', { x: 8, y: 108, w: 560, h: 81 }, 'No suggestions')], images: [] }
      // Letters first (CONTRACT_VERSION 3, D18): no picture or mouth shape in Steps 2-3,
      // and the word is only complete at level 3.
      const position = `${screen.index + 1}/${screen.items.length}`
      return { texts: centeredLines({ x: 8, y: 99, w: 560, h: 108 }, [revealWord(item.word, screen.level), position]), images: [] }
    }

    case 'menu': {
      const start = Math.max(0, Math.min(screen.index - Math.floor(MENU_ROWS / 2), screen.items.length - MENU_ROWS))
      const rows = screen.items.slice(start, start + MENU_ROWS)
        .map((item, i) => (start + i === screen.index ? '> ' : '  ') + item)
      return { texts: [text('main', 8, 27, 560, 243, truncateLines([screen.title, ...rows], 560))], images: [] }
    }

    case 'status': {
      // 7 lines fit the standard box; longer text gets the whole screen (10 lines) rather than a scrollbar.
      const lines = lineCount(screen.text, 560)
      return lines <= 7
        ? { texts: [text('main', 8, 54, 560, 189, screen.text)], images: [] }
        : { texts: [text('main', 8, 0, 560, SCREEN_H, screen.text)], images: [] }
    }
  }
}

/**
 * Two pages with the same signature differ only in text content, so the
 * renderer can use the flicker-free textContainerUpgrade instead of a rebuild.
 */
export function pageSignature(page: PageSpec): string {
  const box = (c: TextSpec | ImageSpec) => `${c.kind}:${c.id}:${c.name}:${c.x},${c.y},${c.w},${c.h}`
  return [...page.texts.map(box), ...page.images.map(c => `${box(c)}:${c.imageKey}`)].join('|')
}
