import type { Intent } from '../../core/types'
import { mountCompanion } from '../mountCompanion'
import { createDevShell } from './devShell'
import { devPreviewPlaylist } from './previewPlaylist'

const root = document.getElementById('app')
if (!root) throw new Error('#app missing')

const { shell, previewUi, debug } = createDevShell()
mountCompanion(root, shell, { devPlaylist: devPreviewPlaylist, debug })

const intentBar = document.createElement('div')
intentBar.className = 'nudge-intent-bar'
intentBar.innerHTML = `<p class="nudge-preview-kind">Dev intents (glasses touchpad)</p>`
const intents: Intent[] = ['SELECT', 'NEXT', 'PREV', 'BACK']
for (const intent of intents) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'nudge-btn nudge-btn--ghost'
  btn.textContent = intent
  btn.addEventListener('click', () => previewUi.emit(intent))
  intentBar.append(btn)
}
root.append(intentBar)
