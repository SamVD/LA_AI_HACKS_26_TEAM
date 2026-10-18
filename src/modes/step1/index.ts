import type { Mode, ModeContext, Screen, SessionRecord, Transcript, WordEntry } from '../../core/types'
import { resolveAssets } from '../../content'
import { matchWord, normalize } from '../../matching'

export interface PracticeResult {
  wordId: string
  word: string
  frame: string
  solvedAtCue: 0 | 1 | 2 | 3 | null
  attempts: number
  skipped: boolean
  ms: number
}

interface PracticeItem { entry: WordEntry; frame: string }
type Phase = 'loading' | 'active' | 'feedback' | 'error' | 'empty' | 'saving' | 'save-error' | 'summary' | 'leaving' | 'idle'
interface Session {
  startedAt: number
  endedAt?: number
  items: PracticeResult[]
  saved: boolean
  saving?: Promise<boolean>
}

export const EMPTY_PRACTICE_MESSAGE = 'No practice words. Add a word with a sentence frame.'

/** Keep spaces/hyphens and reveal the first and last letter of the target. */
export function maskWord(word: string): string {
  const characters = [...word]
  const isLetter = (char: string) => /[\p{L}\p{N}]/u.test(char)
  const count = characters.filter(isLetter).length
  let seen = 0
  return characters.map(char => {
    if (!isLetter(char)) return char
    seen++
    if (seen === 1) return count === 1 ? `${char}_` : char
    return count > 2 && seen === count ? char : '_'
  }).join('')
}

/** Rotate categories, discard sample/invalid frames and deduplicate words. */
export function practiceItems(bank: WordEntry[], random: () => number = Math.random): PracticeItem[] {
  const groups = new Map<WordEntry['category'], PracticeItem[]>()
  const seen = new Set<string>()
  const index = (length: number) => {
    const value = random()
    return Number.isFinite(value) ? Math.min(length - 1, Math.max(0, Math.floor(value * length))) : 0
  }
  for (const entry of bank) {
    const key = normalize(entry.word)
    const frames = entry.frames.filter(frame => frame.split('____').length === 2 && !frame.includes('_____'))
    if (!key || seen.has(key) || entry.tags.includes('sample') || frames.length === 0) continue
    seen.add(key)
    const group = groups.get(entry.category) ?? []
    group.push({ entry, frame: frames[index(frames.length)] })
    groups.set(entry.category, group)
  }
  const order: WordEntry['category'][] = ['object', 'food', 'place', 'person', 'medication', 'other']
  const items: PracticeItem[] = []
  while (items.length < 10) {
    let picked = false
    for (const category of order) {
      const group = groups.get(category)
      if (!group?.length) continue
      items.push(group.splice(index(group.length), 1)[0])
      picked = true
      if (items.length === 10) break
    }
    if (!picked) break
  }
  return items
}

class Practice {
  private live = false
  private generation = 0
  private phase: Phase = 'idle'
  private off?: () => void
  private timer?: ReturnType<typeof setTimeout>
  private stops = Promise.resolve()
  private session: Session = { startedAt: 0, items: [], saved: false }
  private items: PracticeItem[] = []
  private current?: PracticeItem
  private result?: PracticeResult
  private openedAt = 0
  private cue: 0 | 1 | 2 | 3 = 0
  private attempted = false
  private recorded = false
  private wrongAtFull = 0

  constructor(private ctx: ModeContext, private random: () => number) {}

  async enter() {
    this.live = true
    this.off = this.ctx.ui.onIntent(intent => {
      if (!this.live || this.phase === 'leaving') return
      if (intent === 'BACK') { this.run(() => this.leave()); return }
      if (intent === 'NEXT' && ['active', 'feedback', 'error'].includes(this.phase)) {
        this.record(true)
        this.run(() => this.nextItem())
      } else if (intent === 'SELECT') {
        if (this.phase === 'active' && this.cue < 3) {
          this.escalate()
          this.run(() => this.showCurrent(this.generation))
        } else if (this.phase === 'error') {
          this.phase = 'active'
          const token = ++this.generation
          this.run(() => this.resume(token))
        } else if (this.phase === 'summary' || this.phase === 'empty') {
          this.run(() => this.startSession())
        } else if (this.phase === 'save-error') {
          this.run(() => this.finishSession(this.generation))
        }
      }
    })
    await this.startSession()
  }

  async exit() {
    this.live = false
    this.phase = 'idle'
    ++this.generation
    this.clearTimer()
    this.off?.()
    this.off = undefined
    await this.stopStt()
  }

  private run(task: () => Promise<unknown>) {
    void task().catch(error => this.ctx.log('step1.error', { action: 'mode', error: String(error) }))
  }

  private valid(token: number) { return this.live && token === this.generation }

  private clearTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  private stopStt(): Promise<void> {
    // A late stop must not close a newer item's recording. All stops are
    // serialized, and a fresh recording waits for the current stop chain.
    this.stops = this.stops.catch(() => {}).then(() => this.ctx.stt.stop()).catch(error => {
      this.ctx.log('step1.error', { action: 'stop', error: String(error) })
    })
    return this.stops
  }

  private async show(screen: Screen, token: number): Promise<boolean> {
    if (!this.valid(token)) return false
    try {
      await this.ctx.ui.show(screen)
      return this.valid(token)
    } catch (error) {
      if (this.valid(token)) {
        this.phase = 'error'
        this.clearTimer()
        this.ctx.log('step1.error', { action: 'screen', error: String(error) })
        await this.stopStt()
      }
      return false
    }
  }

  private async startSession() {
    if (!this.live) return
    const token = ++this.generation
    this.clearTimer()
    this.phase = 'loading'
    this.current = undefined
    this.result = undefined
    this.session = { startedAt: this.ctx.now(), items: [], saved: false }
    await this.stops
    if (!this.valid(token)) return
    try {
      const bank = await this.ctx.store.getBank()
      if (!this.valid(token)) return
      this.items = practiceItems(bank, this.random)
    } catch (error) {
      if (!this.valid(token)) return
      this.phase = 'empty'
      this.ctx.log('step1.error', { action: 'bank', error: String(error) })
      await this.show({ kind: 'status', text: 'Could not load words. Tap to try again.' }, token)
      return
    }
    if (this.items.length === 0) {
      this.phase = 'empty'
      await this.show({ kind: 'status', text: EMPTY_PRACTICE_MESSAGE }, token)
      return
    }
    await this.nextItem()
  }

  private async nextItem() {
    if (!this.live || this.phase === 'leaving') return
    const token = ++this.generation
    this.clearTimer()
    this.current = this.items[this.session.items.length]
    this.result = undefined
    this.recorded = false
    this.attempted = false
    this.wrongAtFull = 0
    this.cue = 0
    if (!this.current) { await this.finishSession(token); return }
    this.phase = 'active'
    this.openedAt = this.ctx.now()
    const { entry, frame } = this.current
    this.result = { wordId: entry.id, word: entry.word, frame, solvedAtCue: null, attempts: 0, skipped: false, ms: 0 }
    this.ctx.log('step1.item', { wordId: entry.id, index: this.session.items.length, total: this.items.length })
    await this.resume(token)
  }

  private async resume(token: number) {
    const shown = await this.showCurrent(token)
    // Wait for cleanup from an error or exit, preserving the warm mic between items.
    await this.stops
    if (shown && this.valid(token) && this.phase === 'active') this.run(() => this.listen(token))
  }

  private screen(): Screen {
    const { entry, frame } = this.current!
    if (this.cue === 0) return { kind: 'prompt', sentence: frame }
    if (this.cue === 1) return { kind: 'cue', level: 1, word: entry.word, imageKey: resolveAssets(entry).imageKey, sentence: frame }
    if (this.cue === 2) return { kind: 'cue', level: 2, word: entry.word, masked: maskWord(entry.word), sentence: frame }
    return { kind: 'cue', level: 3, word: entry.word, sentence: frame }
  }

  private async showCurrent(token: number): Promise<boolean> {
    return this.current ? this.show(this.screen(), token) : false
  }

  private escalate() {
    this.cue = Math.min(3, this.cue + 1) as 1 | 2 | 3
    if (this.cue === 1 && !resolveAssets(this.current!.entry).imageKey) this.cue = 2
  }

  private record(skipped = false) {
    if (!this.result || this.recorded) return
    this.recorded = true
    this.result.skipped = skipped
    this.result.ms = Math.max(0, this.ctx.now() - this.openedAt)
    const result = { ...this.result }
    this.session.items.push(result)
    this.ctx.log('step1.result', result)
  }

  private later(ms: number, token: number, action: () => Promise<unknown>) {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (this.valid(token)) this.run(action)
    }, ms)
  }

  private async listen(token: number) {
    if (!this.valid(token) || this.phase !== 'active' || !this.current) return
    let transcript: Transcript
    try {
      transcript = await this.ctx.stt.transcribeUtterance({ maxMs: 8000, endSilenceMs: 1200, targetHint: this.current.entry.word })
    } catch {
      transcript = { text: '', isFinal: true, tStartMs: this.ctx.now(), tEndMs: this.ctx.now(), error: 'unknown' }
    }
    if (!this.valid(token) || this.phase !== 'active') return
    this.attempted = true
    if (transcript.error && transcript.error !== 'no-speech') {
      this.phase = 'error'
      this.ctx.log('step1.error', { error: transcript.error, wordId: this.current.entry.id })
      const messages = {
        'mic-denied': 'Microphone is off. Tap to try again. Double-tap to leave.',
        network: 'No connection. Tap to try again.',
        timeout: 'That took too long. Tap to try again.',
        unknown: 'Could not hear you. Tap to try again.',
      }
      await this.stopStt()
      await this.show({ kind: 'status', text: messages[transcript.error] }, token)
      return
    }
    if (transcript.error === 'no-speech' || !transcript.text.trim()) {
      if (this.cue === 3) { this.record(); await this.nextItem(); return }
      this.escalate()
      if (await this.showCurrent(token)) this.run(() => this.listen(token))
      return
    }
    // T-313: short background noise and speech tagged as the partner's don't
    // count as attempts — they kept auto-escalating the cue at G3. Absent
    // `speaker` means the wearer (contract v4).
    const utteranceMs = transcript.tEndMs - transcript.tStartMs
    const ignoredReason = transcript.speaker === 'other'
      ? 'other-speaker'
      : utteranceMs < 300 ? 'too-short' : null
    if (ignoredReason) {
      this.ctx.log('step1 ignored', { reason: ignoredReason, ms: utteranceMs })
      if (await this.showCurrent(token)) this.run(() => this.listen(token))
      return
    }
    this.result!.attempts++
    const match = matchWord(transcript.text, this.current.entry.word, 1)
    this.phase = 'feedback'
    if (match.ok) {
      this.result!.solvedAtCue = this.cue
      this.record()
      if (await this.show({ kind: 'feedback', ok: true, word: this.current.entry.word }, token)) {
        this.later(1500, token, () => this.nextItem())
      }
    } else {
      if (this.cue === 3) this.wrongAtFull++
      const exhausted = this.wrongAtFull >= 3
      if (exhausted) this.record()
      if (await this.show({ kind: 'feedback', ok: false, word: transcript.text }, token)) {
        this.later(1200, token, async () => {
          if (exhausted) { await this.nextItem(); return }
          this.escalate()
          this.phase = 'active'
          if (await this.showCurrent(token)) this.run(() => this.listen(token))
        })
      }
    }
  }

  private async save(session: Session): Promise<boolean> {
    if (session.saved) return true
    session.saving ??= (async () => {
      const record: SessionRecord = {
        mode: 'step1', startedAt: session.startedAt, endedAt: session.endedAt,
        items: session.items.map(item => ({ ...item })),
      }
      try {
        await this.ctx.store.saveSession(record)
        session.saved = true
        return true
      } catch (error) {
        this.ctx.log('step1.error', { action: 'save', error: String(error) })
        return false
      }
    })()
    const saved = await session.saving
    if (!saved) session.saving = undefined
    return saved
  }

  private async finishSession(token: number) {
    if (!this.valid(token)) return
    this.phase = 'saving'
    this.session.endedAt ??= this.ctx.now()
    await this.stopStt()
    if (!this.valid(token)) return
    if (!await this.save(this.session)) {
      if (!this.valid(token)) return
      this.phase = 'save-error'
      await this.show({ kind: 'status', text: 'Could not save progress. Tap to try again.' }, token)
      return
    }
    if (!this.valid(token)) return
    this.phase = 'summary'
    const solved = this.session.items.filter(item => item.solvedAtCue !== null).length
    const noHelp = this.session.items.filter(item => item.solvedAtCue === 0).length
    await this.show({ kind: 'status', text: `Done! ${solved} of ${this.items.length}. ${noHelp} without help. Tap for more, double-tap to leave.` }, token)
  }

  private async leave() {
    if (!this.live || this.phase === 'leaving') return
    this.phase = 'leaving'
    ++this.generation
    this.clearTimer()
    this.off?.()
    this.off = undefined
    if (this.attempted) this.record()
    this.session.endedAt ??= this.ctx.now()
    await this.stopStt()
    if (this.session.items.length) await this.save(this.session)
    if (!this.live) return
    this.live = false
    this.ctx.leave?.()
  }
}

/** Independent instances keep tests and mode re-entry from sharing session state. */
export function createPracticeMode(options: { random?: () => number } = {}): Mode {
  let active: Practice | undefined
  return {
    id: 'step1', title: 'Practice',
    async enter(ctx) {
      const previous = active
      const next = new Practice(ctx, options.random ?? Math.random)
      active = next
      await previous?.exit()
      if (active === next) await next.enter()
    },
    async exit() {
      const previous = active
      active = undefined
      await previous?.exit()
    },
  }
}

export default createPracticeMode()
