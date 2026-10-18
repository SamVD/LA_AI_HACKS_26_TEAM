import '../theme/tokens.css'
import '../companion.css'
import './demo.css'
import { applyPhoneTheme, watchThemePreference } from '../theme/applyTheme'
import { judgeConversation, runJudgeDemo, stallCueLine } from './judgeDemo'
import type { JudgeDemoState } from './judgeDemo'

export function mountDemoPage(root: HTMLElement): () => void {
  applyPhoneTheme()
  const unwatch = watchThemePreference()
  root.className = 'nudge-phone nudge-demo-page'

  const header = document.createElement('header')
  header.className = 'nudge-card nudge-demo-header'
  header.innerHTML = `
    <h1>Judge demo</h1>
    <p class="nudge-demo-lead">Scripted conversation stall — no second person needed. Wear the G2 for the real touchpad; this page mirrors what appears on the glasses.</p>
  `

  const steps = document.createElement('ol')
  steps.className = 'nudge-demo-steps nudge-card'
  steps.innerHTML = `
    <li>Put on the <strong>Even G2</strong> (or watch the preview below).</li>
    <li>In the app, open <strong>Assist (Step 2)</strong> when it is enabled on the build you are testing.</li>
    <li>During the pause in the script, <strong>tap once</strong> on the touchpad (SELECT) to ask for a word.</li>
    <li>Swipe up/down to change suggestions; tap again to climb the cue ladder (picture → letter → word).</li>
    <li>Double-tap to go back. Root double-tap exits the app.</li>
  `

  const cue = document.createElement('p')
  cue.className = 'nudge-demo-cue'
  cue.textContent = stallCueLine()

  const controls = document.createElement('div')
  controls.className = 'nudge-demo-controls'
  const playBtn = document.createElement('button')
  playBtn.type = 'button'
  playBtn.className = 'nudge-btn'
  playBtn.textContent = 'Play scripted conversation'
  const resetBtn = document.createElement('button')
  resetBtn.type = 'button'
  resetBtn.className = 'nudge-btn nudge-btn--ghost'
  resetBtn.textContent = 'Reset preview'

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
  suggestTitle.textContent = 'Suggestions (after help tap)'
  const suggestList = document.createElement('ul')
  suggestList.className = 'nudge-word-list nudge-demo-list'
  suggestBox.append(suggestTitle, suggestList)

  const status = document.createElement('p')
  status.className = 'nudge-demo-status'
  status.textContent = 'Ready.'

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
      stalled: 'Stall — tap SELECT on the G2 for help.',
      help: 'Showing help (level 1 picture cue).',
    }
    status.textContent = phaseLabel[state.phase]
  }

  let running = false
  playBtn.addEventListener('click', () => {
    if (running) return
    running = true
    playBtn.disabled = true
    void runJudgeDemo(judgeConversation, {
        onState: renderState,
        onPreviewSvg(svg, label) {
          previewHost.innerHTML = svg
          previewLabel.textContent = label
        },
    })
      .catch(() => {
        status.textContent = 'Demo failed — try Reset and play again.'
      })
      .finally(() => {
        running = false
        playBtn.disabled = false
      })
  })

  resetBtn.addEventListener('click', () => {
    previewHost.innerHTML = ''
    previewLabel.textContent = 'G2 preview'
    renderState({ phase: 'idle', transcripts: [], suggestions: [] })
    status.textContent = 'Ready.'
  })

  controls.append(playBtn, resetBtn)
  root.append(header, steps, cue, controls, previewHost, previewLabel, status, transcriptBox, suggestBox)

  renderState({ phase: 'idle', transcripts: [], suggestions: [] })

  return () => {
    unwatch()
    root.replaceChildren()
    root.className = ''
  }
}
