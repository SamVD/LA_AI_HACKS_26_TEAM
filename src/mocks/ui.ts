import type { GlassesUI, Intent, Screen } from '../core/types'

export class MockUI implements GlassesUI {
  readonly screens: Screen[] = []
  private subscribers = new Set<(intent: Intent) => void>()

  async show(screen: Screen): Promise<void> {
    this.screens.push(structuredClone(screen))
  }

  last(): Screen | undefined {
    return this.screens.at(-1)
  }

  onIntent(callback: (intent: Intent) => void): () => void {
    this.subscribers.add(callback)
    return () => { this.subscribers.delete(callback) }
  }

  emit(intent: Intent): void {
    for (const callback of [...this.subscribers]) callback(intent)
  }
}

export class ConsoleUI extends MockUI {
  override async show(screen: Screen): Promise<void> {
    await super.show(screen)
    console.log('[nudge:screen]', screen)
  }
}
