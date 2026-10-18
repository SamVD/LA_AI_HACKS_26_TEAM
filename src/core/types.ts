// Nudge shared contracts. Owned by ORCH; every other lane only reads this file.
//
// Change rule: additive changes only. Bump CONTRACT_VERSION, note it in
// TASKS.md, and tell every lane to rebase. See docs/CONTRACTS.md for the
// semantics behind each type.
//
// This file holds types and constants only. No runtime logic, no SDK imports.

export const CONTRACT_VERSION = 1 as const

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Touchpad gestures mapped by src/glasses/ (T-101):
 * click = SELECT, swipe down = NEXT, swipe up = PREV, double-click = BACK.
 * On the root page, double-click opens the system exit dialog instead of BACK.
 */
export type Intent = 'SELECT' | 'NEXT' | 'PREV' | 'BACK'

/** 1 = visual (picture or mouth shape), 2 = letters, 3 = full word. */
export type CueLevel = 1 | 2 | 3

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export type WordCategory = 'object' | 'food' | 'person' | 'place' | 'medication' | 'other'

export interface WordEntry {
  /** Stable, unique, lowercase slug, for example `cup` or `p-maya`. */
  id: string
  /** Display form. Proper names keep their capitals. */
  word: string
  category: WordCategory
  /** Step 1 sentence frames. Each contains exactly one `____`. */
  frames: string[]
  /** Greyscale picture asset key (see src/content/). */
  imageKey?: string
  /** Override for mouth-shape lookup, for names and medications. */
  firstSound?: string
  /** Free-form lowercase tags, for example `kitchen`, `morning`, `daughter`, `sample`. */
  tags: string[]
}

// ---------------------------------------------------------------------------
// Speech
// ---------------------------------------------------------------------------

/** Why an STT call produced no usable text. Modes show these as a `status` Screen. */
export type SttErrorCode = 'mic-denied' | 'network' | 'timeout' | 'no-speech' | 'unknown'

export interface Transcript {
  text: string
  isFinal: boolean
  /** Milliseconds on the ModeContext clock (`now()`). */
  tStartMs: number
  tEndMs: number
  /** Set only when the call failed. `text` is then `''`. */
  error?: SttErrorCode
}

export interface SpeechState {
  speaking: boolean
  tMs: number
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

export type SuggestionSource = 'bank' | 'model'

export interface Suggestion {
  word: string
  /** 0..1, higher is more likely. */
  confidence: number
  imageKey?: string
  mouthKey?: string
  /** `bank` when the word matches a WordEntry, otherwise `model`. */
  source: SuggestionSource
}

export interface PredictRequest {
  /** The last ~30 words of conversation, ending where the user stalled. */
  transcriptTail: string
  /** The last 1-6 words the user said before stalling (a suffix of transcriptTail). */
  stalledAfter: string
  bank: WordEntry[]
  place?: { lat: number; lon: number; label?: string }
  /** Maximum number of suggestions wanted (normally 3). */
  n: number
}

// ---------------------------------------------------------------------------
// Screens (plain data; only src/glasses/ turns them into SDK containers)
// ---------------------------------------------------------------------------

export type Screen =
  /** Event-capturing, nothing visible. */
  | { kind: 'blank' }
  /** Step 1 sentence frame with `____`. */
  | { kind: 'prompt'; sentence: string }
  | {
      kind: 'cue'
      level: CueLevel
      word: string
      imageKey?: string
      mouthKey?: string
      /** Partial word for level 2, for example `c_p`. */
      masked?: string
      sentence?: string
    }
  | { kind: 'feedback'; ok: boolean; word: string }
  | { kind: 'candidates'; items: Suggestion[]; index: number; level: CueLevel }
  | { kind: 'menu'; title: string; items: string[]; index: number }
  | { kind: 'status'; text: string }

export type ScreenKind = Screen['kind']

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

/** Every `on*` method returns an unsubscribe function. */
export type Unsubscribe = () => void

export interface GlassesUI {
  /** Resolves once the screen is on the glasses (or the preview). Calls are serialized. */
  show(s: Screen): Promise<void>
  onIntent(cb: (i: Intent) => void): Unsubscribe
}

export interface UtteranceOptions {
  /** Hard cap on recording length. */
  maxMs: number
  /** Stop after this much silence once speech has started. */
  endSilenceMs: number
  /** The expected word, used for STT biasing if the provider supports it. */
  targetHint?: string
}

export interface SttService {
  /** Opens the mic and starts the rolling transcript (Steps 2-3). */
  start(): Promise<void>
  stop(): Promise<void>
  onTranscript(cb: (t: Transcript) => void): Unsubscribe
  onSpeechState(cb: (s: SpeechState) => void): Unsubscribe
  /** Step 1: record one utterance and transcribe it. Never rejects; failures set `error`. */
  transcribeUtterance(o: UtteranceOptions): Promise<Transcript>
}

export interface PredictorService {
  /** Never rejects; on timeout or invalid model output it returns bank-only suggestions. */
  predict(r: PredictRequest, signal?: AbortSignal): Promise<Suggestion[]>
}

export interface SessionRecord {
  mode: ModeId
  startedAt: number
  endedAt?: number
  /** Mode-specific per-item results. */
  items: unknown[]
}

export interface Store {
  getBank(): Promise<WordEntry[]>
  /** Upsert by `id`: adds a new entry or replaces the one with the same id. */
  addWord(w: WordEntry): Promise<void>
  removeWord(id: string): Promise<void>
  saveSession(r: SessionRecord): Promise<void>
  /** Most recent first. */
  getSessions(mode?: ModeId): Promise<SessionRecord[]>
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

export interface Flags {
  step2Enabled: boolean
  step3Enabled: boolean
  imuEnabled: boolean
  mockServices: boolean
}

export interface ModeContext {
  ui: GlassesUI
  stt: SttService
  predictor: PredictorService
  store: Store
  /** Milliseconds. Use this, not Date.now(), so tests can control time. */
  now(): number
  log(event: string, data?: unknown): void
  flags: Flags
}

export type ModeId = 'step1' | 'step2' | 'step3'

export interface Mode {
  id: ModeId
  title: string
  enter(c: ModeContext): Promise<void>
  /** Must clear every timer and subscription the mode created. */
  exit(): Promise<void>
}
