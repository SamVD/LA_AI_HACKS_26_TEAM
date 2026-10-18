import type { Screen, Suggestion } from '../../core/types'
import type { ConversationFixture } from '../../mocks/fixtures'
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

async function paint(host: JudgeDemoCallbacks, screen: Screen, label: string) {
  await ensurePreviewImages(screen)
  host.onPreviewSvg(renderScreen(screen, renderPreviewOptions()), label)
}

export type RunJudgeDemoOptions = {
  stallIndex?: number
  speed?: number
  signal?: AbortSignal
}

/** Replay fixture transcripts up to the first stall, then show Step 2-style candidates. */
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
  await paint(host, { kind: 'blank' }, 'Step 2 — listening (blank screen on G2)')

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
  host.onState({
    phase: 'stalled',
    transcripts: [...transcripts],
    suggestions: [],
  })

  const items = suggestionsForStall(stall)
  const helpScreen: Screen = {
    kind: 'candidates',
    level: 1,
    index: 0,
    items,
  }
  host.onState({ phase: 'help', transcripts: [...transcripts], suggestions: items })
  await paint(
    host,
    helpScreen,
    `After help tap — stalled on “${stall.intendedWord}”`,
  )
}

export function stallCueLine(): string {
  return `Stall cue: “…${primaryStall.stalledAfter} ___” → ${primaryStall.intendedWord}`
}

export { judgeConversation, primaryStall }
