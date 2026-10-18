import './theme/tokens.css'
import './companion.css'
import type { Mode, ModeContext, ModeId } from '../core/types'
import { readFlags } from '../config'
import { getMode } from '../modes'
import { createMockContext } from '../mocks'
import wordBank from '../content/words.json'
import { applyPhoneTheme, watchThemePreference } from './theme/applyTheme'
import { previewPlaylist } from './previewPlaylist'
import { PreviewUI } from './previewUi'
import { renderScreenPreview } from './renderScreenPreview'

type ActiveSession = {
  mode: Mode
  context: ModeContext
  startedAt: number
}

export function mountCompanion(root: HTMLElement): () => void {
  applyPhoneTheme()
  const unwatchTheme = watchThemePreference()
  root.className = 'nudge-phone nudge-demo-shell'
  root.replaceChildren()

  let playlistIndex = 0
  let active: ActiveSession | undefined

  const previewHost = document.createElement('div')
  previewHost.className = 'nudge-glasses-frame'
  previewHost.setAttribute('aria-live', 'polite')

  const sessionBody = document.createElement('p')
  sessionBody.style.color = 'var(--nudge-text-muted)'
  sessionBody.style.margin = '0'

  const wordList = document.createElement('ul')
  wordList.className = 'nudge-word-list'

  const flags = readFlags()

  const setPreview = (screen: typeof previewPlaylist[number]) => {
    previewHost.innerHTML = renderScreenPreview(screen)
  }

  const updateSessionSummary = () => {
    if (!active) {
      sessionBody.textContent = 'No session running. Start Step 1 to exercise mocks.'
      return
    }
    const last = active.context.ui instanceof PreviewUI ? active.context.ui.screens.at(-1) : undefined
    const label = last?.kind === 'status' && 'text' in last ? last.text : last?.kind ?? '—'
    sessionBody.textContent = `Mode ${active.mode.id} · ${active.context.ui instanceof PreviewUI ? active.context.ui.screens.length : 0} screens · latest: ${label}`
  }

  const stopSession = async () => {
    if (!active) return
    await active.mode.exit()
    await active.context.stt.stop()
    active = undefined
    updateSessionSummary()
  }

  const startMode = async (id: ModeId) => {
    await stopSession()
    const previewUi = new PreviewUI(screen => {
      setPreview(screen)
      updateSessionSummary()
    })
    const context = createMockContext({
      ui: previewUi,
      flags: { ...readFlags(), mockServices: true },
    })
    const mode = getMode(id)
    active = { mode, context, startedAt: context.now() }
    await mode.enter(context)
    updateSessionSummary()
  }

  setPreview(previewPlaylist[playlistIndex])

  for (const entry of wordBank) {
    const li = document.createElement('li')
    li.textContent = `${entry.word} · ${entry.category}`
    wordList.appendChild(li)
  }

  const header = document.createElement('header')
  header.className = 'nudge-card'
  header.style.marginBottom = 'var(--nudge-space-4)'
  header.innerHTML = `
    <h1>Nudge companion</h1>
    <p style="margin: var(--nudge-space-3) 0 0; color: var(--nudge-text-muted);">
      Phone preview for caregivers. Glasses use the Even SDK path in <code>main.ts</code>.
    </p>
  `
  root.append(header)

  const previewCard = document.createElement('section')
  previewCard.className = 'nudge-card'
  previewCard.innerHTML = `<h2>Screen preview</h2>`
  const previewControls = document.createElement('div')
  previewControls.style.cssText =
    'display:flex;flex-wrap:wrap;gap:0.75rem;margin:var(--nudge-space-4) 0;align-items:center;'
  const prevBtn = document.createElement('button')
  prevBtn.type = 'button'
  prevBtn.className = 'nudge-btn nudge-btn--ghost'
  prevBtn.textContent = 'Previous screen'
  const nextBtn = document.createElement('button')
  nextBtn.type = 'button'
  nextBtn.className = 'nudge-btn nudge-btn--ghost'
  nextBtn.textContent = 'Next screen'
  const playlistLabel = document.createElement('span')
  playlistLabel.style.color = 'var(--nudge-text-muted)'
  previewControls.append(prevBtn, nextBtn, playlistLabel)
  previewCard.append(previewControls, previewHost)

  const launcher = document.createElement('section')
  launcher.className = 'nudge-card'
  launcher.style.marginTop = 'var(--nudge-space-4)'
  launcher.innerHTML = `<h2>Practice modes</h2>`
  const launcherRow = document.createElement('div')
  launcherRow.style.cssText = 'display:flex;flex-direction:column;gap:0.75rem;margin-top:var(--nudge-space-4);'
  const step1Btn = document.createElement('button')
  step1Btn.type = 'button'
  step1Btn.className = 'nudge-btn'
  step1Btn.textContent = 'Start Step 1'
  const step2Btn = document.createElement('button')
  step2Btn.type = 'button'
  step2Btn.className = 'nudge-btn nudge-btn--ghost'
  step2Btn.textContent = 'Start Step 2'
  step2Btn.disabled = !flags.step2Enabled
  const step3Btn = document.createElement('button')
  step3Btn.type = 'button'
  step3Btn.className = 'nudge-btn nudge-btn--ghost'
  step3Btn.textContent = 'Start Step 3'
  step3Btn.disabled = !flags.step3Enabled
  const stopBtn = document.createElement('button')
  stopBtn.type = 'button'
  stopBtn.className = 'nudge-btn nudge-btn--ghost'
  stopBtn.textContent = 'Stop session'
  launcherRow.append(step1Btn, step2Btn, step3Btn, stopBtn)
  launcher.append(launcherRow)

  const sessionCard = document.createElement('section')
  sessionCard.className = 'nudge-card'
  sessionCard.style.marginTop = 'var(--nudge-space-4)'
  sessionCard.innerHTML = `<h2>Session</h2>`
  sessionCard.append(sessionBody)

  const bankCard = document.createElement('section')
  bankCard.className = 'nudge-card'
  bankCard.style.marginTop = 'var(--nudge-space-4)'
  bankCard.innerHTML = `<h2>Word bank</h2><p style="color:var(--nudge-text-muted);margin:0 0 var(--nudge-space-3);">Read-only seed list (${wordBank.length} words)</p>`
  bankCard.append(wordList)

  root.append(previewCard, launcher, sessionCard, bankCard)

  const onUnload = () => void stopSession()
  window.addEventListener('beforeunload', onUnload)

  const refreshPlaylistLabel = () => {
    const screen = previewPlaylist[playlistIndex]
    playlistLabel.textContent = `${playlistIndex + 1}/${previewPlaylist.length} · ${screen.kind}`
  }
  refreshPlaylistLabel()
  updateSessionSummary()

  prevBtn.addEventListener('click', () => {
    playlistIndex = (playlistIndex - 1 + previewPlaylist.length) % previewPlaylist.length
    setPreview(previewPlaylist[playlistIndex])
    refreshPlaylistLabel()
  })
  nextBtn.addEventListener('click', () => {
    playlistIndex = (playlistIndex + 1) % previewPlaylist.length
    setPreview(previewPlaylist[playlistIndex])
    refreshPlaylistLabel()
  })

  step1Btn.addEventListener('click', () => void startMode('step1'))
  step2Btn.addEventListener('click', () => void startMode('step2'))
  step3Btn.addEventListener('click', () => void startMode('step3'))
  stopBtn.addEventListener('click', () => void stopSession())

  return () => {
    window.removeEventListener('beforeunload', onUnload)
    void stopSession()
    unwatchTheme()
    root.replaceChildren()
    root.className = ''
  }
}
