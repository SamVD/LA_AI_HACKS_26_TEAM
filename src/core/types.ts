// Nudge shared contracts. Owned by ORCH; every other lane only reads this file.
//
// Change rule: additive changes only. Bump CONTRACT_VERSION, note it in
// TASKS.md, and tell every lane to rebase. See docs/CONTRACTS.md for the
// semantics behind each type.
//
// This file holds types and constants only. No runtime logic, no SDK imports.

export const CONTRACT_VERSION = 4 as const

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Touchpad gestures mapped by src/glasses/ (T-101):
 * click = SELECT, swipe down = NEXT, swipe up = PREV, double-click = BACK.
 * On the root page, double-click opens the system exit dialog instead of BACK.
 */
export type Intent = 'SELECT' | 'NEXT' | 'PREV' | 'BACK'

/**
 * Step 1 `cue`: 1 = visual (picture or mouth shape), 2 = letters (`c_p`), 3 = full word.
 * Steps 2-3 `candidates` (CONTRACT_VERSION 3, D18): 1 = first letter + blanks (`s _ _ _ _`),
 * 2 = half the word (`s u n _ _`, first ceil(n/2) letters), 3 = full word. No pictures or
 * mouth shapes in Steps 2-3.
 */
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
  /**
   * CONTRACT_VERSION 4 (T-314): who spoke, when the audio layer can tell (by loudness on
   * the glasses mic). Absent = unknown; treat it as the wearer.
   */
  speaker?: Speaker
}

/** The glasses wearer, or someone else the mic picked up (the conversation partner). */
export type Speaker = 'wearer' | 'other'

export interface SpeechState {
  speaking: boolean
  tMs: number
  /** CONTRACT_VERSION 4 (T-314): who started this speech burst, when known. Absent = unknown. */
  speaker?: Speaker
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
  /**
   * Steps 2-3 (CONTRACT_VERSION 3, T-208): end the current rolling segment now instead of
   * waiting for the speaker's pause, and resolve once its final transcript has been emitted
   * through `onTranscript` (or right away when nothing is buffered). Never rejects. Callers
   * cap the wait themselves. Optional: services without it behave as before.
   */
  flush?(): Promise<void>
}

/**
 * Pixel data for one glasses image container (CONTRACT_VERSION 2).
 * Produced by src/content/ (T-106), sent by src/glasses/ (T-101) through
 * `updateImageRawData`. `width` and `height` must equal the container size.
 */
export interface GreyImage {
  key: string
  width: number
  height: number
  /** PNG bytes, greyscale line art on black. The SDK converts it to 4-bit grey. */
  png: Uint8Array
}

/** Returns the image for `key` rendered at exactly width x height, or null if there is none. */
export type ImageSource = (key: string, width: number, height: number) => Promise<GreyImage | null>

/**
 * Minimal persistent key-value storage (CONTRACT_VERSION 2). src/glasses/
 * provides one over the SDK's get/setLocalStorage; src/store/ builds Store on
 * top of it and also runs on an in-memory implementation in tests.
 */
export interface KeyValueStore {
  /** Resolves null when the key does not exist. */
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
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
  /**
   * Ask the app shell to leave this mode and return to the launcher
   * (CONTRACT_VERSION 2). The shell then calls `Mode.exit()`. Call it on BACK
   * at the mode's top level. Optional so plain mock contexts stay valid; call
   * it as `ctx.leave?.()`.
   */
  leave?(): void
}

export type ModeId = 'step1' | 'step2' | 'step3'

export interface Mode {
  id: ModeId
  title: string
  enter(c: ModeContext): Promise<void>
  /** Must clear every timer and subscription the mode created. */
  exit(): Promise<void>
}

// ---------------------------------------------------------------------------
// App shell (CONTRACT_VERSION 2)
// ---------------------------------------------------------------------------

export interface ModeInfo {
  id: ModeId
  title: string
  /** False when the mode's flag is off (step2Enabled / step3Enabled). */
  enabled: boolean
}

/**
 * The running app, as seen by the phone companion UI (src/phone/). Built by
 * src/glasses/ (T-101) in production; src/phone/ builds a mock-backed one for
 * development. The glasses launcher menu is the root screen: a double-click
 * there opens the system exit dialog.
 */
export interface AppShell {
  modes(): ModeInfo[]
  /** Leaves the active mode (if any), then enters `id`. */
  startMode(id: ModeId): Promise<void>
  /** Leaves the active mode and shows the launcher. */
  leaveMode(): Promise<void>
  activeMode(): ModeId | null
  /** Called with every Screen sent to the glasses, for the phone-side preview. */
  onScreen(cb: (s: Screen) => void): Unsubscribe
  /** The most recent Screen, or null before the first one. */
  lastScreen(): Screen | null
  store: Store
}
