import './theme/tokens.css'
import './companion.css'
import { builtinBank } from '../content'
import type { AppShell, Screen, Suggestion, Transcript, Unsubscribe, WordCategory, WordEntry } from '../core/types'
import { applyPhoneTheme, watchThemePreference } from './theme/applyTheme'
import { buildPersonalEntry, isPersonalCategory, validatePracticeFrame } from './personalWord'
import { ensurePreviewImages, renderPreviewOptions } from './preview/previewAssets'
import { renderScreen } from './preview/renderScreen'
import { judgeDemoHref } from './judgeDemoHref'
import { formatStep1ItemLine, summarizeStep1Session } from './sessionSummary'

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

type TabId = 'home' | 'preview' | 'summary' | 'words' | 'debug'

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

  let activeTab: TabId = 'home'
  let playlistIndex = 0
  let followLive = true

  const tabBar = document.createElement('nav')
  tabBar.className = 'nudge-tabs'
  tabBar.setAttribute('role', 'tablist')

  const panels = document.createElement('div')
  panels.className = 'nudge-panels'

  const homePanel = document.createElement('section')
  const previewPanel = document.createElement('section')
  const summaryPanel = document.createElement('section')
  const wordsPanel = document.createElement('section')
  const debugPanel = document.createElement('section')

  const previewHost = document.createElement('div')
  previewHost.className = 'nudge-glasses-frame'
  previewHost.setAttribute('aria-live', 'polite')
  const previewKind = document.createElement('p')
  previewKind.className = 'nudge-preview-kind'

  const judgeDemoCard = document.createElement('section')
  judgeDemoCard.className = 'nudge-card nudge-home-demo'
  judgeDemoCard.innerHTML = `
    <h2>Judge demo</h2>
    <p class="nudge-home-demo-lead">Scripted conversation stall for the booth — no second person required.</p>
  `
  const demoLink = document.createElement('a')
  demoLink.className = 'nudge-btn nudge-btn--ghost'
  demoLink.href = judgeDemoHref()
  demoLink.textContent = 'Open judge demo'
  judgeDemoCard.append(demoLink)

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

  const playlistRow = document.createElement('div')
  playlistRow.className = 'nudge-playlist-row'
  playlistRow.hidden = !options.devPlaylist?.length

  let previewGeneration = 0

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
    previewKind.textContent = `Screen: ${screen.kind}`
  }

  const currentPreviewScreen = (): Screen | null => {
    if (shell.activeMode() && followLive) return shell.lastScreen()
    if (options.devPlaylist?.length && !shell.activeMode()) {
      return options.devPlaylist[playlistIndex]
    }
    return shell.lastScreen()
  }

  const refreshPreview = () => {
    void paintPreview(currentPreviewScreen())
  }

  const refreshHome = () => {
    modeList.replaceChildren()
    const active = shell.activeMode()
    for (const mode of shell.modes()) {
      const card = document.createElement('article')
      card.className = 'nudge-card nudge-mode-card'
      const title = document.createElement('h2')
      title.textContent = mode.title
      card.append(title)
      if (!mode.enabled) {
        const soon = document.createElement('p')
        soon.className = 'nudge-coming-soon'
        soon.textContent = 'Coming soon'
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
      summaryBody.textContent = 'No Step 1 sessions saved yet.'
      return
    }
    const stats = summarizeStep1Session(latest)
    const head = document.createElement('p')
    head.textContent = `Solved ${stats.solved} · without help ${stats.solvedWithoutHelp}`
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
    previewPanel.hidden = id !== 'preview'
    summaryPanel.hidden = id !== 'summary'
    wordsPanel.hidden = id !== 'words'
    debugPanel.hidden = id !== 'debug'
    if (id === 'summary') void refreshSummary()
    if (id === 'words') void refreshWords()
    if (id === 'preview') refreshPreview()
    if (id === 'debug') refreshDebug(lastDebug)
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'preview', label: 'Preview' },
    { id: 'summary', label: 'Step 1' },
    { id: 'words', label: 'Words' },
  ]
  if (options.debug) tabs.push({ id: 'debug', label: 'Debug' })

  for (const tab of tabs) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'nudge-tab'
    btn.dataset.tab = tab.id
    btn.textContent = tab.label
    btn.setAttribute('role', 'tab')
    btn.addEventListener('click', () => showTab(tab.id))
    tabBar.append(btn)
  }

  homePanel.append(judgeDemoCard, modeList)
  previewPanel.append(previewHost, previewKind)
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
  debugPanel.append(debugTranscript, debugSuggestions)

  panels.append(homePanel, previewPanel, summaryPanel, wordsPanel, debugPanel)

  const formHint = wordForm.querySelector<HTMLParagraphElement>('[data-form-hint]')!
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
      wordForm.reset()
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

  const unsubScreen = shell.onScreen(() => {
    if (shell.activeMode()) followLive = true
    refreshHome()
    if (activeTab === 'preview') refreshPreview()
  })

  const unsubDebug = options.debug?.subscribe(state => {
    lastDebug = state
    if (activeTab === 'debug') refreshDebug(state)
  })

  showTab('home')
  refreshHome()
  refreshPreview()
  void refreshWords()
  return () => {
    unsubScreen()
    unsubDebug?.()
    unwatchTheme()
    root.replaceChildren()
    root.className = ''
  }
}
