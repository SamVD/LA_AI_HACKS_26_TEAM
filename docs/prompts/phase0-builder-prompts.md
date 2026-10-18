# Phase 0 builder prompts

Copy each block into the named teammate's tool. Each one stands alone.

> **Update (H7):** QR prototype mode is broken on Even's side (`docs/BETA_RESULTS.md`). Wherever a prompt below says `npx evenhub qr`, use a packaged build instead. For S-3, follow the "Packaging a spike page" steps in `README.md` → "Run on the real G2". Every builder starts from the latest `integration` (`git fetch && git checkout -b <branch> origin/integration`).

| Prompt | Lane | Tool | Can start |
|---|---|---|---|
| 1. GLASS: finish T-002, then S-3 | GLASS (Sarah) | Claude Code + Even plugin | Now. **Must finish before H8** (Even table closes) |
| 2. S-1 ElevenLabs STT spike | AI | Claude Code + Even plugin | Now |
| 3. T-003 Foundation | LOGIC | Codex | Now |
| 4. T-004 Fixtures and word bank | LOGIC | Codex | Now, in parallel with T-003 |
| 5. T-006 Design tokens and layouts | UI | Cursor | Now |

T-003 and T-004 run in parallel but share one data shape: the **conversation fixture format**. Both prompts spell it out identically, so neither has to wait for the other.

---

## 1. GLASS: finish T-002, then S-3

````text
ROLE: You are implementing tasks for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

You have the real G2 glasses. The Even sponsor table closes at 8 PM (hackathon hour H8), so everything below must be done before then. Do PART A first (about 20 minutes), then PART B.

=== PART A: finish T-002 (no PR needed unless something has to change) ===
Your scaffold code is merged to `integration` (PR #3). Two acceptance criteria are still open:
1. Real G2 via QR: `npm run dev`, then `npx evenhub qr --url http://<LAN-IP>:5173`, then scan it in the Even app. Confirm "Hello Nudge" shows and a tap logs `[nudge] click event`. If venue Wi-Fi blocks the phone from reaching the laptop, use a phone hotspot.
2. Beta: `npm run pack`, upload `nudge.ehpk` to an EvenHub Beta group, add the team's phone-account emails, and install from Me → Beta tester. Confirm it launches.
Reply with: pass or fail for each, the Beta group name, and anything surprising. If a fix needs code, open `glass/scaffold-fix` with only T-002 files.

=== PART B: S-3 spike, on-device audio and IMU ===
TASK S-3: Spike, on-device audio and IMU
BRANCH: create and work only on `glass/spike-device` from `origin/integration`. Open a PR into `integration`. Never commit to `main` or `integration`.
CONTEXT: Read PLAN.md (architecture, git rules) and TASKS.md (your card). Read src/core/types.ts. Read docs/vendor/even-skills/ (device-features, handle-input, background-state, glasses-ui, sdk-reference) before writing SDK code; do not guess SDK signatures.
SPEC: on the real G2, answer with evidence:
  (1) Capture 10 seconds from the glasses mic (`AudioInputSource.Glasses`) and 10 seconds from the phone mic (`AudioInputSource.Phone`) at normal conversation distance (one person wearing the glasses, one talking from about 1 m away). Report which is cleaner. Compute RMS levels during speech and during silence for each, and the ratio between them (a rough SNR). Then judge by ear: play the audio back on the phone through Web Audio, or save it locally if that is easy. Also note the buffer size and rate of audioEvent frames. Never commit audio.
  (2) Log raw IMU x/y/z (`imuControl(true, ImuReportPace.P500)` or similar per the docs) during: nod left, nod right, look up, look down, plus 10 s of sitting still. Put the logs (text, not audio) in spikes/device/imu/.
  (3) Confirm an event-capturing text container whose content is a single space keeps the glasses visually dark but still receives taps. Nudge's `blank` Screen depends on this.
  (4) Confirm the phone shows the WebView page (index.html content) while the glasses are rendering. The companion UI depends on this.
  (5) With the mic open, lock the phone for 5 minutes, then unlock. Does audio stop? Does it resume on its own? Which lifecycle events (FOREGROUND_EXIT / FOREGROUND_ENTER) arrive and when? Does the page state survive?
  Put the spike page and code under spikes/device/ (for example spikes/device/index.html plus a .ts file), served by the existing Vite dev server at http://<LAN-IP>:5173/spikes/device/index.html and opened via `npx evenhub qr --url ...`. If the mic needs permissions in app.json (`g2-microphone`, `phone-microphone`), add them LOCALLY ONLY, do not commit app.json, and report exactly which ones were needed.
READ FIRST: docs/DISPLAY_LIMITS.md, docs/vendor/even-skills/device-features/SKILL.md, docs/vendor/even-skills/handle-input/SKILL.md, docs/vendor/even-skills/background-state/SKILL.md. You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: spikes/device/** only. Do not edit any other file. If you believe another file must change (including src/core/, package.json, app.json, or another lane's files), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA:
  - [ ] spikes/device/FINDINGS.md answers all five questions with numbers or logs.
  - [ ] FINDINGS.md ends with a section "Changes to PLAN.md", listing anything that changes the plan (for example: use the phone mic, the blank screen needs a different approach, the mic dies on lock).
  - [ ] No audio files committed.
CONSTRAINTS: no new dependencies (request them in the PR description); spikes are never imported by src/; no secrets, no API keys, and no audio committed; never persist audio beyond your local machine; the screen is 576x288 monochrome green.
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
````

---

## 2. S-1: ElevenLabs Scribe STT spike (AI)

````text
ROLE: You are implementing one task for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

TASK S-1: Spike, ElevenLabs Scribe from the WebView
BRANCH: create and work only on `ai/spike-stt` from `origin/integration`. Open a PR into `integration`. Never commit to `main` or `integration`.
CONTEXT: Read PLAN.md (architecture, git rules; especially Section 3 "Step 1 uses utterance-level STT, Steps 2-3 use a rolling transcript") and TASKS.md (your card). Read src/core/types.ts: your recommendation must fit the `SttService` interface (`transcribeUtterance` for Step 1, `onTranscript` + `onSpeechState` for Steps 2-3). Audio from the glasses arrives as 16 kHz mono signed 16-bit little-endian PCM (docs/vendor/even-skills/device-features/SKILL.md). Read docs/vendor/even-skills/build-and-deploy/SKILL.md for the CORS and network-whitelist rules. Use the CURRENT ElevenLabs Speech-to-Text (Scribe) documentation for endpoints, model IDs, auth, and realtime/streaming options. Do not rely on memory for API details; cite the doc URLs you used in FINDINGS.md.
SPEC: answer, with measured numbers and code:
  (1) Batch vs realtime: which works from a browser WebView? Test both from a desktop browser page served by Vite, and if possible from the Even app via `npx evenhub qr --url http://<LAN-IP>:5173/spikes/stt/index.html`.
  (2) Does it need a server-minted token, so that we need `api/`? We must never ship the API key in the client bundle.
  (3) CORS behavior for each endpoint you use, from the browser origin.
  (4) Latency for a 1-3 second single-word clip: report p50 and p95 over at least 10 calls, measured from request start to final text. Report realtime latency to first partial and to final too, if you test realtime.
  (5) Behavior on slurred or partial words. Record yourself saying "cop" for cup, "fo... fork", "spoo", a mumbled "medicine", and so on. Does it autocorrect to a real word? Does it return partials or fillers ("um")?
  (6) Does it accept biasing toward a target word (keyterms, prompt, vocabulary, or similar)? If so, show the effect on the clips from (5).
  Output spikes/stt/FINDINGS.md with a results table and a clear recommendation for Step 1 (utterance) and Steps 2-3 (rolling): which endpoint, whether a proxy or token server is needed, the audio format to send (how to wrap 16 kHz PCM, for example as WAV), and the expected latency.
  Keep the API key in .env.local (already gitignored) or in shell env for a local script. Never commit it, never log it, and never put it in a file under spikes/.
READ FIRST: PLAN.md Sections 3 and 9, src/core/types.ts (SttService, Transcript, SttErrorCode), docs/vendor/even-skills/device-features/SKILL.md, docs/vendor/even-skills/build-and-deploy/SKILL.md. You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: spikes/stt/** only. Do not edit any other file. If you believe another file must change (including src/core/, package.json, app.json, vite.config.ts, or another lane's files), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA:
  - [ ] FINDINGS.md answers all six questions with evidence (numbers, response samples, error messages).
  - [ ] It gives a recommendation for Step 1 and for Steps 2-3, including whether `api/stt` is needed and what it must do.
  - [ ] No API keys and no audio committed (audio clips stay local; *.wav, *.pcm and *.raw are gitignored).
CONSTRAINTS: no new dependencies (request them in the PR description; a spike can use fetch, WebSocket and Node built-ins); spikes are never imported by src/; no secrets, no API keys, and no audio committed; never persist user audio outside your machine.
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
````

---

## 3. T-003: mocks, stub modes, registry, config, CI, ownership check (LOGIC)

````text
ROLE: You are implementing one task for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

TASK T-003: Mocks, stub modes, registry, config, CI, ownership check
BRANCH: create and work only on `logic/foundation` from `origin/integration`. Open a PR into `integration`. Never commit to `main` or `integration`.
CONTEXT: Read PLAN.md (architecture, contracts, git rules) and TASKS.md (your card). Read src/core/types.ts for the contracts and docs/CONTRACTS.md for their semantics (never-reject rules, the ModeContext clock, flag defaults, glob rules). Read docs/vendor/even-skills/ before touching any SDK code; do not guess SDK signatures. Modes and mocks must never import the Even SDK.
SPEC:
  1. src/config.ts: export `readFlags(search = location.search, env = import.meta.env): Flags` and `readInitialMode(...): ModeId`. URL params override env. Mapping: `?svc=mock` or VITE_SVC=mock → mockServices; `?step2=1` or VITE_STEP2=1 → step2Enabled; `?step3=1` / VITE_STEP3 → step3Enabled; `?imu=1` / VITE_IMU → imuEnabled; `?mode=step1|step2|step3` → initial mode (default step1). All flags default false. Pure and testable: no globals read at import time.
  2. src/mocks/:
     - MockUI implements GlassesUI. It records every Screen shown (`screens: Screen[]`, `last()`), and `emit(intent)` delivers an Intent to subscribers. Unsubscribe works.
     - ConsoleUI implements GlassesUI by console.log-ing each Screen as `[nudge:screen]`. main.ts uses it until T-101 lands.
     - MockStt implements SttService. Constructed with a ConversationFixture (format below) and an options object `{ utterances?: string[] }`. `start()` replays `events` with setTimeout at their tMs offsets: `transcript` events go to onTranscript, `speech` events go to onSpeechState. `stop()` cancels pending timers. `transcribeUtterance()` resolves with the next string from `utterances` as a final Transcript after a short delay, or resolves with `{ text: '', error: 'no-speech' }` when the list is exhausted. It never rejects.
     - MockPredictor implements PredictorService. Constructed with `Record<string, Suggestion[]>` keyed by `stalledAfter` (case-insensitive, trimmed). Unknown key → the first `n` bank entries with confidence 0.1 and source 'bank'. An aborted signal → `[]`. Never rejects.
     - MemoryStore implements Store per docs/CONTRACTS.md: addWord upserts by id, getSessions returns most recent first and filters by mode. It can be seeded with WordEntry[].
     - createMockContext(overrides?) returns a ModeContext built from the mocks, with a controllable clock (`now()`) and an in-memory log array.
     Conversation fixture format (T-004 writes files in exactly this shape under fixtures/conversations/; define this type in src/mocks/fixtures.ts and write one small inline fixture for your own tests, since T-004 runs in parallel):
       interface ConversationFixture {
         id: string
         description: string
         events: Array<
           | { tMs: number; type: 'speech'; speaking: boolean }
           | { tMs: number; type: 'transcript'; text: string; isFinal: boolean; tStartMs: number }
         >                    // sorted by tMs; a transcript event's tEndMs is its tMs
         stalls: Array<{
           tMs: number             // when the user stalls
           stalledAfter: string    // last 1-6 words before the stall
           intendedWord: string
           expectedTop3: string[]  // words acceptable as suggestions
           inBank: boolean         // intendedWord exists in src/content/words.json
         }>
       }
  3. src/modes/index.ts: a registry `modes: Record<ModeId, Mode>` plus `getMode(id)`. It registers step1, step2 and step3 from src/modes/stepN/index.ts. Each stub Mode's enter() shows `{ kind: 'status', text: '<id> not built yet' }` and exit() is a no-op. This registry file is never edited again after this task, so import each stub by a stable default export that its owner will later replace.
  4. src/main.ts: keep the existing SDK hello screen and the tap and double-tap exit handling exactly as they are. Add: read Flags and the initial mode from src/config.ts, build a ModeContext (mocks when mockServices is true; otherwise still mocks for stt, predictor and store for now, since real services don't exist yet), use ConsoleUI as `ui`, and enter the initial mode. T-101 will replace ConsoleUI with the real GlassesUI.
  5. .github/workflows/ci.yml: on pull_request and on push to integration and main. Steps: checkout with fetch-depth 0, setup Node 20 with npm cache, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, then (pull_request only) `node scripts/check-ownership.mjs --branch "$GITHUB_HEAD_REF" --base "origin/$GITHUB_BASE_REF"`. NO lint step.
  6. scripts/check-ownership.mjs (plain ESM JavaScript, Node built-ins only): reads OWNERS.json, takes a branch name and a changed-file list (from `git diff --name-only <base>...HEAD`, or from `--files a,b,c` for tests). Allowed = lanes[<prefix>].paths ∪ branchGrants[<full branch>]. It exits 1 and prints each offending file if any file is not allowed, and exits 1 if the branch prefix (text before the first `/`) is not a lane. Glob rules: `**` matches zero or more path segments, `*` matches within one segment (no `/`), everything else is literal. Export the pure function `checkOwnership(owners, branch, files) -> { ok, violations }` for tests.
  7. .github/CODEOWNERS: generate from the `github` fields in OWNERS.json. Skip lanes whose login is "TBD". Paths in CODEOWNERS syntax.
READ FIRST: src/core/types.ts, docs/CONTRACTS.md, OWNERS.json, src/main.ts, package.json, tsconfig.json. You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: src/main.ts, src/config.ts, src/modes/index.ts, src/modes/step1/index.ts, src/modes/step2/index.ts, src/modes/step3/index.ts (stubs only; their owners replace the contents later), src/mocks/**, .github/workflows/ci.yml, .github/CODEOWNERS, scripts/check-ownership.* (tests may live in scripts/check-ownership.test.mjs). Do not edit any other file. If you believe another file must change (including src/core/, package.json, tsconfig.json, or another lane's files), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA:
  - [ ] Vitest: each stub enters from the registry with createMockContext(), shows its status Screen on MockUI, and exits cleanly.
  - [ ] `npm run dev` + `npm run simulate` still boots: the hello screen shows and the console shows `[nudge:screen] { kind: 'status', text: 'step1 not built yet' }`, with no console errors.
  - [ ] MockStt replay test passes: it emits transcripts and speech-state events in fixture order at the right times (use vi.useFakeTimers), stop() cancels them, and transcribeUtterance never rejects.
  - [ ] config tests: defaults are all false; URL overrides env; `?svc=mock&step2=1` works.
  - [ ] check-ownership tests: `ui/x` touching src/glasses/a.ts fails; `ui/x` touching src/phone/a.ts passes; `logic/foundation` touching src/main.ts passes (branch grant); `logic/other` touching src/main.ts fails; `copilot/x` fails; `orch/x` touching docs/design/a.md passes.
  - [ ] `npm run typecheck`, `npm test`, `npm run build` pass locally, and CI is green on the PR itself.
CONSTRAINTS: no new dependencies (request them in the PR description); modes and mocks never import the Even SDK; no secrets, no API keys, and no audio committed; never persist audio; keep style consistent with surrounding code (2-space indent, no semicolons, single quotes, as in src/main.ts); the screen is 576x288 monochrome green, so check layouts against docs/DISPLAY_LIMITS.md.
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
````

---

## 4. T-004: fixtures and word bank seed (LOGIC)

````text
ROLE: You are implementing one task for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

TASK T-004: Fixtures and word bank seed
BRANCH: create and work only on `logic/fixtures` from `origin/integration`. Open a PR into `integration`. Never commit to `main` or `integration`.
CONTEXT: Read PLAN.md (Section 2 for what Steps 1-3 do) and TASKS.md (your card). Read src/core/types.ts (WordEntry, PredictRequest) and docs/PREDICTOR_PROMPT.md Section 8. Those 7 worked examples show the conversation shapes to cover and the style of transcript (fillers, false starts, near-miss sounds). Users are people with aphasia after a stroke, talking with family or caregivers about everyday life.
SPEC:
  1. src/content/words.json: an array of 38 WordEntry objects.
     - 30 everyday words: roughly 12 objects (cup, spoon, keys, phone, glasses, ...), 10 foods (water, bread, milk, ...), 8 everyday places (kitchen, bathroom, pharmacy, park, ...). Categories: 'object', 'food', 'place'.
     - 8 sample personal entries, each with "sample" in tags: 3 people (fictional first names, or "Dr." plus a fictional surname; no real people), 2 medications (real generic drug names, such as lisinopril or metformin), 2 places (fictional or generic local places, like "Sunrise Clinic"), 1 'other' (for example a pet's name). Give people and medications a `firstSound` where the spelling misleads (for example "Dr. Patel" → "p").
     - Every entry: unique lowercase slug `id` (personal ones prefixed `p-`), `word`, `category`, exactly 2 `frames`, and lowercase `tags` (2-4 each; useful for the bank-only predictor fallback, which matches tags against conversation words, for example cup → ["kitchen", "drink"]). Leave `imageKey` unset (T-106 assigns it).
     - Each frame contains exactly one `____`, reads naturally, has a single sensible answer, and is at most 55 characters so it fits one glasses line.
  2. fixtures/conversations/*.json: at least 8 files. Each file is one ConversationFixture in EXACTLY this shape (T-003 writes a replayer for it in parallel, so do not change it):
       interface ConversationFixture {
         id: string                // same as the file name without .json
         description: string
         events: Array<
           | { tMs: number; type: 'speech'; speaking: boolean }
           | { tMs: number; type: 'transcript'; text: string; isFinal: boolean; tStartMs: number }
         >                         // sorted by tMs; a transcript event's tEndMs is its tMs
         stalls: Array<{
           tMs: number             // when the user stalls
           stalledAfter: string    // last 1-6 words before the stall, exactly as in the transcript
           intendedWord: string
           expectedTop3: string[]  // words acceptable as suggestions, including intendedWord
           inBank: boolean         // true if intendedWord is a `word` in words.json
         }>
       }
     Each conversation runs 20-90 seconds of two-person talk (label turns in `description`, not in the text). Each has at least one stall: speech goes false and stays silent for 2-4 s after a final transcript ending at stalledAfter. Include a few partial (isFinal: false) transcripts before finals. Also include normal pauses that are NOT stalls: the other person talking, or the end of a complete sentence. Step 3 needs these negatives.
     Required shapes (one file each, name them by shape): clean-stall, filler-stall ("um", "uh" before the stall), near-synonym-1, near-synonym-2 (the user says a wrong word in the same category first, like fork for spoon), known-name (intendedWord is a sample person), not-in-bank (intendedWord not in words.json, inBank false), circumlocution ("the thing you cut with"), near-miss-sound ("cop" for cup).
  3. fixtures/predictor-eval.json: `{ "version": 1, "cases": [...] }` with 25 cases. Each case: `{ id, shape, transcriptTail, stalledAfter, n: 3, intendedWord, acceptable: string[], inBank: boolean, place?: { lat, lon, label } }`. There is no `bank` field; the eval harness fills `bank` from words.json to build a PredictRequest. `transcriptTail` is 10-40 words ending exactly at the stall, and `stalledAfter` is its suffix. Spread the cases across the 8 shapes above, at least 3 of each for the first 6 shapes, with about 5 cases not in the bank and 3 with a `place`.
  4. fixtures/fixtures.test.ts (Vitest): hand-written validators (no new deps) that check: every WordEntry matches the type (with the category union), ids are unique, frames have exactly one `____` and are 55 characters or less; every conversation file matches ConversationFixture, has events sorted by tMs, and id equals the file name; stalledAfter is a suffix of the preceding final transcript (ignoring case and punctuation) and of transcriptTail in eval cases; inBank is true exactly when intendedWord matches a words.json `word` (case-insensitive); intendedWord is in expectedTop3 / acceptable. Import types from src/core/types.ts.
READ FIRST: src/core/types.ts, docs/PREDICTOR_PROMPT.md (Sections 4 and 8), docs/DISPLAY_LIMITS.md (line width). You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: fixtures/**, src/content/words.json. Do not edit any other file. If you believe another file must change (including src/core/, package.json, tsconfig.json, or another lane's files), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA:
  - [ ] JSON validates against the core types (the Vitest test above passes with `npm test`).
  - [ ] Every intendedWord in an in-bank case exists in words.json.
  - [ ] All 8 conversation shapes are present, and the eval set has 25 cases.
  - [ ] No real people's names; medications are generic drug names only.
CONSTRAINTS: no new dependencies (request them in the PR description); no secrets, no API keys, and no audio committed; keep style consistent with surrounding code (2-space indent, no semicolons, single quotes in .ts files); frames must fit the 576x288 glasses screen per docs/DISPLAY_LIMITS.md.
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
````

---

## 5. T-006: design tokens and glasses layout sketches (UI)

````text
ROLE: You are implementing one task for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

TASK T-006: Design tokens and glasses layout sketches
BRANCH: create and work only on `ui/design-tokens` from `origin/integration`. Open a PR into `integration`. Never commit to `main` or `integration`.
CONTEXT: Read PLAN.md (Sections 2, 3 and 11) and TASKS.md (your card). Read src/core/types.ts: the `Screen` union has 7 kinds (blank, prompt, cue, feedback, candidates, menu, status), and docs/CONTRACTS.md explains each one. Read docs/DISPLAY_LIMITS.md and docs/vendor/even-skills/design-guidelines/SKILL.md and glasses-ui/SKILL.md. The glasses are 576x288, monochrome green (16 shades), with ONE fixed font (no sizes, no bold, left-aligned only), 27 px line height (10 lines), about 60 characters per line, at most 4 images per page, each 288x144 or smaller, and exactly one event-capture container per page. `✓` and `✗` do not render; use `√` / `×` or words. Users are stroke survivors with aphasia and their caregivers: calm, uncluttered, large, high contrast, one thing at a time. The product thesis is "Quiet Tech": the glasses stay blank until help is needed.
SPEC:
  1. Phone companion design tokens (the phone page runs in the Even app's WebView; there is no UI framework, so use plain TypeScript + CSS):
     - src/phone/theme/tokens.css: CSS custom properties for color (dark and light, at least 7:1 contrast for body text, WCAG AAA), type scale (body at least 20px, headings, one numeric style), spacing, radii, tap-target minimum (at least 56px), and motion (gentle, honoring prefers-reduced-motion).
     - src/phone/theme/tokens.ts: the same values as typed constants for TS code, plus a 576x288 glasses-preview palette (black background, 16 green levels).
     - src/phone/theme/demo.html + demo.ts: a demo component (a mode-launcher card and a button, using only the tokens), reachable in dev at http://localhost:5173/src/phone/theme/demo.html. Phone width (375px) without horizontal scroll.
  2. Glasses layout sketches: docs/design/screens/<kind>.svg for all 7 Screen kinds (cue gets 3 sketches, one per level 1/2/3; candidates gets at least level 1 and level 3), each a 576x288 SVG on black with green elements, drawn to the real limits (27 px text lines, images 288x144 or smaller, a dashed outline marking the event-capture container). Use realistic content from Nudge (for example the prompt "You drink from a ____.", the cue "c_p", candidates "cup / mug / glass"). docs/design/GLASSES_LAYOUTS.md explains each layout: container list with x, y, width, height, and which container captures events. This is what T-101 will build from.
  3. docs/design/PAPER.md: find the Paper "Best Designed Hack" challenge on the LA Hacks 2026 Devpost or prize page and read its "View Additional Information". Write down exactly what it requires (must we use the Paper tool? what to submit? judging criteria?) and what we should do to qualify. If you cannot access it, say so and list the questions for a human to check.
READ FIRST: src/core/types.ts, docs/CONTRACTS.md, docs/DISPLAY_LIMITS.md, docs/vendor/even-skills/design-guidelines/SKILL.md, docs/vendor/even-skills/glasses-ui/SKILL.md, index.html (current phone page styling). You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: src/phone/theme/**, docs/design/**. Do not edit any other file. If you believe another file must change (including src/core/, index.html, package.json, or another lane's files), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA:
  - [ ] The tokens file is used by the demo component, and the demo renders at 375px wide with no horizontal scroll.
  - [ ] Sketches cover all 7 Screen kinds and respect docs/DISPLAY_LIMITS.md (state the container count per layout).
  - [ ] PAPER.md states the Paper challenge requirements, or the open questions.
  - [ ] `npm run typecheck` and `npm run build` still pass.
CONSTRAINTS: no new dependencies, no UI framework, no web fonts from a CDN (request any of these in the PR description); no secrets or API keys committed; keep style consistent with surrounding code (2-space indent, no semicolons, single quotes); the glasses screen is 576x288 monochrome green, so check layouts against docs/DISPLAY_LIMITS.md.
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
````
