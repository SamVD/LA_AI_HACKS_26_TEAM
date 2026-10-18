import { mountCompanion } from './mountCompanion'

const root = document.getElementById('app')
if (!root) throw new Error('#app missing')
mountCompanion(root)
