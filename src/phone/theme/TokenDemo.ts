import './tokens.css'
import { applyPhoneTheme, watchThemePreference } from './applyTheme'
import { LAYOUT_SKETCH_IDS, renderLayoutSketch } from './renderGlassesSketch'

/**
 * Full token + layout gallery (optional; slim demo is demo.html).
 */
export function mountTokenDemo(root: HTMLElement): () => void {
  applyPhoneTheme()
  const unwatch = watchThemePreference()
  root.classList.add('nudge-phone', 'nudge-demo-shell')
  root.innerHTML = ''

  const header = document.createElement('header')
  header.className = 'nudge-card'
  header.style.marginBottom = 'var(--nudge-space-6)'
  header.innerHTML = `
    <h1>Nudge design tokens</h1>
    <p style="margin: 0.75rem 0 0; color: var(--nudge-text-muted);">
      Phone tokens + G2 wireframes (27px lines, event-capture dashed).
    </p>
    <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem;">
      <button type="button" class="nudge-btn" data-action="primary">Start Step 1</button>
      <button type="button" class="nudge-btn nudge-btn--ghost" data-action="ghost">Word bank</button>
    </div>
  `

  const grid = document.createElement('div')
  grid.style.display = 'grid'
  grid.style.gap = '1.25rem'

  for (const id of LAYOUT_SKETCH_IDS) {
    const card = document.createElement('article')
    card.className = 'nudge-card'
    card.innerHTML = `<h2 style="margin-bottom: 0.5rem;">${id}</h2>`
    const frame = document.createElement('div')
    frame.className = 'nudge-glasses-frame'
    frame.innerHTML = renderLayoutSketch(id)
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
    unwatch()
    root.innerHTML = ''
    root.classList.remove('nudge-phone', 'nudge-demo-shell')
  }
}
