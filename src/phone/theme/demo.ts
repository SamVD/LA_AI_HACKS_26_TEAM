import './tokens.css'
import { applyPhoneTheme, watchThemePreference } from './applyTheme'
import type { ThemeMode } from './tokens'

applyPhoneTheme()
watchThemePreference()

const root = document.getElementById('app')
if (!root) {
  throw new Error('demo root #app missing')
}

root.className = 'nudge-phone nudge-demo-shell'
root.innerHTML = `
  <header style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: var(--nudge-space-6);">
    <h1 style="font-size: var(--nudge-font-lg);">Nudge</h1>
    <button type="button" class="nudge-theme-toggle" id="theme-toggle" aria-label="Toggle light or dark theme">Theme</button>
  </header>
  <section class="nudge-card" aria-labelledby="launcher-title">
    <h2 id="launcher-title">Practice modes</h2>
    <p style="margin: var(--nudge-space-3) 0 var(--nudge-space-5); color: var(--nudge-text-muted);">
      Calm companion for caregivers. Glasses stay quiet until help is needed.
    </p>
    <button type="button" class="nudge-btn" id="start-step1">Start Step 1</button>
  </section>
`

const toggle = document.getElementById('theme-toggle')
const start = document.getElementById('start-step1')

toggle?.addEventListener('click', () => {
  const html = document.documentElement
  const next: ThemeMode = html.dataset.theme === 'light' ? 'dark' : 'light'
  html.dataset.themeLocked = '1'
  applyPhoneTheme(next)
  toggle.textContent = next === 'light' ? 'Dark' : 'Light'
})

start?.addEventListener('click', () => {
  start.textContent = 'Opens when modes land (T-105)'
  window.setTimeout(() => {
    start.textContent = 'Start Step 1'
  }, 1600)
})
