# Phase 1 builder prompts

Copy each block into the named teammate's tool. Each one stands alone. Every builder starts from the latest `integration` (`git fetch && git checkout -b <branch> origin/integration`).

**Contracts are now CONTRACT_VERSION 2** (additive): `AppShell`, `ModeInfo`, `ModeContext.leave?()`, `GreyImage`, `ImageSource`, `KeyValueStore`. See the "Version 2" section of `docs/CONTRACTS.md`. `@evenrealities/pretext@0.1.4` is installed for text measurement.

| Prompt | Lane | Tool | Order / depends on |
|---|---|---|---|
| 1. T-101 Glasses renderer, input, shell, lifecycle | GLASS (Sarah) | Claude Code + Even plugin | After S-3 and the T-002 checks (before H8) |
| 2. S-2 Gemini predictor spike | AI | Claude Code | After S-1 |
| 3. T-103 Fuzzy matcher | LOGIC | Codex | First in the LOGIC queue |
| 4. T-106 Assets, content API, store | LOGIC | Codex | Second (can run in parallel with T-103) |
| 5. T-102 Step 1 mode | LOGIC | Codex | Third: start once T-103 and T-106 are merged |
| 6. T-105 Phone companion v1 and Screen preview | UI | Cursor | Now |

Interfaces that cross lanes in this phase:
- T-101 builds the `AppShell`; T-105 consumes it through `mountCompanion(root, shell)`. T-105 develops against its own mock shell, so neither waits.
- T-106 exports `getImage: ImageSource` and `createStore(kv: KeyValueStore, ...)`; T-101 provides the SDK `KeyValueStore` and calls `getImage`. T-101 runs text-only until T-106 merges.
- T-102 imports `matchWord` from `src/matching` (T-103) and `resolveAssets` from `src/content` (T-106).

---

## 1. T-101: glasses renderer, input mapper, app shell, lifecycle (GLASS)

````text
ROLE: You are implementing one task for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

TASK T-101: Glasses renderer, input mapper, app shell, lifecycle
BRANCH: create and work only on `glass/renderer` from `origin/integration`. Open a PR into `integration`. Never commit to `main` or `integration`. CI (typecheck, test, build, check-ownership) must be green.
CONTEXT: Read PLAN.md (Section 3) and TASKS.md (your card). Read src/core/types.ts (CONTRACT_VERSION 2: Screen, Intent, GlassesUI, AppShell, ModeContext.leave, GreyImage, ImageSource, KeyValueStore) and docs/CONTRACTS.md. Read docs/design/GLASSES_LAYOUTS.md (container geometry per Screen kind; note the ORCH correction in §6: menus are ONE text container with a "> " marker, not a list container) and docs/DISPLAY_LIMITS.md. Read docs/vendor/even-skills/ (sdk-reference, glasses-ui, handle-input, background-state, font-measurement, simulator-automation) before writing SDK code; do not guess SDK signatures. Read the current src/main.ts, src/modes/index.ts, src/config.ts and src/mocks/.
SPEC:
  1. src/glasses/bridge.ts: wrap the bridge so every call is serialized through one queue with a timeout (about 5 s; log and continue on timeout). Image updates are also serialized, and a stale image (from a Screen that has since been replaced) is skipped.
  2. src/glasses/layout.ts: a PURE function `layoutScreen(screen): PageSpec` that returns plain container descriptions (text / image containers with id, name ≤16 chars, x, y, w, h, content, isEventCapture, imageKey) following GLASSES_LAYOUTS.md. No SDK imports in this file, so it is unit-testable. Rules: exactly one event-capture text container per page; `blank` = full-screen text container with content ' '; one fixed font, so emphasis comes from layout only (cue L2 shows letters spaced like "c _ p" from `masked`; candidates L2 shows the first letter of items[index].word); feedback uses "√" / "×" plus "Yes" / "Try again", never ✓ / ✗; candidates show "1/3"-style position text; menu = title line plus one item per line, "> " before items[index] and two spaces before the others, windowed to 8 items around index; status wraps text. Use `measureTextWrap` / `getTextWidth` from `@evenrealities/pretext` to wrap or approximate centering (x = container x + (inner width - text width) / 2). Content ≤ 1000 characters.
  3. src/glasses/ui.ts: `createGlassesUI(bridge, opts: { images?: ImageSource })` implements GlassesUI. The first show() uses createStartUpPageContainer (exactly once); later shows use rebuildPageContainer when the container set changes and textContainerUpgrade when only text changes (same layout). Text first: show() resolves once the text is on the glasses, then images load (getImage at the container size) and are sent with updateImageRawData. If `images` is missing or returns null, render text-only.
  4. src/glasses/input.ts: map hub events to Intent. sysEvent click (eventType undefined or 0) = SELECT; double-click (3) = BACK; textEvent 1 (swipe up) = PREV; textEvent 2 (swipe down) = NEXT. Keep the existing envelope logic and the comments from main.ts (CLICK_EVENT arrives as undefined; check double-click before click). Ignore audioEvent and listEvent.
  5. src/glasses/shell.ts: `createShell({ ui, modes, flags, makeContext, store, exitApp })` implements AppShell (src/core/types.ts).
     - Root screen = launcher `menu` Screen: title "Nudge", one item per mode from `modes()` where enabled (Step 1 always; Step 2 and 3 only when their flags are on). NEXT/PREV move the index, SELECT starts the mode, and BACK (double-click) at the launcher calls `exitApp()` (main.ts passes `() => bridge.shutDownPageContainer(1)`).
     - While a mode is active, give the mode a ModeContext whose `ui` forwards intents only to that mode and records every Screen; `leave()` calls shell.leaveMode(). leaveMode() calls mode.exit(), stops STT, and shows the launcher. startMode() leaves any active mode first.
     - onScreen/lastScreen mirror every Screen the glasses get (launcher included), for the phone preview.
  6. src/glasses/storage.ts: `createBridgeKeyValue(bridge): KeyValueStore` over getLocalStorage / setLocalStorage (getLocalStorage returns '' for a missing key → resolve null).
  7. src/glasses/lifecycle.ts: on FOREGROUND_ENTER, re-show lastScreen. Register setBackgroundState / onBackgroundRestore (see the background-state skill) with { activeMode, lastScreen } and re-show on restore. On SYSTEM_EXIT / ABNORMAL_EXIT, leaveMode(), stop STT, and unsubscribe. Do not clean up before shutDownPageContainer(1), since the user may cancel.
  8. src/main.ts (granted to this branch only): replace the "Hello Nudge" counter with: bridge, then createGlassesUI(bridge, { images: getImage from src/content if src/content/index.ts exports it on integration when you rebase, otherwise none }), then createShell with contexts built from src/mocks for stt and predictor (real services land in T-104 / T-201), store = MemoryStore seeded from src/content/words.json (or T-106's createStore over createBridgeKeyValue if T-106 has merged), then show the launcher. If src/phone/index.ts exports mountCompanion when you rebase, call mountCompanion(document.getElementById('app')!, shell); otherwise leave a one-line TODO and ORCH wires it at G1.
  9. Tests (Vitest, no SDK in tests: inject a fake bridge): layout rules for every Screen kind (one event-capture container, ≤12 containers, ≤4 images, names ≤16 chars, content ≤1000 chars, no ✓/✗); the longest frame in src/content/words.json fits the prompt container without overflow (measured with pretext); input mapping table; shell routing (root BACK calls exitApp, mode BACK does not, leave() returns to the launcher, flags hide modes); upgrade vs rebuild decision; stale image skipped.
READ FIRST: src/core/types.ts, docs/CONTRACTS.md, docs/design/GLASSES_LAYOUTS.md, docs/DISPLAY_LIMITS.md, docs/vendor/even-skills/{sdk-reference,glasses-ui,handle-input,background-state,font-measurement,simulator-automation}/SKILL.md, src/main.ts, src/mocks/index.ts. You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: src/glasses/** (excluding src/glasses/imu/), src/main.ts (branch grant for glass/renderer). Do not edit any other file. If you believe another file must change (including src/core/, package.json, or another lane's files), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA:
  - [ ] Each Screen kind renders in the simulator; attach a screenshot per kind (simulator-automation skill) to the PR.
  - [ ] Intents arrive correctly from simulator input injection (click, double-click, swipe up, swipe down).
  - [ ] Launcher shows on boot; selecting Step 1 shows "step1 not built yet" (or the real Step 1 if T-102 has merged); double-click inside the mode returns to the launcher via the mode or the stub; double-click at the launcher opens the system exit dialog.
  - [ ] No text overflows on the longest sentence in words.json (unit test with pretext).
  - [ ] Works on the real G2: launcher, a mode, back, exit; a 5-minute phone lock resumes on the same screen.
  - [ ] typecheck, test, build pass; CI green.
CONSTRAINTS: no new dependencies (pretext is already installed; request others in the PR description); only src/glasses/ and src/main.ts import the Even SDK, and modes never do; no secrets or audio committed; keep style consistent with surrounding code (2-space indent, no semicolons, single quotes); the screen is 576x288 monochrome green, so check layouts against docs/DISPLAY_LIMITS.md.
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
````

---

## 2. S-2: Gemini predictor spike (AI)

````text
ROLE: You are implementing one task for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

TASK S-2: Spike, Gemini predictor against fixtures
BRANCH: create and work only on `ai/spike-predictor` from `origin/integration`. Open a PR into `integration`. Never commit to `main` or `integration`.
CONTEXT: Read docs/PREDICTOR_PROMPT.md completely (prompt version 1: system prompt, input format, responseSchema, client validation, fallback, worked examples). Read src/core/types.ts (PredictRequest, Suggestion), fixtures/predictor-eval.json (25 cases, with no bank field) and src/content/words.json (the bank). Use the CURRENT Gemini API documentation for the endpoint, the fastest Flash-class model ID, structured output (responseMimeType + responseSchema), and how to minimise or disable thinking. Do not rely on memory for API details; cite the doc URLs you used in FINDINGS.md.
SPEC:
  1. spikes/predictor/eval.mjs (Node 20, built-ins and fetch only): for each eval case, build a PredictRequest with bank = all of words.json (KEEP the `sample` entries here: they are the personal names and medications the cases test), build the user turn exactly as PREDICTOR_PROMPT.md Section 4 says, call Gemini with the Section 3 system prompt and the Section 2 generation config, then apply the Section 6 client validation.
  2. Measure per configuration: top-1 accuracy and top-3 accuracy (intendedWord, or any word in `acceptable`, among the validated suggestions, case-insensitive); p50 and p95 latency (request start to parsed response; also report time to first byte); JSON validity before validation; items dropped by validation; error and timeout counts at 1.2 s.
  3. Configurations: (a) prompt v1 zero-shot; (b) prompt v1 plus Examples 1-7 as few-shot turns; (c) the Section 7 bank-only fallback alone (implement it in the spike, no model). Run each model config at least 2 times over all 25 cases and report the spread.
  4. Report results by fixture `shape`, and list the 5 worst misses with the model's raw output.
  5. Recommend concrete prompt changes to ORCH (do not edit docs/PREDICTOR_PROMPT.md), the model ID, whether to ship the few-shot examples, and whether 1.2 s is a realistic timeout.
  Keep GEMINI_API_KEY in your shell env or .env.local (gitignored). Never commit it, never write it into a file under spikes/, never log it.
READ FIRST: docs/PREDICTOR_PROMPT.md, src/core/types.ts, fixtures/predictor-eval.json, src/content/words.json. You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: spikes/predictor/** only. Do not edit any other file. If you believe another file must change (including docs/PREDICTOR_PROMPT.md, src/, or package.json), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA:
  - [ ] spikes/predictor/FINDINGS.md has a results table (configs × top-1, top-3, p50, p95, JSON validity, timeouts at 1.2 s) and a per-shape breakdown.
  - [ ] It confirms the model ID with a doc link and gives concrete prompt-change recommendations.
  - [ ] Raw results saved as spikes/predictor/results/*.json (no keys in them).
CONSTRAINTS: no new dependencies; spikes are never imported by src/; no secrets or API keys committed; keep style consistent with surrounding code (2-space indent, no semicolons, single quotes).
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
````

---

## 3. T-103: fuzzy matcher (LOGIC)

````text
ROLE: You are implementing one task for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

TASK T-103: Fuzzy matcher
BRANCH: create and work only on `logic/matcher` from `origin/integration`. Open a PR into `integration`. Never commit to `main` or `integration`. CI must be green.
CONTEXT: Read PLAN.md (Section 2, Step 1) and TASKS.md (your card). Step 1 asks the user to say a target word; speech-to-text returns a transcript that may include fillers ("um", "uh"), repeats, the word inside a sentence ("it's a cup"), near-miss sounds from aphasia ("cop" for cup), or an STT mis-hearing. The matcher decides whether the attempt counts. Targets come from src/content/words.json and can be multi-word ("ice cream", "Dr. Velrin", "Sunrise Clinic").
SPEC:
  1. src/matching/index.ts exports:
     - `normalize(text): string`: lowercase, strip punctuation except inner apostrophes and hyphens (hyphens become spaces), collapse whitespace, trim.
     - `phoneticCode(word): string`: a small, documented, metaphone-style code (handle at least: silent initial k/g/p before n; ph→f; ck/c/q→k; soft c before e/i/y→s; soft g before e/i/y→j; sh/ch→x; th→0; drop non-initial vowels; collapse repeated letters). Hand-written, no dependencies.
     - `editDistance(a, b): number` (Levenshtein).
     - `matchWord(transcript: string, target: string, strictness: 0 | 1 | 2): { ok: boolean; score: number; heard: string }`. `heard` = the transcript token or n-gram that best matched (n = number of words in the target). `score` in [0, 1].
  2. Matching rules, checked on every n-gram of the normalized transcript against the normalized target (ignore fillers um, uh, er, erm, hmm, like and a leading article a, an, the). Tolerate a simple plural (s / es) at every level.
     - strictness 2 (exact): exact n-gram match only.
     - strictness 1 (default): exact; OR edit distance ≤ 1 for targets of 5-7 letters, ≤ 2 for 8 or more; OR equal phoneticCode when the target has 4 or more letters. For targets of 3-4 letters, only exact or a plural.
     - strictness 0 (lenient, for aphasia practice): everything in 1, plus edit distance ≤ 1 for 3-4 letter targets when the first letter matches, plus equal phoneticCode at any length.
     Document every threshold in a comment table at the top of the file and in src/matching/README.md.
  3. Table test with at least 40 cases in src/matching/matching.test.ts, including: cup vs "cup", "the cup", "cup uh", "um cup", "cups", "it's a cup" (ok at all levels); cup vs "cop" (ok at 0; not ok at 1 and 2); cat vs "cap" (ok at 0; not ok at 1 and 2); spoon vs "spoom" (ok at 0 and 1; not ok at 2); banana vs "nana" (not ok at any level); "ice cream" vs "I want ice cream" (ok at all); "Dr. Velrin" vs "doctor velrin" (ok at 0 and 1, by expanding dr→doctor in normalize); knife vs "nife" (phonetic: ok at 1); phone vs "fone" (ok at 1); a wrong word in the same category: fork vs "spoon" (not ok anywhere); an empty transcript (not ok, score 0).
READ FIRST: src/core/types.ts, src/content/words.json, TASKS.md (T-103 card). You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: src/matching/** only. Do not edit any other file. If you believe another file must change (including src/core/ or package.json), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA:
  - [ ] All 40+ table cases pass; thresholds documented in code and README.
  - [ ] Pure functions, no dependencies, no SDK imports.
  - [ ] typecheck, test, build pass; CI green.
CONSTRAINTS: no new dependencies; no SDK imports; keep style consistent with surrounding code (2-space indent, no semicolons, single quotes).
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
````

---

## 4. T-106: picture and mouth-shape assets, content API, store (LOGIC)

````text
ROLE: You are implementing one task for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

TASK T-106: Picture and mouth-shape assets, content API, store
BRANCH: create and work only on `logic/assets-store` from `origin/integration`. Open a PR into `integration`. Never commit to `main` or `integration`. CI must be green.
CONTEXT: Read PLAN.md (Sections 2-3: cue level 1 shows a picture in Step 1 and a mouth shape for the first sound in Steps 2-3) and TASKS.md (your card). Read src/core/types.ts (CONTRACT_VERSION 2: WordEntry, GreyImage, ImageSource, KeyValueStore, Store, SessionRecord) and docs/CONTRACTS.md. Read docs/DISPLAY_LIMITS.md (images 20-288 × 20-144, 4-bit greyscale; the SDK converts PNG for us) and docs/design/GLASSES_LAYOUTS.md (cue L1 picture box 200x120, candidates L1 box 180x108). There is no image tool in the repo and we add no dependencies, so assets are SVG files rasterized at runtime in the WebView with a canvas.
SPEC:
  1. Pictures: src/content/assets/pictures/<entry id>.svg for each of the 30 non-sample entries in src/content/words.json. Simple, recognisable line art: white (#fff) strokes on a transparent background, stroke width 2-3 at a 24x24 viewBox (or equivalent), no text, no gradients, no external references, no scripts. Either draw them yourself (original) or copy from a permissively licensed icon set (for example Lucide, ISC, or Tabler Icons, MIT), and recolor them. Record every source and license in src/content/assets/LICENSES.md, including the license text for any third-party set. Nothing with an unclear license.
  2. Mouth shapes: src/content/assets/mouth/<key>.svg, 8-10 front-view mouth line drawings, keys: lips-closed (p b m), lip-teeth (f v), rounded (w oo o), open (a ah), wide (ee i), teeth-together (s z), tongue-teeth (th), tongue-up (t d n l), back (k g ng and hard c), pucker (sh ch j zh), and optionally r. Same style rules as the pictures.
  3. src/content/index.ts exports:
     - `builtinBank(): WordEntry[]` (words.json, typed).
     - `mouthKeyFor(entry: WordEntry): string | undefined`: from `firstSound` if set, otherwise from the start of `word`, with digraphs first (th, sh, ch, ph→lip-teeth, wh→rounded, kn→tongue-up, wr→rounded or r, ps→teeth-together), then hard/soft c and g before e/i/y, then the single letter. A word starting with a vowel → open, wide or rounded by vowel. Unknown → undefined.
     - `resolveAssets(entry: WordEntry): { imageKey?: string; mouthKey?: string }`: imageKey = entry.imageKey ?? entry.id when a picture SVG exists for it, otherwise undefined (text-only); mouthKey from mouthKeyFor. Picture keys are entry ids; mouth keys are prefixed "mouth:" (for example "mouth:lips-closed") so one ImageSource serves both.
     - `getImage: ImageSource`: load the SVG text for the key via `import.meta.glob('./assets/**/*.svg', { query: '?raw', import: 'default' })`, rasterize it in the browser (Image from an SVG data URL, drawn on a canvas, OffscreenCanvas when available) at exactly width x height on a black background, fit inside with about 8 px padding while keeping the aspect ratio, centered; export PNG bytes (canvas.toBlob or convertToBlob) and resolve `{ key, width, height, png }`. Cache by key+size. Resolve null for an unknown key, and resolve null (never throw) when there is no DOM/canvas (Node tests). Clamp width to 20-288 and height to 20-144.
  4. Store: src/store/index.ts exports `memoryKeyValue(): KeyValueStore` and `createStore(kv: KeyValueStore, builtin: WordEntry[], opts?: { debounceMs?: number; maxSessions?: number }): Store & { flush(): Promise<void> }`.
     - getBank = builtin entries (minus removed ids) + added entries (an added entry with the same id replaces a builtin one). addWord upserts; removeWord on a builtin id records a tombstone.
     - Persist under keys `nudge.bank.v1` ({ added: WordEntry[], removed: string[] }) and `nudge.sessions.v1` (SessionRecord[], newest first, capped at maxSessions, default 50). Load lazily on first call.
     - Debounce writes (default 500 ms; the SDK storage shares the BLE link); `flush()` writes immediately. Corrupt JSON in storage → start empty for that key and keep working (never throw).
     - No SDK imports: T-101 provides the KeyValueStore over the SDK.
  5. Tests (Vitest, Node): every non-sample bank entry resolves an imageKey whose SVG exists and parses (has a viewBox, no <script>, no external href); mouthKeyFor table of at least 25 words (including Dr. Velrin with firstSound v, lisinopril, metformin, knife, phone, cheese, shoe, thumb, water, apple, egg, orange, gum, giraffe, cat, city); getImage resolves null in Node without throwing; store tests (upsert, tombstone, sessions order and cap, debounce plus flush, corrupt JSON, filter by mode).
  No scripts/make-assets is needed (runtime rasterization replaces it); note this in the PR.
READ FIRST: src/core/types.ts, docs/CONTRACTS.md, docs/DISPLAY_LIMITS.md, docs/design/GLASSES_LAYOUTS.md, src/content/words.json, src/mocks/store.ts (the in-memory Store to match behaviour). You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: src/content/assets/**, src/content/index.ts, src/content/*.test.ts, src/store/**. Do not edit src/content/words.json or any other file. If you believe another file must change (including src/core/ or package.json), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA:
  - [ ] Every non-sample bank word resolves to an image key with an SVG; there are 8-10 mouth shapes.
  - [ ] Asset licenses documented in LICENSES.md.
  - [ ] Store and content tests pass; getImage is safe in Node.
  - [ ] Manual browser check: a scratch page (not committed) shows a few rendered PNGs at 200x120 and 180x108 white-on-black; describe it in the PR (a screenshot is welcome).
  - [ ] typecheck, test, build pass; CI green.
CONSTRAINTS: no new dependencies; no SDK imports in src/content/ or src/store/; no secrets committed; keep style consistent with surrounding code (2-space indent, no semicolons, single quotes); images must respect docs/DISPLAY_LIMITS.md.
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
````

---

## 5. T-102: Step 1 mode (LOGIC). Start after T-103 and T-106 are merged.

````text
ROLE: You are implementing one task for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

TASK T-102: Step 1 engine and mode (Practice)
BRANCH: create and work only on `logic/step1-mode` from `origin/integration` (which must already contain T-103 src/matching and T-106 src/content). Open a PR into `integration`. Never commit to `main` or `integration`. CI must be green.
CONTEXT: Read PLAN.md (Section 2, Step 1) and TASKS.md (your card). Read src/core/types.ts (CONTRACT_VERSION 2: Mode, ModeContext including leave?(), Screen, Transcript with error codes, SessionRecord) and docs/CONTRACTS.md (never-reject rules, use ctx.now() not Date.now(), exit() must clear every timer and subscription). Use `matchWord` from src/matching and `resolveAssets` from src/content. The mode is pure TypeScript against ModeContext only: no SDK, no DOM.
SPEC: replace the stub in src/modes/step1/index.ts. Keep `export default` a Mode with id 'step1' and title 'Practice'.
  1. Session: on enter(), load ctx.store.getBank(); use entries that have frames and do NOT have the tag "sample". Pick 10 items: rotate categories (object, food, place, …), no repeated word in a session, a random frame per item (inject randomness via an optional seedable RNG for tests).
  2. Per item, the ladder state is cue 0 (the prompt) through cue 3. Screens: cue 0 = { kind: 'prompt', sentence: frame }; cue 1 = { kind: 'cue', level: 1, word, imageKey, sentence } (skip to cue 2 when resolveAssets gives no imageKey); cue 2 = { kind: 'cue', level: 2, word, masked, sentence }; cue 3 = { kind: 'cue', level: 3, word, sentence }. masked = the first letter + one "_" per hidden letter + the last letter (cup → "c_p", spoon → "s___n"); spaces and hyphens stay visible; words of 2 letters or fewer show the first letter plus "_".
  3. Listening: while an item is active, loop `ctx.stt.transcribeUtterance({ maxMs: 8000, endSilenceMs: 1200, targetHint: word })`. Use a generation counter so results that arrive after a skip, a new item, or exit() are ignored. Evaluate with matchWord(text, word, 1).
     - ok → show { kind: 'feedback', ok: true, word }, record solvedAtCue = the current cue, then after 1500 ms the next item.
     - wrong word → { kind: 'feedback', ok: false, word: heard text }, attempts++, after 1200 ms re-show the current cue screen and keep listening. After 3 wrong attempts at cue 3: unsolved, next item.
     - error 'no-speech' (silence): escalate one cue automatically; at cue 3, mark unsolved and go to the next item.
     - error 'mic-denied' | 'network' | 'timeout' | 'unknown' → { kind: 'status', text } with a plain message ("Microphone is off. Tap to try again. Double-tap to leave." / "No connection. Tap to try again."). SELECT retries; BACK leaves.
  4. Intents (subscribe with ctx.ui.onIntent, unsubscribe on exit): SELECT during cue 0-2 escalates one cue (the in-flight utterance keeps going and is still evaluated); NEXT skips the item (skipped: true); PREV is ignored; BACK saves the session if at least one item was attempted, then calls `ctx.leave?.()`.
  5. Per-item result: { wordId, word, frame, solvedAtCue: 0 | 1 | 2 | 3 | null, attempts, skipped, ms }. After item 10: save with ctx.store.saveSession({ mode: 'step1', startedAt, endedAt, items }), then show { kind: 'status', text: 'Done! <solved> of 10. <noHelp> without help. Tap for more, double-tap to leave.' }. SELECT starts a new session; BACK leaves.
  6. Log key events with ctx.log ('step1.item', 'step1.result', 'step1.error').
  7. exit(): clear every timer, unsubscribe, bump the generation; it must be safe to call twice.
READ FIRST: src/core/types.ts, docs/CONTRACTS.md, src/matching/ (README and index.ts), src/content/index.ts, src/mocks/ (MockUI, MockStt with `utterances`, createMockContext with its controllable clock), src/modes/index.ts. You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: src/modes/step1/** only. Do not edit any other file. If you believe another file must change (including src/core/, src/mocks/, src/matching/, or package.json), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA (Vitest with MockUI, MockStt, MemoryStore, fake timers):
  - [ ] Correct word at cue 0 → feedback ok, solvedAtCue 0, auto-advance.
  - [ ] Two SELECTs, then correct → solvedAtCue 2, and the cue screens were shown in order with the right masked string.
  - [ ] A wrong word, then NEXT → skipped, the next item's prompt shown, and the late transcript ignored.
  - [ ] Silence escalates through the cues and ends unsolved.
  - [ ] mic-denied → status screen; SELECT retries.
  - [ ] A 10-item session completes and saveSession is called with 10 items; BACK mid-session calls leave and saves the partial session.
  - [ ] exit() leaves no pending timers (vi.getTimerCount() === 0) and no SDK imports.
  - [ ] typecheck, test, build pass; CI green.
CONSTRAINTS: no new dependencies; modes never import the Even SDK; no secrets or audio committed; keep style consistent with surrounding code (2-space indent, no semicolons, single quotes); text must fit the 576x288 screen (frames are already ≤55 characters).
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
````

---

## 6. T-105: phone companion v1 and Screen preview (UI)

````text
ROLE: You are implementing one task for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

TASK T-105: Phone companion v1 and Screen preview
BRANCH: create and work only on `ui/companion-v1` from `origin/integration`. Open a PR into `integration`. Never commit to `main` or `integration`. CI must be green.
CONTEXT: Read PLAN.md (Sections 3 and 10: the Screen preview is a dev tool and the demo backup) and TASKS.md (your card). Read src/core/types.ts (CONTRACT_VERSION 2: AppShell, ModeInfo, Screen, Store, SessionRecord) and docs/CONTRACTS.md. The phone page is the Even app's WebView; the glasses app shell (T-101, in progress) will call your `mountCompanion(root, shell)`. Reuse your T-006 work in src/phone/theme/ (tokens, applyPhoneTheme, glassesCanvas palette) and follow docs/design/GLASSES_LAYOUTS.md for the preview (note the ORCH correction in §6: a menu is one text container with "> " before the selected item). Users are stroke survivors and caregivers: large type, high contrast, calm, one primary action per view.
SPEC:
  1. src/phone/index.ts exports `mountCompanion(root: HTMLElement, shell: AppShell): () => void` (returns cleanup). Plain TypeScript + DOM, no framework.
  2. Views (single page, a simple tab or segmented control, all at least 56 px tap targets):
     - Home / launcher: a card per shell.modes() entry (disabled ones shown greyed with "Coming soon"); "Start" calls shell.startMode(id); while a mode is active, show "Stop" (shell.leaveMode()).
     - Live preview: the latest Screen (shell.lastScreen(), then shell.onScreen) rendered by the preview component, with the Screen kind shown below it in small text.
     - Step 1 summary: the newest store.getSessions('step1') record: solved count, solved without help (solvedAtCue 0), and a simple list of words with the cue level each needed (items are `unknown[]`: read them defensively).
     - Word bank (read-only): store.getBank(), grouped by category; entries in the person or medication category, or tagged "sample", are marked "Personal".
  3. Preview component: src/phone/preview/renderScreen.ts exports `renderScreen(screen: Screen, opts?: { imageUrl?: (key: string) => string | null }): string`, returning a 576x288 SVG string drawn to look like the glasses (black background, green text from glassesCanvas, ONE text size representing the 27 px line, left-aligned, container geometry from GLASSES_LAYOUTS.md, "√"/"×" for feedback, "c _ p" spacing for cue L2, "> " menu marker, image boxes as a thin outline with the key when there is no image URL). It scales to the container width (viewBox) and escapes all text. This is the real-content preview; the T-006 renderGlassesSketch stays as the wireframe tool.
  4. Dev harness (no glasses, no SDK): src/phone/dev/devShell.ts builds an AppShell from src/modes (registry) and src/mocks (createMockContext with a recording UI that feeds onScreen, MemoryStore seeded from src/content/words.json), so "Start Step 1" works in a plain browser. src/phone/dev/index.html + main.ts mount the companion with the dev shell at http://localhost:5173/src/phone/dev/index.html, with a "Playlist" button that cycles the preview through every Screen kind (reuse sketchScreens from src/phone/theme plus cue L1/L3 and candidates L3).
  5. Do NOT import src/glasses/ or @evenrealities/even_hub_sdk anywhere in src/phone/.
  6. Tests (Vitest, Node, pure functions only): renderScreen for all 7 kinds (valid 576x288 SVG, escapes "<", menu marker on the selected item, no ✓/✗, one font-size); devShell (modes listed with flags, startMode shows the step1 screen through onScreen, leaveMode returns to null activeMode); session summary math from a fixture SessionRecord.
READ FIRST: src/core/types.ts, docs/CONTRACTS.md, docs/design/GLASSES_LAYOUTS.md, src/phone/theme/ (your T-006 code), src/mocks/index.ts, src/modes/index.ts, src/content/words.json. You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: src/phone/** only. Do not edit any other file (index.html and src/main.ts are ORCH/GLASS; T-101 or ORCH calls mountCompanion). If you believe another file must change (including src/core/ or package.json), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA:
  - [ ] The preview renders all 7 Screen kinds from the playlist in the dev page.
  - [ ] The launcher starts Step 1 against mocks in the dev page, and the preview updates live.
  - [ ] The layout works at 375 px width with no horizontal scroll, in light and dark themes.
  - [ ] Tests pass; no SDK or src/glasses imports in src/phone/.
  - [ ] typecheck, test, build pass; CI green.
CONSTRAINTS: no new dependencies, no UI framework, no CDN fonts (request in the PR description); no secrets committed; keep style consistent with surrounding code (2-space indent, no semicolons, single quotes); the preview must match docs/DISPLAY_LIMITS.md (576x288, one font size, left-aligned).
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
````
