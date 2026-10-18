import type { ModeId, SessionRecord, Store, WordEntry } from '../core/types'

export class MemoryStore implements Store {
  private bank = new Map<string, WordEntry>()
  private sessions: SessionRecord[] = []

  constructor(seed: WordEntry[] = []) {
    for (const word of seed) this.bank.set(word.id, structuredClone(word))
  }

  async getBank(): Promise<WordEntry[]> {
    return structuredClone([...this.bank.values()])
  }

  async addWord(word: WordEntry): Promise<void> {
    this.bank.set(word.id, structuredClone(word))
  }

  async removeWord(id: string): Promise<void> {
    this.bank.delete(id)
  }

  async saveSession(session: SessionRecord): Promise<void> {
    this.sessions.unshift(structuredClone(session))
  }

  async getSessions(mode?: ModeId): Promise<SessionRecord[]> {
    return structuredClone(this.sessions
      .filter(session => !mode || session.mode === mode)
      .sort((a, b) => b.startedAt - a.startedAt))
  }
}
