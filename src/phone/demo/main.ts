import { mountDemoPage } from './mountDemo'

const root = document.getElementById('app')
if (!root) throw new Error('#app missing')

mountDemoPage(root)
