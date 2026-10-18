import wordBank from '../../content/words.json'
import type { WordEntry } from '../../core/types'
import { mountCompanion } from '../mountCompanion'
import { createDevShell } from './devShell'
import { devPreviewPlaylist } from './previewPlaylist'

const root = document.getElementById('app')
if (!root) throw new Error('#app missing')

const shell = createDevShell(wordBank as WordEntry[])
mountCompanion(root, shell, { devPlaylist: devPreviewPlaylist })
