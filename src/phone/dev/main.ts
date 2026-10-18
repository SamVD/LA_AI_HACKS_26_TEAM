import type { Intent } from '../../core/types'
import wordBank from '../../content/words.json'
import type { WordEntry } from '../../core/types'
import { mountCompanion } from '../mountCompanion'
import { createDevShell } from './devShell'
import { devPreviewPlaylist } from './previewPlaylist'

const root = document.getElementById('app')
if (!root) throw new Error('#app missing')

const { shell, previewUi } = createDevShell(wordBank as WordEntry[])
mountCompanion(root, shell, { devPlaylist: devPreviewPlaylist })

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
