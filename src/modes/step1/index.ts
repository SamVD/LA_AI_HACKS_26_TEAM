import type { Mode } from '../../core/types'

const mode: Mode = {
  id: 'step1',
  title: 'Practice',
  async enter(context) {
    await context.ui.show({ kind: 'status', text: 'step1 not built yet' })
  },
  async exit() {},
}

export default mode
