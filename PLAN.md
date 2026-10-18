# Nudge: Master Plan (Even G2, UCLA AI Hackathon)

_Last updated: Sat Oct 17, 2026, about H9:15, by ORCH. Decisions taken since the draft are in Section 13._

Nudge is a quiet word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses. It runs as a web app (Vite + TypeScript) inside the Even phone app's WebView. Steps 1-3 are in scope for this hackathon. Steps 4-5 are backlog.

---

## 1. Facts this plan rests on

Everything here comes from the Even Hub docs, the LA Hacks Even starter pack, and the tracks page.

| Fact | Consequence |
|---|---|
| G2 apps are web apps (HTML/TS) hosted in a WebView in the Even phone app. | **No native phone app.** The "phone app vs web app" question is settled: it's one web app. |
| Display is 576x288 per eye, monochrome green. Images are greyscale only. No arbitrary pixel drawing. No camera, no speaker. | All visuals are text plus small greyscale images. Mouth shapes and pictures must be pre-made line art. |
| Mic: glasses mic or phone mic. Both deliver 16 kHz mono signed 16-bit PCM to the app via `onEvenHubEvent` (`event.audioEvent`). S-3 on the real G2: the glasses mic is cleaner (floor −38 to −42 dBFS, 50 ms chunks) and reliable; the phone mic started 1 time in 3. | We own the speech-to-text step. The `asr` template's STT is a placeholder. **Use the glasses mic (D7).** |
| IMU gives raw x/y/z only. No head-tilt gesture exists. S-3: ~10 samples/s in g; look up/down separates on x (+0.30 / −0.25 g), left/right did not separate. | Head tilt is derived by us, so it is a stretch task, not core, and up/down only (D9). |
| Touchpad: click, double-click, swipe up, swipe down, long-press. Long-press can collide with the OS contextual menu. | Core input = click / swipe / double-click. Do not depend on long-press. |
| One container per page captures events. Root-page double-tap triggers the system exit confirmation. | We need an event-capturing container even when the screen looks blank. Design "Back" around the system exit. |
| Network calls need manifest permissions AND the API server's CORS config. | Keys and CORS are best handled by a small server-side proxy (see Section 5, `api/`). |
| QR prototype mode is broken on Even's side (confirmed at the booth, H7; `docs/BETA_RESULTS.md`). | The glasses only run **packaged Beta builds** (pack → upload → Me → Beta tester, minutes per cycle). Iterate in the simulator; gate flags are set at pack time. |
| ElevenLabs Scribe (S-1, `spikes/stt/FINDINGS.md`): batch ~300 ms p50 per word; realtime WebSocket works from WebKit; CORS `*`; single-use tokens; autocorrects non-words into real words; keyterms bias strongly; auto language detection misfires on short clips. | `api/stt` mints tokens only. Step 1 = batch, Steps 2-3 = realtime. Never bias Step 1 grading toward the target. Always send `language_code=en`. See Section 13. |
| Delivery = LA Hacks Devpost **and** an EvenHub Beta `.ehpk` upload. Beta test must survive a 5-minute phone lock, permission denial, and root-page double-tap exit. | Package early and often. Run the Beta checklist at every gate. |
| Judging (Even): Made for G2, Originality, User Experience, Technical Execution. Theme: "Quiet Tech". | A display that stays blank until it is needed is the product thesis. Protect it. |
| The Even sponsor table closes at 8 PM Saturday (H8) and reopens at 9 AM Sunday. Overnight help is Discord only. | Do every device-dependent unknown (Phase 0 spikes) before H8. |
| **One G2 for four developers.** | Simulator + mock services + an on-screen Screen preview are required so three people can work while one holds the glasses. |

---

## 2. Scope and worst-case product

The five-step training ladder (from the Nudge sheets):

1. **Step 1, Practice.** Fill-in-the-blank prompt ("You drink from a ____."). The user says the word and gets a check or X. Cues escalate: picture, then partial word `c_p`, then full word. Mic + STT + fuzzy match + feedback.
2. **Step 2, Assist.** During a real conversation the user asks for help (touchpad). Suggested words and pictures appear. Swipe cycles suggestions. Cues escalate: mouth shape for the first sound, then first letter, then the whole word.
3. **Step 3, Ambient.** No request needed. After a lull the glasses suggest words on their own, and key words (names, places, topics) are kept available.
4. (Backlog) Record without showing text; flag mumbled words and show the corrected word.
5. (Backlog) Detect missing filler words and suggest sentence completions.

**Worst-case guarantee.** Steps 1 and 2 are the product. Step 3 is strictly additive and behind a flag that defaults OFF until it passes its gate. At every gate the `main` branch is a demoable, packageable build. If Step 3 never works, we ship the Step 2 tag.

---

## 3. Architecture

```
G2 mic ─(PCM 16k)→ src/audio ──→ SttService ──→ transcripts + speech state
                                      │                 │
                                      ▼                 ▼
                              src/ai/stall (S3)   src/ai/predictor (Gemini)
                                      │                 │
                                      └──→ src/modes/stepN ←── src/store (word bank, progress)
                                                │
                                      Screen (plain data)
                                                │
                              ┌─────────────────┴───────────────┐
                              ▼                                 ▼
                    src/glasses (SDK renderer)        src/phone (Screen preview + companion UI)
                              │
                    G2 display  ←→  touchpad → Intent (SELECT/NEXT/PREV/BACK)
```

Design rules that make parallel work safe:

- **Modes never touch the SDK.** A mode receives a `ModeContext` of interfaces (`ui`, `stt`, `predictor`, `store`, `clock`) and emits `Screen` objects (plain data). Only `src/glasses/` turns a `Screen` into SDK containers. So every mode is testable in plain Node and viewable in the phone-side preview without glasses.
- **Every service has a mock.** `?svc=mock` swaps in scripted transcripts (from `fixtures/conversations/`), a canned predictor, and an in-memory store. Steps 2 and 3 can be built with no mic, no network, and no G2.
- **Modes are plug-ins that are pre-registered.** Phase 0 registers `step1`, `step2`, `step3` as stubs in `src/modes/index.ts`. After that, nobody edits the registry again.
- **Cues are a ladder shared by all steps** (`src/glasses/` owns the component). Level 1 is visual (picture in Step 1, mouth shape in Steps 2-3). Level 2 is letters (partial word `c_p` in Step 1, first letter in Steps 2-3). Level 3 is the full word.
- **Speculative prediction (Steps 2-3).** On every final transcript segment, refresh a cached candidate list in the background, so the help tap or auto-hint displays instantly instead of waiting on a model call.
- **Step 1 uses utterance-level STT**: record until end-of-speech, then one batch request (`scribe_v2`, raw PCM, `language_code=en`, **no target keyterm**). **Steps 2-3 use a rolling transcript** over the realtime WebSocket (`scribe_v2_realtime`, VAD commits, personal-bank keyterms). S-1 confirmed it works from a WebKit WebView. The chunked-batch fallback stays ready until a packaged build proves `wss://` passes the Even whitelist. Speech state (`onSpeechState`) comes from local VAD on the PCM, never from STT (it lags ~1 s).
- **Privacy default:** audio is never stored. Transcripts live in memory only. The word bank stays on-device.

---

## 4. Contracts (draft; `T-001` makes these real, then they are frozen)

```ts
// src/core/types.ts  (CONTRACT_VERSION = 1)
export type Intent = 'SELECT' | 'NEXT' | 'PREV' | 'BACK';   // click / swipe down / swipe up / double-click
export type CueLevel = 1 | 2 | 3;                            // visual / letters / full word

export interface WordEntry {
  id: string; word: string;
  category: 'object' | 'food' | 'person' | 'place' | 'medication' | 'other';
  frames: string[];            // sentence frames with ____ for Step 1
  imageKey?: string;           // greyscale picture asset
  firstSound?: string;         // override for mouth-shape lookup (names, meds)
  tags: string[];
}
export interface Transcript { text: string; isFinal: boolean; tStartMs: number; tEndMs: number }
export interface Suggestion { word: string; confidence: number; imageKey?: string; mouthKey?: string; source: 'bank' | 'model' }

export type Screen =
  | { kind: 'blank' }                                        // event-capturing, nothing visible
  | { kind: 'prompt'; sentence: string }
  | { kind: 'cue'; level: CueLevel; word: string; imageKey?: string; mouthKey?: string; masked?: string; sentence?: string }
  | { kind: 'feedback'; ok: boolean; word: string }
  | { kind: 'candidates'; items: Suggestion[]; index: number; level: CueLevel }
  | { kind: 'menu'; title: string; items: string[]; index: number }
  | { kind: 'status'; text: string };

export interface GlassesUI {
  show(s: Screen): Promise<void>;
  onIntent(cb: (i: Intent) => void): () => void;
}
export interface SttService {
  start(): Promise<void>; stop(): Promise<void>;
  onTranscript(cb: (t: Transcript) => void): () => void;
  onSpeechState(cb: (s: { speaking: boolean; tMs: number }) => void): () => void;
  transcribeUtterance(o: { maxMs: number; endSilenceMs: number; targetHint?: string }): Promise<Transcript>;
}
export interface PredictRequest {
  transcriptTail: string; stalledAfter: string; bank: WordEntry[];
  place?: { lat: number; lon: number; label?: string }; n: number;
}
export interface PredictorService { predict(r: PredictRequest, signal?: AbortSignal): Promise<Suggestion[]> }
export interface Store {
  getBank(): Promise<WordEntry[]>; addWord(w: WordEntry): Promise<void>;
  saveSession(r: { mode: string; startedAt: number; items: unknown[] }): Promise<void>;
}
export interface ModeContext {
  ui: GlassesUI; stt: SttService; predictor: PredictorService; store: Store;
  now(): number; log(event: string, data?: unknown): void; flags: Flags;
}
export interface Mode { id: 'step1' | 'step2' | 'step3'; title: string; enter(c: ModeContext): Promise<void>; exit(): Promise<void> }
export interface Flags { step2Enabled: boolean; step3Enabled: boolean; imuEnabled: boolean; mockServices: boolean }
```

**Contract change rule.** Only the orchestrator edits `src/core/`. Changes are additive. Bump `CONTRACT_VERSION`, note it in `TASKS.md`, and tell every lane to rebase. A builder who needs a contract change stops and says so in its reply.

---

## 5. Repo layout and ownership

Lanes: **ORCH** (orchestrator, Claude Opus), **GLASS** (Claude Code #2), **AI** (Claude Code #3), **UI** (Cursor), **LOGIC** (Codex / ChatGPT).

| Path | Owner | Notes |
|---|---|---|
| `src/core/`, `src/config.ts`, `src/main.ts`, `src/modes/index.ts`, `package.json`, lockfile, `app.json`, `vite.config.*`, `.github/` | ORCH | Frozen after Phase 0. New dependencies are requested in a PR description; ORCH installs them in one batch. |
| `src/glasses/` (renderer, input mapper, cue ladder, lifecycle) | GLASS | |
| `src/glasses/imu/` (head-tilt stretch) | GLASS | Flag `imuEnabled`, default off. |
| `src/modes/step2/` | GLASS | Hardest on-device integration. |
| `src/audio/` (capture, VAD, STT adapters) | AI | |
| `src/ai/predictor/`, `src/ai/stall/` | AI (stall) / LOGIC (predictor impl) | See `TASKS.md`; paths are disjoint. |
| `src/modes/step3/` | AI | |
| `api/` (serverless: `api/stt` = single-use token minter only, no audio; `api/predict` = Gemini proxy) | AI | Keeps keys out of the bundle. ElevenLabs allows CORS `*`, so audio goes from the WebView straight to ElevenLabs with a token. |
| `src/matching/`, `src/store/`, `src/content/`, `src/modes/step1/`, `src/ai/keywords/` | LOGIC | Pure logic, data, assets, tests. |
| `src/phone/` (companion UI, Screen preview) | UI | |
| `fixtures/`, `scripts/` | LOGIC | `scripts/check-ownership.*` is LOGIC; `OWNERS.json` content is ORCH. |
| `docs/`, `PLAN.md`, `TASKS.md` | ORCH | `docs/vendor/` is read-only reference. |
| `spikes/<name>/` | the spike's author | Never imported by `src/`. |

`OWNERS.json` maps branch prefix (`orch/`, `glass/`, `ai/`, `ui/`, `logic/`) to allowed path globs. CI fails any PR that touches a path outside its lane. This enforces ownership mechanically instead of by trust.

---

## 6. Git workflow: how nothing breaks when branches merge

1. **Two long-lived branches.** `integration` takes audited PRs. `main` only ever holds a known-good build and is fast-forwarded from `integration` at gates. Tags (`v0.1-step1`, `v0.2-step2`, `v0.3-step3`) are rollback points.
2. **One task = one branch = one PR**, named `<lane>/<slug>` (for example `glass/step2-mode`). PRs target `integration`.
3. **Exclusive edit ownership per task.** Anyone can READ anything. A task edits only the paths listed on its card, and no two open tasks list the same path. CI enforces it with `check-ownership`.
4. **Contract-first.** Phase 0 lands interfaces, mocks, stub modes, and registry before any feature work. Features are built against mocks, so lanes never block on each other's real code.
5. **Feature flags default OFF** for anything unfinished (`step2Enabled`, `step3Enabled`, `imuEnabled`). Merging half-built work cannot change Steps 1-2 behavior.
6. **CI on every PR:** typecheck, lint, unit tests, production build, ownership check. A PR with red CI is not reviewed.
7. **Rebase on `integration` before opening the PR.** No force-push to `integration` or `main`.
8. **Single-writer files** (`package.json`, lockfile, `app.json`, `main.ts`, registry) have one owner, so lockfile and registry conflicts cannot happen.
9. **Secrets:** `.env.local` is gitignored. `.env.example` lists variable names. Server-side keys live in the hosting provider's env settings only.
10. **Gate = merge to `main` + tag + `.ehpk` upload + G2 smoke test.** See `docs/G2_SMOKE.md` (ORCH writes it in Phase 0 from the Beta requirements: 5-minute lock/resume, permission denial, root double-tap exit, plus the main flow).

---

## 7. Team and tool lanes

Your subscriptions: 3 Claude Pro, 1 Cursor, 1 ChatGPT Plus (Codex). Four people. **I'm assuming H1-H3 each hold a Claude Pro and H4 holds Cursor + ChatGPT. Fill in names in `OWNERS.json`.**

| Lane | Person | Tool | Why this tool | Never does |
|---|---|---|---|---|
| ORCH | H1 | Claude (planning model) | Specs, contracts, prompt design, audits, integration, G-gate decisions | Bulk code, mass edits |
| GLASS | H2 | Claude Code + Even plugin | Precise SDK work, on-device debugging, simulator automation, packaging | |
| AI | H3 | Claude Code + Even plugin | Audio pipeline, STT adapter, stall detection (subtle, latency-sensitive) | |
| UI | H4 | Cursor | Iterative, visual, many-file UI work you watch live | Backend logic |
| LOGIC | H4 | Codex / ChatGPT | Self-contained, testable, parallelizable tasks: pure logic, fixtures, assets, tests, scripts | On-device debugging |

Practical notes:
- **Claude Pro usage limits will bite** during a 24-hour build. Keep builder tasks small, and use the cheaper model option for Claude Code builders if your plan offers one. Reserve the strongest model for ORCH specs and audits.
- **Even's Claude plugin** (`/plugin marketplace add even-realities/everything-evenhub`, then `/plugin install everything-evenhub`) goes on GLASS and AI. Cursor and Codex may not be able to load a Claude Code plugin, so Phase 0 copies the plugin's skill markdown into `docs/vendor/even-skills/` and every builder prompt says to read it first.
- H4 runs two tools. Codex tasks are fire-and-forget (self-contained, run async). Cursor is the interactive lane. Keep Codex tasks queued ahead.
- **Device baton:** one G2. GLASS holds it by default. Hand it off for smoke tests at gates. Everyone else uses the simulator + Screen preview.

---

## 8. Phases and gates (hackathon hours; now = H5, deadline = H24)

| Phase | Hours | Goal | Gate |
|---|---|---|---|
| **0 Foundation** | H5 to H6:15 | Scaffold runs on sim and real G2, contracts + mocks + stubs + CI + ownership check, first `.ehpk` in Beta, three risk spikes (STT, predictor prompt, on-device audio/IMU) | `integration` builds; hello-world on G2; spikes reported |
| **1 Step 1 slice** | H6:15 to H10 | Step 1 end-to-end on real G2 | **G1:** prompt, say word, check/X, cues, 10 prompts, survives lock/resume. Tag `v0.1`. Beta uploaded. |
| **2 Step 2** | H10 to H14:30 | User asks for help, suggestions, swipe, ladder, success detection | **G2:** works in a live two-person conversation. Tag `v0.2`. **This is the guaranteed product.** |
| **3 Step 3** | H14:30 to H18 | Auto-hints after lull, key words, settings; head tilt as parallel stretch | **G3:** 10-minute soak without false-hint spam. Flag default ON only if it passes. Tag `v0.3`. |
| **4 Harden + ship** | H18 to H22 | No new features. Beta final, demo mode, judge flow, Devpost, rehearsal | Devpost + Beta submitted by **H22**. H22-H24 is buffer. |

Sleep: plan a rotation so the people who run the demo and the Beta packaging are rested for H18-H24. GLASS and ORCH should sleep first, during Phase 2's long STT/predictor tuning if possible.

---

## 9. Fallback ladder (degrade, never die)

| If this fails | Then |
|---|---|
| Step 3 unreliable | Ship `v0.2` (Steps 1-2). Step 3 stays flagged off. |
| Streaming STT unusable from the WebView, or `wss://` blocked by the Even whitelist on the device | Steps 2-3 use VAD-segmented chunks sent to batch STT (~300 ms per segment, same `SttService` interface). |
| Gemini slow, down, or rate-limited (free tier: 15 req/min) | The throttle (D11) keeps us under the cap. Otherwise the predictor falls back to the v2 bank-only ranking (`PREDICTOR_PROMPT.md` §7), which returns `[]` rather than noise when nothing fits. |
| ElevenLabs fails | Swap the adapter behind `SttService`. Last resort: manual-override tap so a helper confirms the word. |
| STT mangles aphasic speech (autocorrects to a real word: S-1 saw cop→Cough, medsin→Medicine) | Fuzzy matcher strictness setting; "helper override" tap (Step 1). **Do not** pass the target as a keyterm by default: it turns near-misses into the target (spun→Spoon), which gives false "correct" results (decision D1). |
| Glasses unavailable or flaky | Simulator + Screen preview in the phone page for the demo. |
| Head tilt unreliable | It is a stretch task behind `imuEnabled`. Touchpad stays primary. |
| Venue network blocks the phone-to-laptop LAN link | Test with the packaged Beta build, which uses the hosted proxy rather than your laptop's IP. |

---

## 10. Test strategy

- **Unit (Vitest):** matcher table tests, Step 1 engine, stall detector against fixture timelines, predictor against the eval set (accuracy at top-3), store.
- **Simulator automation (GLASS):** screenshot and input-injection checks for each Screen kind.
- **Screen preview (UI):** renders any `Screen` as a 576x288 green-on-black canvas in the phone page. It doubles as a dev tool and a demo backup.
- **G2 smoke (`docs/G2_SMOKE.md`):** run at every gate on real hardware, from the Beta checklist.
- **Audit:** the Kyniq checklist, adapted. Spec compliance and ownership. Correctness. Data safety (no audio persisted, no keys in the bundle, LLM output validated against a schema). Integration (contract version). Display fit (576x288, event-capture container present). Lifecycle (lock/resume, exit).

---

## 11. Sponsor plan

| Challenge | How Nudge qualifies | Cost |
|---|---|---|
| **Even Realities** (core) | Quiet Tech: display blank until a stall. Judged on Made for G2, Originality, UX, Technical Execution. | Core |
| **MLH Best Use of Gemini API** | Gemini powers word prediction (T-201). | Built in |
| **MLH Best Use of ElevenLabs** | Scribe powers STT (T-104, T-202). | Built in |
| **Paper: Best Designed Hack** (up to $1,500) | Design pass on the companion UI and glasses layouts (T-006, T-404). | Verify whether using the Paper tool is required. |
| Main track | Beyond the Digital (AR / emerging interfaces) or Applied Intelligence (accessibility, healthcare). | Pick one, see open decisions. |

Not targeted: Sentry, Cognition, StepFun, and the rest. Adding any of them adds work to the critical path.

---

## 12. Open decisions (defaults proposed; tell me to change any)

1. **Step 3 key words.** Your Step 3 sheet says to "keep key words up", but your idea doc says the display stays blank until a stall. **Default:** key words appear only after a stall (as a short strip with the first suggestion), preserving "blank until needed". Change if you want a persistent strip.
2. **Proxy hosting.** **Default:** Vercel serverless functions in `api/`, keys in Vercel env. This avoids shipping API keys in a client bundle and handles CORS.
3. **Predictor model.** **Default:** a Gemini Flash-class model (the fast tier), confirmed against the current Gemini docs by the builder.
4. **Picture source.** **Default:** pre-bundled greyscale line icons for the ~30-word bank plus mouth-shape set; words without a picture show text only. The alternative (generating images at runtime) adds latency and risk.
5. **Phone page visibility.** We assume the WebView page is visible on the phone, so the companion UI has somewhere to render. Spike S-3 confirms it.
6. **Main track:** Beyond the Digital vs Applied Intelligence.
7. **GitHub:** repo URL, and whether you can enable branch protection and CODEOWNERS enforcement (needs admin). Otherwise the CI ownership check plus discipline has to do it.
8. **Names for H1-H4** and which person is orchestrator.
9. **Step 3 thresholds** (silence length, hints per minute) are starting guesses. They are tuned against fixtures and live tests, not fixed here.

---

## 13. Decisions log

| ID | When | Decision | Why / evidence |
|---|---|---|---|
| D1 | H8 (S-1) | **Step 1 does not send `targetHint` as an STT keyterm by default.** T-104 keeps the `targetHint` field in `UtteranceOptions` but ignores it unless a future lenient mode is switched on (not planned for this hackathon). | Keyterms turn near-misses and slurred attempts into the target (spun→Spoon, cuh→Cup, cop→Cup), giving false "correct" results in a practice tool. Without keyterms, batch got 12/12 clean words right. `spikes/stt/FINDINGS.md` Q6. |
| D2 | H8 (S-1) | **Steps 2-3 send the personal bank (names, medications, places; ≤50 terms of ≤20 chars) as realtime keyterms, never the current candidates.** | Fixes names and drug names ("Maya", "Lisinopril"). Biasing toward on-screen candidates would make Step 2's "user said the word → clear the display" fire falsely. |
| D3 | H8 (S-1) | **`api/stt` is a single-use token minter only** (`POST /api/stt/token {type}` → `{token}`), with an origin allow-list and a per-IP rate limit. No audio passes through our servers. | ElevenLabs serves CORS `*`, and its WebSocket accepts any origin with a token. Smaller, cheaper, and keeps "audio is never stored" trivially true. Reference: `spikes/stt/token-server.mjs`. |
| D4 | H8 (S-1) | **`app.json` gets the `network` whitelist when T-104 lands**: `https://api.elevenlabs.io`, `wss://api.elevenlabs.io` (scheme matching to verify on the device), and the hosted `api/` origin, plus the mic permission S-3 picks. ORCH makes this edit. | Packaged builds enforce permissions. The whitelist does not bypass CORS (`docs/vendor/even-skills/build-and-deploy`). |
| D5 | H8 (S-1) | **Always send `language_code=en`. Drop empty realtime commits. Speech state comes from local VAD.** | Auto-detect returned French, Portuguese, Javanese and Chinese on short English clips. VAD sends an empty commit about every 35 s of silence. STT lags about 1 s. |
| D6 | H7 | **Device testing uses packaged Beta builds.** | QR prototype mode is broken on Even's side (`docs/BETA_RESULTS.md`). |
| D7 | H9 (S-3) | **Use the glasses mic only** (`AudioInputSource.Glasses`), and declare only `g2-microphone` in `app.json`. The phone mic is not a default; any fallback to it needs a retry and a timeout. | On the real G2 the glasses mic had a lower noise floor (−38 to −42 vs −30 dBFS), equal or better SNR, and 50 ms chunks. `audioControl(true, Phone)` returned `false` 2 of 3 times, and the one success took >5 s. `spikes/device/FINDINGS.md` §1. |
| D8 | H9 (S-3) | **Detect lock and background with `document.visibilitychange`.** SDK foreground events are optional extras; don't use `setBackgroundState` / `onBackgroundRestore` (they're not in SDK 0.0.12). On hidden, flush the store; on visible, re-show the last Screen. | With the phone locked, the WebView kept running (no reload, timers fired) and the glasses mic streamed with no gaps over 1 s. `FOREGROUND_EXIT/ENTER` never fired; only `visibilitychange` did. §5. |
| D9 | H9 (S-3) | **T-305 head tilt is look up / look down only** (→ PREV / NEXT), calibrated on mode entry, with a ±0.15 g dead zone on x. Left/right is out unless a second run separates it. | Up/down was clear on x; tilt left and tilt right both moved y negative. §2. |
| D10 | H9 (S-3) | **`app.json` version is now 0.2.0.** Every Beta upload under `com.lahacks.nudge` (including spike builds) must use a version higher than the last one uploaded. | The S-3 probe was uploaded as 0.1.2 under Nudge's package ID; the repo was still at 0.1.0. |
| D11 | H9 (S-2) | **Gemini: `gemini-3.5-flash-lite` with minimal thinking, few-shot Examples 1-7, 1.2 s timeout. Stay on the free tier and throttle every call** (`PREDICTOR_PROMPT.md` v2 §10): prefetch at most 1 per 5 s and ≤12/min, 3 slots/min reserved for help taps, a tap never waits, and a 429 is never retried. T-201 ports `spikes/predictor/throttle.mjs`; T-204 and T-302 call only the throttle (`onFinal`, `onHelp`), never `predict` directly. | S-2: top-3 0.98 few-shot, p95 ~880 ms before the proxy. The free tier allows **15 requests/min per project per model**, and unthrottled prefetch hits 429 within a minute. The throttle passed simulation and a 3-minute live run with 0 429s. The daily cap is unknown, so billing would remove the risk; the throttle stays either way. |
| D12 | H9 (S-2) | **Fallback v2** (`PREDICTOR_PROMPT.md` §7): don't boost non-name words already said; penalise words just said or rejected; add a partial-word prefix rule; check category cues over the last 8 words without fillers; return `[]` when nothing scores. | The v1 rules suggested "fork" right after "not a fork", and "tea" above "cup". Users see the fallback more often because of the rate limit. |
| D13 | H9 | **`dropSamples` stays `false` for the hackathon**: predictor requests keep the `sample` personal entries (Maya, Dr. Velrin, the sample meds), even though `PREDICTOR_PROMPT.md` §4 says to drop them in production builds. | The Beta demo depends on personal names and medications, and real personal words come in through T-206. Revisit after the hackathon. |
| D14 | H10 (T-203) | **Predictor client timeout 1.5 s** (was 1.2 s). Real predictor wired in `src/main.ts` against `VITE_PREDICT_URL` (`.env.production`), shared instance, `resolveAssets` for pictures and mouth shapes; `MockPredictor` only under `?svc=mock`. | T-203 measured p95 ~1.15 s client total through Vercel (Gemini ~0.95 s inside the function), above the ~1.1 s threshold set in `PREDICTOR_PROMPT.md` §2. |

