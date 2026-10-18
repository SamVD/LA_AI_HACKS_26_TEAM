import './theme/tokens.css'
import './companion.css'
import './demo/demo.css'
import { builtinBank } from '../content'
import type { AppShell, Screen, Suggestion, Transcript, Unsubscribe, WordCategory, WordEntry } from '../core/types'
import { applyPhoneTheme, watchThemePreference } from './theme/applyTheme'
import { buildPersonalEntry, isPersonalCategory, validatePracticeFrame } from './personalWord'
import { describePreviewScreen, type PreviewCaptionOptions } from './preview/previewCaption'
import { ensurePreviewImages, renderPreviewOptions } from './preview/previewAssets'
import { renderScreen } from './preview/renderScreen'
import { extractKeywords } from '../ai/keywords'
import { bindJudgeDemo } from './demo/bindJudgeDemo'
import { MODE_HOME_LEAD, modeDisabledLead } from './modeCopy'
import { formatBuildCapabilityLine } from './buildCapability'
import {
  formatStep1ItemLine,
  formatStep1SessionHeadline,
  summarizeStep1Session,
} from './sessionSummary'
import { describeWordAssetHint } from './words/wordAssetHint'
import { createHintLog } from './sessionLog'
import { readStep3Settings, writeStep3Settings, type Step3Sensitivity } from './step3Settings'
import { eventLog } from '../debug/eventLog'
import { exportSessionLogJson, formatEventLogCount } from './eventLogExport'
import { companionShowsDebugTab } from './pipelineDebug'

export type CompanionDebugState = {
  transcripts: Transcript[]
  suggestions: Suggestion[]
}

export type CompanionDebugSource = {
  subscribe(cb: (state: CompanionDebugState) => void): Unsubscribe
}

export type CompanionMountOptions = {
  /** Dev harness: cycle fixture screens when no mode is active. */
  devPlaylist?: Screen[]
  /** Dev harness: live transcript and predictor output. */
  debug?: CompanionDebugSource
}

type TabId = 'home' | 'demo' | 'preview' | 'summary' | 'words' | 'debug'

const builtinIds = new Set(builtinBank().map(entry => entry.id))

function isPersonalEntry(entry: WordEntry): boolean {
  return (
    entry.category === 'person' ||
    entry.category === 'medication' ||
    entry.tags.includes('sample')
  )
}

function groupBank(entries: WordEntry[]): Map<WordCategory, WordEntry[]> {
  const map = new Map<WordCategory, WordEntry[]>()
  for (const entry of entries) {
    const list = map.get(entry.category) ?? []
    list.push(entry)
    map.set(entry.category, list)
  }
  return map
}

export function mountCompanion(
  root: HTMLElement,
  shell: AppShell,
  options: CompanionMountOptions = {},
): () => void {
  applyPhoneTheme()
  const unwatchTheme = watchThemePreference()
  root.className = 'nudge-phone nudge-demo-shell'
  root.replaceChildren()

  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env
  const showDebugTab = companionShowsDebugTab(
    Boolean(options.debug),
    typeof location === 'undefined' ? '' : location.search,
    viteEnv?.VITE_DEBUG === '1',
  )

  let activeTab: TabId = 'home'
  let playlistIndex = 0
  let followLive = true

  const tabBar = document.createElement('nav')
  tabBar.className = 'nudge-tabs'
  tabBar.setAttribute('role', 'tablist')

  const panels = document.createElement('div')
  panels.className = 'nudge-panels'

  const homePanel = document.createElement('section')
  homePanel.id = 'nudge-panel-home'
  homePanel.setAttribute('role', 'tabpanel')
  const demoPanel = document.createElement('section')
  demoPanel.id = 'nudge-panel-demo'
  demoPanel.setAttribute('role', 'tabpanel')
  demoPanel.className = 'nudge-demo-inline'

  // T-304: Step 3 controls and the hint session log. The log sees every screen
  // sent to the glasses (and the demo's screens), so demo hints appear too.
  const hintLog = createHintLog()
  const refreshStep3 = () => {
    const settings = readStep3Settings()
    for (const btn of step3Card.querySelectorAll<HTMLButtonElement>('[data-sensitivity]')) {
      const selected = btn.dataset.sensitivity === settings.sensitivity
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false')
      btn.classList.toggle('nudge-btn--primary', selected)
    }
    pauseBtn.textContent = settings.paused ? 'Resume hints' : 'Pause hints'
    pauseBtn.setAttribute('aria-pressed', settings.paused ? 'true' : 'false')
    logList.replaceChildren()
    const entries = hintLog.entries()
    if (!entries.length) {
      const empty = document.createElement('li')
      empty.className = 'nudge-debug-empty'
      empty.textContent = 'No hints yet this page.'
      logList.append(empty)
      return
    }
    for (const entry of entries) {
      const li = document.createElement('li')
      const time = new Date(entry.at).toLocaleTimeString()
      const level = `level ${entry.level}`
      const word = entry.word || entry.words[0] || '—'
      const outcome = entry.outcome === 'open' ? 'showing' : entry.outcome
      li.textContent = `${time} · ${word} · ${level} · ${outcome}`
      logList.append(li)
    }
  }
  const demoBinding = bindJudgeDemo(demoPanel, {
    compact: true,
    onScreen: screen => { hintLog.feed(screen); refreshStep3() },
    paused: () => readStep3Settings().paused,
  })
  const previewPanel = document.createElement('section')
  previewPanel.id = 'nudge-panel-preview'
  previewPanel.setAttribute('role', 'tabpanel')
  const summaryPanel = document.createElement('section')
  summaryPanel.id = 'nudge-panel-summary'
  summaryPanel.setAttribute('role', 'tabpanel')
  const wordsPanel = document.createElement('section')
  wordsPanel.id = 'nudge-panel-words'
  wordsPanel.setAttribute('role', 'tabpanel')
  const debugPanel = document.createElement('section')
  debugPanel.id = 'nudge-panel-debug'
  debugPanel.setAttribute('role', 'tabpanel')

  const previewHost = document.createElement('div')
  previewHost.className = 'nudge-glasses-frame'
  previewHost.setAttribute('aria-live', 'polite')
  const previewKind = document.createElement('p')
  previewKind.className = 'nudge-preview-kind'
  const previewLive = document.createElement('p')
  previewLive.className = 'nudge-preview-live'
  previewLive.hidden = true
  previewLive.textContent = 'Live — following the glasses'

  const modeList = document.createElement('div')
  modeList.className = 'nudge-mode-list'

  const summaryBody = document.createElement('div')
  summaryBody.className = 'nudge-summary-body'

  const wordBankBody = document.createElement('div')
  wordBankBody.className = 'nudge-word-bank'

  const wordForm = document.createElement('form')
  wordForm.className = 'nudge-word-form nudge-card'
  wordForm.innerHTML = `
    <h2>Add personal word</h2>
    <label class="nudge-field">
      <span>Word</span>
      <input name="word" type="text" required autocomplete="off" class="nudge-input" />
    </label>
    <p class="nudge-form-hint nudge-form-hint--static nudge-word-asset-hint" data-asset-hint hidden></p>
    <label class="nudge-field">
      <span>Category</span>
      <select name="category" class="nudge-input">
        <option value="person">Person</option>
        <option value="medication">Medication</option>
        <option value="place">Place</option>
        <option value="other">Other</option>
      </select>
    </label>
    <label class="nudge-field">
      <span>Tags (comma-separated)</span>
      <input name="tags" type="text" placeholder="daughter, morning" class="nudge-input" />
    </label>
    <label class="nudge-field">
      <span>Practice sentence (optional)</span>
      <input name="practice" type="text" maxlength="55" placeholder="My daughter is called ____." class="nudge-input" />
    </label>
    <p class="nudge-form-hint nudge-form-hint--static">For Step 1 only: one ____ blank, max 55 characters. Leave empty to skip practice.</p>
    <button type="submit" class="nudge-btn">Save word</button>
    <p class="nudge-form-hint" data-form-hint hidden></p>
  `

  const debugTranscript = document.createElement('div')
  debugTranscript.className = 'nudge-debug-block'
  const debugSuggestions = document.createElement('div')
  debugSuggestions.className = 'nudge-debug-block'
  const debugKeywords = document.createElement('div')
  debugKeywords.className = 'nudge-debug-block'

  const playlistRow = document.createElement('div')
  playlistRow.className = 'nudge-playlist-row'
  playlistRow.hidden = !options.devPlaylist?.length

  let previewGeneration = 0

  const previewCaptionOptions = (): PreviewCaptionOptions => ({
    showAssetKeys: Boolean(options.debug ?? options.devPlaylist?.length),
  })

  const paintPreview = async (screen: Screen | null) => {
    const generation = ++previewGeneration
    if (!screen) {
      previewHost.innerHTML = ''
      previewKind.textContent = 'No screen yet'
      return
    }
    await ensurePreviewImages(screen)
    if (generation !== previewGeneration) return
    previewHost.innerHTML = renderScreen(screen, renderPreviewOptions())
    previewKind.textContent = describePreviewScreen(screen, previewCaptionOptions())
  }

  const currentPreviewScreen = (): Screen | null => {
    if (shell.activeMode() && followLive) return shell.lastScreen()
    if (options.devPlaylist?.length && !shell.activeMode()) {
      return options.devPlaylist[playlistIndex]
    }
    return shell.lastScreen()
  }

  const refreshPreview = () => {
    const live = Boolean(shell.activeMode() && followLive)
    previewLive.hidden = !live
    void paintPreview(currentPreviewScreen())
  }

  const buildCapability = document.createElement('p')
  buildCapability.className = 'nudge-build-capability'

  const step3InBuild = () => shell.modes().find(m => m.id === 'step3')?.enabled === true

  const refreshHome = () => {
    buildCapability.textContent = formatBuildCapabilityLine(shell.modes())
    step3Card.hidden = !step3InBuild()
    modeList.replaceChildren()
    const active = shell.activeMode()
    for (const mode of shell.modes()) {
      if (mode.id === 'step2' && step3InBuild()) continue
      const card = document.createElement('article')
      card.className = 'nudge-card nudge-mode-card'
      const title = document.createElement('h2')
      title.textContent = mode.title
      card.append(title)
      const lead = document.createElement('p')
      lead.className = 'nudge-mode-lead'
      lead.textContent = mode.enabled ? MODE_HOME_LEAD[mode.id] : modeDisabledLead(mode.id)
      card.append(lead)
      if (!mode.enabled) {
        const soon = document.createElement('p')
        soon.className = 'nudge-coming-soon'
        soon.textContent = mode.id === 'step2' ? 'Step 2 off' : 'Coming soon'
        card.append(soon)
      }
      const row = document.createElement('div')
      row.className = 'nudge-mode-actions'
      if (active === mode.id) {
        const stop = document.createElement('button')
        stop.type = 'button'
        stop.className = 'nudge-btn'
        stop.textContent = 'Stop'
        stop.addEventListener('click', () => {
          void shell.leaveMode().then(() => {
            followLive = true
            refreshHome()
            refreshPreview()
            if (activeTab === 'summary') void refreshSummary()
          })
        })
        row.append(stop)
      } else if (mode.enabled) {
        const start = document.createElement('button')
        start.type = 'button'
        start.className = 'nudge-btn'
        start.textContent = 'Start'
        start.addEventListener('click', () => {
          void shell.startMode(mode.id).then(() => {
            followLive = true
            activeTab = 'preview'
            showTab('preview')
            refreshHome()
            refreshPreview()
          })
        })
        row.append(start)
      }
      card.append(row)
      modeList.append(card)
    }
  }

  const refreshSummary = async () => {
    const sessions = await shell.store.getSessions('step1')
    const latest = sessions[0]
    summaryBody.replaceChildren()
    if (!latest) {
      const empty = document.createElement('p')
      empty.className = 'nudge-summary-empty'
      empty.textContent = 'No Step 1 sessions saved yet. Finish a Practice run on the G2 to see results here.'
      summaryBody.append(empty)
      return
    }
    const stats = summarizeStep1Session(latest)
    const head = document.createElement('p')
    head.className = 'nudge-summary-headline'
    head.textContent = formatStep1SessionHeadline(latest, stats)
    summaryBody.append(head)
    const list = document.createElement('ul')
    list.className = 'nudge-word-list'
    for (const item of stats.items) {
      const li = document.createElement('li')
      li.textContent = formatStep1ItemLine(item)
      list.append(li)
    }
    summaryBody.append(list)
  }

  const refreshWords = async () => {
    const bank = await shell.store.getBank()
    const grouped = groupBank(bank)
    wordBankBody.replaceChildren()
    for (const [category, entries] of grouped) {
      const section = document.createElement('section')
      section.className = 'nudge-card'
      const h = document.createElement('h2')
      h.textContent = category
      section.append(h)
      const ul = document.createElement('ul')
      ul.className = 'nudge-word-list'
      for (const entry of entries.sort((a, b) => a.word.localeCompare(b.word))) {
        const li = document.createElement('li')
        li.className = 'nudge-word-row'
        const label = document.createElement('span')
        const personal = isPersonalEntry(entry) ? ' · Personal' : ''
        label.textContent = `${entry.word}${personal}`
        li.append(label)
        const removable = entry.id.startsWith('p-') && !builtinIds.has(entry.id)
        if (removable) {
          const remove = document.createElement('button')
          remove.type = 'button'
          remove.className = 'nudge-btn nudge-btn--ghost nudge-btn--compact'
          remove.textContent = 'Remove'
          remove.addEventListener('click', () => {
            void shell.store.removeWord(entry.id).then(() => refreshWords())
          })
          li.append(remove)
        }
        ul.append(li)
      }
      section.append(ul)
      wordBankBody.append(section)
    }
  }

  const refreshDebug = (state: CompanionDebugState) => {
    void (async () => {
      debugKeywords.replaceChildren()
      const kHead = document.createElement('h2')
      kHead.textContent = 'Keywords (T-303 preview)'
      debugKeywords.append(kHead)
      const finals = state.transcripts.filter(t => t.isFinal && !t.error)
      if (!finals.length) {
        const empty = document.createElement('p')
        empty.className = 'nudge-debug-empty'
        empty.textContent = 'Final transcript lines needed for keyword extraction.'
        debugKeywords.append(empty)
        return
      }
      const bank = await shell.store.getBank()
      const items = extractKeywords(finals, bank, { n: 8 })
      if (!items.length) {
        const empty = document.createElement('p')
        empty.className = 'nudge-debug-empty'
        empty.textContent = 'No keywords matched yet.'
        debugKeywords.append(empty)
        return
      }
      const kList = document.createElement('ul')
      kList.className = 'nudge-word-list nudge-debug-list'
      for (const item of items) {
        const li = document.createElement('li')
        li.textContent = `${item.word} · ${item.kind} · ${item.source}`
        kList.append(li)
      }
      debugKeywords.append(kList)
    })()
    debugTranscript.replaceChildren()
    const tHead = document.createElement('h2')
    tHead.textContent = 'Live transcript'
    debugTranscript.append(tHead)
    const tList = document.createElement('ul')
    tList.className = 'nudge-word-list nudge-debug-list'
    if (!state.transcripts.length) {
      const empty = document.createElement('p')
      empty.className = 'nudge-debug-empty'
      empty.textContent = 'Start a mode to see mock transcript lines.'
      debugTranscript.append(empty)
    } else {
      for (const line of state.transcripts.slice().reverse()) {
        const li = document.createElement('li')
        const finalMark = line.isFinal ? '' : ' (partial)'
        const err = line.error ? ` [${line.error}]` : ''
        li.textContent = `${line.text || '—'}${finalMark}${err}`
        tList.append(li)
      }
      debugTranscript.append(tList)
    }

    debugSuggestions.replaceChildren()
    const sHead = document.createElement('h2')
    sHead.textContent = 'Last suggestions'
    debugSuggestions.append(sHead)
    const sList = document.createElement('ul')
    sList.className = 'nudge-word-list nudge-debug-list'
    if (!state.suggestions.length) {
      const empty = document.createElement('p')
      empty.className = 'nudge-debug-empty'
      empty.textContent = 'Predictor has not run yet.'
      debugSuggestions.append(empty)
    } else {
      for (const item of state.suggestions) {
        const li = document.createElement('li')
        const pct = Math.round(item.confidence * 100)
        li.textContent = `${item.word} · ${pct}% · ${item.source}`
        sList.append(li)
      }
      debugSuggestions.append(sList)
    }
  }

  let lastDebug: CompanionDebugState = { transcripts: [], suggestions: [] }

  const showTab = (id: TabId) => {
    activeTab = id
    for (const btn of tabBar.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      const selected = btn.dataset.tab === id
      btn.setAttribute('aria-selected', selected ? 'true' : 'false')
      btn.classList.toggle('nudge-tab--active', selected)
    }
    homePanel.hidden = id !== 'home'
    demoPanel.hidden = id !== 'demo'
    previewPanel.hidden = id !== 'preview'
    summaryPanel.hidden = id !== 'summary'
    wordsPanel.hidden = id !== 'words'
    debugPanel.hidden = id !== 'debug'
    if (id === 'summary') void refreshSummary()
    if (id === 'words') {
      void refreshWords()
      void refreshWordAssetHint()
    }
    if (id === 'preview') refreshPreview()
    if (id === 'debug') {
      refreshSessionLogCount()
      if (options.debug) refreshDebug(lastDebug)
    }
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'demo', label: 'Demo' },
    { id: 'preview', label: 'Preview' },
    { id: 'summary', label: 'Step 1' },
    { id: 'words', label: 'Words' },
  ]
  if (showDebugTab) tabs.push({ id: 'debug', label: 'Debug' })

  for (const tab of tabs) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'nudge-tab'
    btn.dataset.tab = tab.id
    btn.textContent = tab.label
    btn.setAttribute('role', 'tab')
    btn.setAttribute('aria-controls', `nudge-panel-${tab.id}`)
    btn.addEventListener('click', () => showTab(tab.id))
    tabBar.append(btn)
  }

  const judgeDemoCard = document.createElement('section')
  judgeDemoCard.className = 'nudge-card nudge-home-demo'
  judgeDemoCard.innerHTML = `
    <h2>Judge demo</h2>
    <p class="nudge-home-demo-lead">Scripted stall replay on this page. Wear the G2 if you want the real touchpad; the preview mirrors the glasses.</p>
  `
  const openDemoBtn = document.createElement('button')
  openDemoBtn.type = 'button'
  openDemoBtn.className = 'nudge-btn nudge-btn--ghost'
  openDemoBtn.textContent = 'Open judge demo'
  openDemoBtn.addEventListener('click', () => showTab('demo'))
  judgeDemoCard.append(openDemoBtn)

  const step3Card = document.createElement('section')
  step3Card.className = 'nudge-card nudge-step3'
  step3Card.innerHTML = `
    <h2>Step 3 hints</h2>
    <p class="nudge-home-demo-lead">Ambient hints after a pause. Sensitivity maps to the stall thresholds; pausing silences new hints (the demo shows it too).</p>
  `
  const sensRow = document.createElement('div')
  sensRow.className = 'nudge-mode-actions'
  for (const [id, label] of [['calm', 'Calm'], ['balanced', 'Balanced'], ['eager', 'Eager']] as Array<[Step3Sensitivity, string]>) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'nudge-btn nudge-btn--ghost'
    btn.dataset.sensitivity = id
    btn.textContent = label
    btn.addEventListener('click', () => { writeStep3Settings({ sensitivity: id }); refreshStep3() })
    sensRow.append(btn)
  }
  const pauseBtn = document.createElement('button')
  pauseBtn.type = 'button'
  pauseBtn.className = 'nudge-btn'
  pauseBtn.addEventListener('click', () => {
    writeStep3Settings({ paused: !readStep3Settings().paused })
    refreshStep3()
  })
  sensRow.append(pauseBtn)
  const logList = document.createElement('ul')
  logList.className = 'nudge-word-list nudge-debug-list'
  step3Card.append(sensRow, logList)

  const homeLead = document.createElement('p')
  homeLead.className = 'nudge-home-lead'
  homeLead.textContent =
    'Start a mode for the glasses. This page stays calm and shows a live preview when a mode is running.'

  const sessionLogCard = document.createElement('section')
  sessionLogCard.className = 'nudge-card nudge-session-log'
  sessionLogCard.innerHTML = `
    <h2>Session log</h2>
    <p class="nudge-home-demo-lead">Pipeline events from this glasses session (STT, help taps, auto-hints). Export and paste into the G3 results PR.</p>
  `
  const sessionLogCount = document.createElement('p')
  sessionLogCount.className = 'nudge-session-log-count'
  const exportLogBtn = document.createElement('button')
  exportLogBtn.type = 'button'
  exportLogBtn.className = 'nudge-btn'
  exportLogBtn.textContent = 'Export session log'
  const sessionLogStatus = document.createElement('p')
  sessionLogStatus.className = 'nudge-session-log-status'
  sessionLogStatus.hidden = true
  const refreshSessionLogCount = () => {
    sessionLogCount.textContent = formatEventLogCount(eventLog.entries().length)
  }
  exportLogBtn.addEventListener('click', () => {
    void (async () => {
      exportLogBtn.disabled = true
      try {
        const via = await exportSessionLogJson(eventLog.toJSON())
        sessionLogStatus.hidden = false
        sessionLogStatus.textContent =
          via === 'clipboard'
            ? 'Copied to clipboard.'
            : 'Download started (clipboard was not available).'
      } finally {
        exportLogBtn.disabled = false
      }
    })()
  })
  sessionLogCard.append(sessionLogCount, exportLogBtn, sessionLogStatus)

  homePanel.append(buildCapability, homeLead, judgeDemoCard, step3Card, modeList)
  const previewLead = document.createElement('p')
  previewLead.className = 'nudge-preview-lead'
  previewLead.textContent =
    'Mirrors the glasses. Step 2 and 3 candidates are letters-first (not pictures or mouth shapes). Captions follow the cue ladder; asset lines show loaded vs placeholder only.'
  previewPanel.append(previewLead, previewLive, previewHost, previewKind)
  if (options.devPlaylist?.length) {
    const prev = document.createElement('button')
    prev.type = 'button'
    prev.className = 'nudge-btn nudge-btn--ghost'
    prev.textContent = 'Playlist previous'
    const next = document.createElement('button')
    next.type = 'button'
    next.className = 'nudge-btn nudge-btn--ghost'
    next.textContent = 'Playlist next'
    const label = document.createElement('span')
    label.className = 'nudge-playlist-label'
    const updateLabel = () => {
      label.textContent = `${playlistIndex + 1}/${options.devPlaylist!.length}`
    }
    prev.addEventListener('click', () => {
      if (shell.activeMode()) return
      followLive = false
      playlistIndex =
        (playlistIndex - 1 + options.devPlaylist!.length) % options.devPlaylist!.length
      refreshPreview()
      updateLabel()
    })
    next.addEventListener('click', () => {
      if (shell.activeMode()) return
      followLive = false
      playlistIndex = (playlistIndex + 1) % options.devPlaylist!.length
      refreshPreview()
      updateLabel()
    })
    updateLabel()
    playlistRow.append(prev, next, label)
    previewPanel.append(playlistRow)
  }
  summaryPanel.append(summaryBody)
  wordsPanel.append(wordForm, wordBankBody)
  if (showDebugTab) {
    debugPanel.append(sessionLogCard)
    if (options.debug) debugPanel.append(debugTranscript, debugKeywords, debugSuggestions)
  }

  panels.append(homePanel, demoPanel, previewPanel, summaryPanel, wordsPanel, debugPanel)

  const formHint = wordForm.querySelector<HTMLParagraphElement>('[data-form-hint]')!
  const assetHint = wordForm.querySelector<HTMLParagraphElement>('[data-asset-hint]')!
  const wordInput = wordForm.querySelector<HTMLInputElement>('input[name="word"]')!

  let assetHintGeneration = 0

  const refreshWordAssetHint = async () => {
    const generation = ++assetHintGeneration
    const word = wordInput.value.trim()
    if (!word) {
      assetHint.hidden = true
      assetHint.textContent = ''
      return
    }
    const bank = await shell.store.getBank()
    if (generation !== assetHintGeneration || wordInput.value.trim() !== word) {
      return
    }
    const takenIds = new Set(bank.map(entry => entry.id))
    const hint = describeWordAssetHint(word, takenIds)
    if (!hint) {
      assetHint.hidden = true
      assetHint.textContent = ''
      return
    }
    assetHint.hidden = false
    assetHint.textContent = hint
  }

  wordInput.addEventListener('input', () => {
    void refreshWordAssetHint()
  })

  wordForm.addEventListener('submit', event => {
    event.preventDefault()
    void (async () => {
      const data = new FormData(wordForm)
      const word = String(data.get('word') ?? '').trim()
      const category = String(data.get('category') ?? 'other') as WordCategory
      const tagsRaw = String(data.get('tags') ?? '')
      const practiceRaw = String(data.get('practice') ?? '').trim()
      const tags = tagsRaw
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean)
      if (!word) return
      if (!isPersonalCategory(category)) {
        formHint.hidden = false
        formHint.textContent = 'Choose a personal category.'
        return
      }
      if (practiceRaw) {
        const checked = validatePracticeFrame(practiceRaw)
        if (!checked.ok) {
          formHint.hidden = false
          formHint.textContent = checked.reason
          return
        }
      }
      const bank = await shell.store.getBank()
      const takenIds = new Set(bank.map(entry => entry.id))
      let entry: WordEntry
      try {
        entry = buildPersonalEntry(word, category, tags, {
          takenIds,
          practiceFrame: practiceRaw || undefined,
        })
      } catch (error) {
        formHint.hidden = false
        formHint.textContent = error instanceof Error ? error.message : 'Could not save word.'
        return
      }
      await shell.store.addWord(entry)
      formHint.hidden = false
      formHint.textContent = `Saved “${entry.word}”.`
      assetHintGeneration++
      wordForm.reset()
      assetHint.hidden = true
      assetHint.textContent = ''
      void refreshWords()
    })()
  })

  const header = document.createElement('header')
  header.className = 'nudge-card'
  header.innerHTML = `
    <h1>Nudge</h1>
    <p class="nudge-tagline">Quiet word-finding help on the glasses. This page stays calm.</p>
  `
  root.append(header, tabBar, panels)

  const unsubScreen = shell.onScreen(screen => {
    hintLog.feed(screen)
    refreshStep3()
    if (shell.activeMode()) followLive = true
    refreshHome()
    if (activeTab === 'preview') refreshPreview()
  })

  let fedTranscripts = 0
  const unsubDebug = options.debug?.subscribe(state => {
    lastDebug = state
    if (state.transcripts.length < fedTranscripts) fedTranscripts = 0
    for (const t of state.transcripts.slice(fedTranscripts)) hintLog.feedTranscript(t.text, t.isFinal)
    fedTranscripts = state.transcripts.length
    refreshStep3()
    if (activeTab === 'debug') refreshDebug(state)
  })

  const unsubEventLog = showDebugTab
    ? eventLog.subscribe(() => {
        refreshSessionLogCount()
      })
    : undefined

  showTab('home')
  refreshHome()
  refreshPreview()
  refreshStep3()
  if (showDebugTab) refreshSessionLogCount()
  void refreshWords()
  return () => {
    demoBinding.reset()
    unsubScreen()
    unsubEventLog?.()
    unsubDebug?.()
    unwatchTheme()
    root.replaceChildren()
    root.className = ''
  }
}
