import '../theme/tokens.css'
import '../companion.css'
import './demo.css'
import { applyPhoneTheme, watchThemePreference } from '../theme/applyTheme'
import { bindJudgeDemo } from './bindJudgeDemo'

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

  const demoRoot = document.createElement('div')
  demoRoot.className = 'nudge-demo-body'
  const { reset } = bindJudgeDemo(demoRoot, { compact: false })

  root.append(header, demoRoot)

  return () => {
    reset()
    unwatch()
    root.replaceChildren()
    root.className = ''
  }
}
