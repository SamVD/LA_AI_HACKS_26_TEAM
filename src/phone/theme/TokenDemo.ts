import './tokens.css'
import { applyPhoneTheme } from './applyTheme'
import { renderGlassesSketch } from './renderGlassesSketch'
import { sketchScreens } from './sketchSamples'
import type { ScreenKind } from '../../core/types'

const SCREEN_ORDER: ScreenKind[] = [
  'blank',
  'prompt',
  'cue',
  'feedback',
  'candidates',
  'menu',
  'status',
]

/**
 * Mounts a self-contained phone + glasses sketch gallery for local dev.
 * T-105 will wire this from the companion page; T-006 only ships the module.
 */
export function mountTokenDemo(root: HTMLElement): () => void {
  applyPhoneTheme()
  root.classList.add('nudge-phone')
  root.innerHTML = ''

  const header = document.createElement('header')
  header.className = 'nudge-card'
  header.style.marginBottom = 'var(--nudge-space-6)'
  header.innerHTML = `
    <h1>Nudge design tokens</h1>
    <p style="margin: 0.75rem 0 0; color: var(--nudge-text-muted); max-width: 42rem;">
      Calm, large-type companion UI for caregivers. Glasses wireframes match 576×288 layout budgets in
      <code>docs/DISPLAY_LIMITS.md</code>.
    </p>
    <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem;">
      <button type="button" class="nudge-btn" data-action="primary">Start Step 1</button>
      <button type="button" class="nudge-btn nudge-btn--ghost" data-action="ghost">Word bank</button>
    </div>
  `

  const grid = document.createElement('div')
  grid.style.display = 'grid'
  grid.style.gap = '1.25rem'

  for (const kind of SCREEN_ORDER) {
    const screen = sketchScreens[kind]
    const card = document.createElement('article')
    card.className = 'nudge-card'
    card.innerHTML = `<h2 style="margin-bottom: 0.5rem;">Screen: ${kind}</h2>`
    const frame = document.createElement('div')
    frame.className = 'nudge-glasses-frame'
    frame.innerHTML = renderGlassesSketch(screen)
    card.appendChild(frame)
    grid.appendChild(card)
  }

  root.append(header, grid)

  const onClick = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')
    if (!btn) return
    const action = btn.dataset.action
    btn.textContent = action === 'primary' ? 'Ready when modes land' : 'Opens in T-105'
    window.setTimeout(() => {
      btn.textContent = action === 'primary' ? 'Start Step 1' : 'Word bank'
    }, 1400)
  }
  root.addEventListener('click', onClick)

  return () => {
    root.removeEventListener('click', onClick)
    root.innerHTML = ''
    root.classList.remove('nudge-phone')
  }
}
