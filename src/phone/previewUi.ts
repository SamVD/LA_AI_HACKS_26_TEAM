import type { GlassesUI, Intent, Screen } from '../core/types'
import { MockUI } from '../mocks/ui'

/** `GlassesUI` that records screens in a `MockUI` and mirrors them to the phone preview. */
export class PreviewUI implements GlassesUI {
  private readonly inner = new MockUI()

  constructor(private readonly onScreen: (screen: Screen) => void) {}

  get screens(): Screen[] {
    return this.inner.screens
  }

  async show(screen: Screen): Promise<void> {
    await this.inner.show(screen)
    this.onScreen(screen)
  }

  onIntent(callback: (intent: Intent) => void): () => void {
    return this.inner.onIntent(callback)
  }

  emit(intent: Intent): void {
    this.inner.emit(intent)
  }
}
