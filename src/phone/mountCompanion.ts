import './theme/tokens.css'
import './companion.css'
import type { AppShell, Screen, WordCategory, WordEntry } from '../core/types'
import { applyPhoneTheme, watchThemePreference } from './theme/applyTheme'
import { renderScreen } from './preview/renderScreen'
import { summarizeStep1Session } from './sessionSummary'

export type CompanionMountOptions = {
  /** Dev harness: cycle fixture screens when no mode is active. */
  devPlaylist?: Screen[]
}

type TabId = 'home' | 'preview' | 'summary' | 'words'

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

  const previewHost = document.createElement('div')
  previewHost.className = 'nudge-glasses-frame'
  previewHost.setAttribute('aria-live', 'polite')
  const previewKind = document.createElement('p')
  previewKind.className = 'nudge-preview-kind'

  const modeList = document.createElement('div')
  modeList.className = 'nudge-mode-list'

  const summaryBody = document.createElement('div')
  summaryBody.className = 'nudge-summary-body'

  const wordBankBody = document.createElement('div')
  wordBankBody.className = 'nudge-word-bank'

  const playlistRow = document.createElement('div')
  playlistRow.className = 'nudge-playlist-row'
  playlistRow.hidden = !options.devPlaylist?.length

  const setPreviewSvg = (screen: Screen | null) => {
    if (!screen) {
      previewHost.innerHTML = ''
      previewKind.textContent = 'No screen yet'
      return
    }
    previewHost.innerHTML = renderScreen(screen)
    previewKind.textContent = `Screen: ${screen.kind}`
  }

  const refreshPreview = () => {
    if (shell.activeMode() && followLive) {
      setPreviewSvg(shell.lastScreen())
      return
    }
    if (options.devPlaylist?.length && !shell.activeMode()) {
      setPreviewSvg(options.devPlaylist[playlistIndex])
      return
    }
    setPreviewSvg(shell.lastScreen())
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
      li.textContent = `${item.word} · cue ${item.solvedAtCue}`
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
        const personal = isPersonalEntry(entry) ? ' · Personal' : ''
        li.textContent = `${entry.word}${personal}`
        ul.append(li)
      }
      section.append(ul)
      wordBankBody.append(section)
    }
  }

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
    if (id === 'summary') void refreshSummary()
    if (id === 'words') void refreshWords()
  }

  for (const tab of [
    { id: 'home' as TabId, label: 'Home' },
    { id: 'preview' as TabId, label: 'Preview' },
    { id: 'summary' as TabId, label: 'Step 1' },
    { id: 'words' as TabId, label: 'Words' },
  ]) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'nudge-tab'
    btn.dataset.tab = tab.id
    btn.textContent = tab.label
    btn.setAttribute('role', 'tab')
    btn.addEventListener('click', () => showTab(tab.id))
    tabBar.append(btn)
  }

  homePanel.append(modeList)
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
  wordsPanel.append(wordBankBody)

  panels.append(homePanel, previewPanel, summaryPanel, wordsPanel)

  const header = document.createElement('header')
  header.className = 'nudge-card'
  header.innerHTML = `<h1>Nudge</h1>`
  root.append(header, tabBar, panels)

  const unsubScreen = shell.onScreen(() => {
    if (shell.activeMode()) followLive = true
    if (activeTab === 'preview') refreshPreview()
  })

  showTab('home')
  refreshHome()
  refreshPreview()
  void refreshWords()

  return () => {
    unsubScreen()
    unwatchTheme()
    root.replaceChildren()
    root.className = ''
  }
}
