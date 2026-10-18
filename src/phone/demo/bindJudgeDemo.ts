import type { Screen } from '../../core/types'
import {
  judgeConversation,
  runJudgeDemo,
  stallCueLine,
  type JudgeDemoHintTrigger,
  type JudgeDemoState,
} from './judgeDemo'

export type BindJudgeDemoOptions = {
  /** Hide long judge steps (companion tab). */
  compact?: boolean
  /** T-304: demo screens also feed the hint log. */
  onScreen?: (screen: Screen) => void
  /** T-304: paused at the stall → the demo shows the paused state, not a hint. */
  paused?: () => boolean
}

export function bindJudgeDemo(root: HTMLElement, options: BindJudgeDemoOptions = {}) {
  const cue = document.createElement('p')
  cue.className = 'nudge-demo-cue'
  cue.textContent = stallCueLine()

  const controls = document.createElement('div')
  controls.className = 'nudge-demo-controls'
  const playStep2Btn = document.createElement('button')
  playStep2Btn.type = 'button'
  playStep2Btn.className = 'nudge-btn'
  playStep2Btn.textContent = 'Play Step 2 (tap for help)'
  const playStep3Btn = document.createElement('button')
  playStep3Btn.type = 'button'
  playStep3Btn.className = 'nudge-btn nudge-btn--ghost'
  playStep3Btn.textContent = 'Play Step 3 (auto-hint)'
  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'nudge-btn nudge-btn--ghost'
  cancelBtn.textContent = 'Cancel'
  cancelBtn.hidden = true
  const resetBtn = document.createElement('button')
  resetBtn.type = 'button'
  resetBtn.className = 'nudge-btn nudge-btn--ghost'
  resetBtn.textContent = 'Reset'

  const previewHost = document.createElement('div')
  previewHost.className = 'nudge-glasses-frame'
  const previewLabel = document.createElement('p')
  previewLabel.className = 'nudge-preview-kind'
  previewLabel.textContent = 'G2 preview'

  const transcriptBox = document.createElement('div')
  transcriptBox.className = 'nudge-card nudge-demo-transcript'
  const transcriptTitle = document.createElement('h2')
  transcriptTitle.textContent = 'Conversation (script)'
  const transcriptList = document.createElement('ul')
  transcriptList.className = 'nudge-word-list nudge-demo-list'
  transcriptBox.append(transcriptTitle, transcriptList)

  const suggestBox = document.createElement('div')
  suggestBox.className = 'nudge-card nudge-demo-suggestions'
  const suggestTitle = document.createElement('h2')
  suggestTitle.textContent = 'Suggestions'
  const suggestList = document.createElement('ul')
  suggestList.className = 'nudge-word-list nudge-demo-list'
  suggestBox.append(suggestTitle, suggestList)

  const status = document.createElement('p')
  status.className = 'nudge-demo-status'
  status.textContent = 'Ready.'

  if (!options.compact) {
    const steps = document.createElement('ol')
    steps.className = 'nudge-demo-steps nudge-card'
    steps.innerHTML = `
      <li>Put on the <strong>Even G2</strong> (or watch the preview below).</li>
      <li><strong>Step 2:</strong> glasses stay blank until you tap SELECT for help.</li>
      <li><strong>Step 3:</strong> after a pause, a quiet hint can appear on its own (use Home to pause hints).</li>
      <li>After help: <strong>tap</strong> shows the first letter and blanks (<code>c _ _</code>); tap again for more letters; swipe down = next suggestion; swipe up = confirm.</li>
      <li>Double-tap to go back; root double-tap exits the app.</li>
    `
    root.append(steps)
  }

  const renderState = (state: JudgeDemoState) => {
    transcriptList.replaceChildren()
    for (const line of state.transcripts) {
      const li = document.createElement('li')
      li.textContent = line
      transcriptList.append(li)
    }
    suggestList.replaceChildren()
    for (const item of state.suggestions) {
      const li = document.createElement('li')
      const pct = Math.round(item.confidence * 100)
      li.textContent = `${item.word} · ${pct}%`
      suggestList.append(li)
    }
    const phaseLabel: Record<JudgeDemoState['phase'], string> = {
      idle: 'Ready.',
      playing: 'Playing script…',
      stalled: lastHintTrigger === 'tap'
        ? 'Stall — tap SELECT on the G2 for help.'
        : 'Stall — waiting for a quiet auto-hint…',
      help: 'Showing help — first letter and blanks (tap for more).',
      cancelled: 'Cancelled.',
    }
    status.textContent = phaseLabel[state.phase]
  }

  let abort: AbortController | null = null
  let lastHintTrigger: JudgeDemoHintTrigger = 'auto'

  const setPlaying = (disabled: boolean) => {
    playStep2Btn.disabled = disabled
    playStep3Btn.disabled = disabled
  }

  const reset = () => {
    abort?.abort()
    abort = null
    cancelBtn.hidden = true
    setPlaying(false)
    previewHost.innerHTML = ''
    previewLabel.textContent = 'G2 preview'
    renderState({ phase: 'idle', transcripts: [], suggestions: [] })
    status.textContent = 'Ready.'
  }

  const startDemo = (hintTrigger: JudgeDemoHintTrigger) => {
    if (abort) return
    lastHintTrigger = hintTrigger
    abort = new AbortController()
    cancelBtn.hidden = false
    setPlaying(true)
    void runJudgeDemo(
      judgeConversation,
      {
        onState: renderState,
        onPreviewSvg(svg, label) {
          previewHost.innerHTML = svg
          previewLabel.textContent = label
        },
        onScreen: options.onScreen,
      },
      { signal: abort.signal, paused: options.paused, hintTrigger },
    )
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          renderState({ phase: 'cancelled', transcripts: [], suggestions: [] })
          status.textContent = 'Cancelled.'
          return
        }
        status.textContent = 'Demo failed — try Reset and play again.'
      })
      .finally(() => {
        abort = null
        cancelBtn.hidden = true
        setPlaying(false)
      })
  }

  playStep2Btn.addEventListener('click', () => startDemo('tap'))
  playStep3Btn.addEventListener('click', () => startDemo('auto'))

  cancelBtn.addEventListener('click', () => {
    abort?.abort()
  })

  resetBtn.addEventListener('click', reset)

  controls.append(playStep2Btn, playStep3Btn, cancelBtn, resetBtn)
  root.append(cue, controls, previewHost, previewLabel, status, transcriptBox, suggestBox)
  renderState({ phase: 'idle', transcripts: [], suggestions: [] })

  return { reset }
}
