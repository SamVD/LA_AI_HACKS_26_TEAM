import type { Screen, Suggestion } from '../../core/types'
import type { ConversationFixture } from '../../mocks/fixtures'
import { describePreviewScreen } from '../preview/previewCaption'
import { ensurePreviewImages, renderPreviewOptions } from '../preview/previewAssets'
import { renderScreen } from '../preview/renderScreen'
import { judgeConversation, primaryStall, suggestionsForStall } from './demoFixture'

export type JudgeDemoPhase = 'idle' | 'playing' | 'stalled' | 'help' | 'cancelled'

export type JudgeDemoState = {
  phase: JudgeDemoPhase
  transcripts: string[]
  suggestions: Suggestion[]
}

export type JudgeDemoCallbacks = {
  onState(state: JudgeDemoState): void
  onPreviewSvg(svg: string, label: string): void
  /** Every screen painted for the demo (feeds the Step 3 hint log, T-304). */
  onScreen?(screen: Screen): void
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function paint(host: JudgeDemoCallbacks, screen: Screen, note?: string) {
  await ensurePreviewImages(screen)
  const caption = describePreviewScreen(screen)
  host.onScreen?.(screen)
  host.onPreviewSvg(renderScreen(screen, renderPreviewOptions()), note ? `${caption} · ${note}` : caption)
}

/** Step 2: user taps for help. Step 3: hint appears on the blank display after a pause. */
export type JudgeDemoHintTrigger = 'tap' | 'auto'

export type RunJudgeDemoOptions = {
  stallIndex?: number
  speed?: number
  signal?: AbortSignal
  /** Step 2 tap-for-help vs Step 3 auto-hint after silence. */
  hintTrigger?: JudgeDemoHintTrigger
  /** T-304: when true at the stall, the demo shows the paused state instead of a hint. */
  paused?: () => boolean
}

/** Replay fixture transcripts up to the first stall, then show help candidates. */
export async function runJudgeDemo(
  fixture: ConversationFixture,
  host: JudgeDemoCallbacks,
  opts: RunJudgeDemoOptions = {},
): Promise<void> {
  const stallIndex = opts.stallIndex ?? 0
  const stall = fixture.stalls[stallIndex]
  if (!stall) return
  const speed = opts.speed ?? 0.35
  const signal = opts.signal

  const transcripts: string[] = []
  host.onState({ phase: 'playing', transcripts, suggestions: [] })
  await paint(host, { kind: 'blank' })

  const finalLines = fixture.events.filter(
    event => event.type === 'transcript' && event.isFinal,
  ) as Array<{ tMs: number; text: string }>

  let lastMs = 0
  for (const line of finalLines) {
    if (signal?.aborted) {
      host.onState({ phase: 'cancelled', transcripts: [...transcripts], suggestions: [] })
      return
    }
    if (line.tMs > stall.tMs) break
    const wait = Math.max(0, (line.tMs - lastMs) * speed)
    if (wait) await delay(wait, signal)
    lastMs = line.tMs
    transcripts.push(line.text)
    host.onState({ phase: 'playing', transcripts: [...transcripts], suggestions: [] })
  }

  if (signal?.aborted) {
    host.onState({ phase: 'cancelled', transcripts: [...transcripts], suggestions: [] })
    return
  }

  await delay(400 * speed, signal)
  const hintTrigger = opts.hintTrigger ?? 'auto'
  host.onState({
    phase: 'stalled',
    transcripts: [...transcripts],
    suggestions: [],
  })

  const items = suggestionsForStall(stall)
  const paused = opts.paused?.() === true

  if (paused) {
    const helpScreen: Screen = {
      kind: 'status',
      text: 'Hints paused — resume Step 3 to see suggestions.',
    }
    host.onState({ phase: 'help', transcripts: [...transcripts], suggestions: [] })
    await paint(host, helpScreen, 'hints paused')
    return
  }

  if (hintTrigger === 'tap') {
    await paint(host, { kind: 'status', text: 'Tap SELECT on the touchpad for help.' }, 'stall')
    await delay(500 * speed, signal)
  } else {
    await paint(host, { kind: 'blank' }, 'stall — listening')
    await delay(700 * speed, signal)
  }

  const helpScreen: Screen = { kind: 'candidates', level: 1, index: 0, items }
  host.onState({ phase: 'help', transcripts: [...transcripts], suggestions: items })
  await paint(
    host,
    helpScreen,
    hintTrigger === 'tap' ? 'after help tap' : 'after auto-hint',
  )
}

export function stallCueLine(): string {
  return `Stall cue: “…${primaryStall.stalledAfter} ___” → ${primaryStall.intendedWord}`
}

export { judgeConversation, primaryStall }
