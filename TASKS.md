# Nudge Task Board

_Last updated: Sat Oct 17, 2026 (about H7) by ORCH. Contracts: CONTRACT_VERSION 2 (`src/core/types.ts`, `docs/CONTRACTS.md`). Phase 1 builder prompts: `docs/prompts/phase1-builder-prompts.md`._

Single source of truth for who is doing what. Read `PLAN.md` first for architecture, contracts, ownership, and git rules.

**Lanes:** ORCH = orchestrator (Claude). GLASS = Claude Code #2. AI = Claude Code #3. UI = Cursor. LOGIC = Codex/ChatGPT. Branch format: `<lane>/<slug>`, PR into `integration`.

**Status values:** TODO, READY, IN_PROGRESS, IN_REVIEW, CHANGES_REQUESTED, APPROVED, MERGED, BLOCKED.

**Queue by lane (now):**
- GLASS: T-002 G2 + Beta checks and the T-003 simulator boot check, then S-3 (**all before H8**), then T-101.
- AI: S-1, then S-2, then T-104 (needs S-1 + S-3).
- LOGIC (Codex): T-103, then T-106, then T-102, then T-007.
- UI (Cursor): T-105.

**Global rules for every task (also repeated in the builder prompt):**
- Read anything. Edit only the files listed on your card. If you need a change elsewhere, stop and say so in your reply.
- Modes never import the Even SDK. Only `src/glasses/` and `src/audio/capture` do.
- No new dependencies. Request them in the PR description.
- Never commit to `main` or `integration` directly. Never commit secrets or audio.
- Before touching any SDK code, read `docs/vendor/even-skills/` (sdk-reference, design-guidelines, font-measurement, device-features, handle-input). Do not guess SDK signatures.

---

## Phase 0 Foundation (H5 to H6:15)

**Goal:** a runnable scaffold, frozen contracts, mocks, stub modes, CI, and three risk spikes. **Branch base:** `main`, then `integration` once T-002 lands.

### T-002 Scaffold from the Even minimal template
- **Owner:** GLASS (Claude Code)
- **Status:** IN_PROGRESS. Code merged to `integration` (PR #3, audited). Still open: steps 3 and 7 (real G2 via QR, Beta install), plus a simulator boot check of T-003's wiring (`npm run dev` + `npm run simulate`; console shows `[nudge:screen] … step1 not built yet`). **Do these before H8.**
- **Branch:** `glass/scaffold`
- **Depends on:** none
- **Files it may EDIT:** repo root config (`package.json`, lockfile, `app.json`, `vite.config.*`, `tsconfig*`, `.gitignore`, `README.md`), `src/main.ts`, `docs/vendor/**`, `docs/DISPLAY_LIMITS.md`. *(These move to ORCH ownership when this task merges.)*
- **Read for context:** Even Hub docs (setup, first app, packaging), the `minimal` template.
- **Do not edit:** anything else.
- **Why this owner:** needs the Even plugin and the real glasses.
- **Spec:**
  1. Install the Even Claude plugin (`/plugin marketplace add even-realities/everything-evenhub`, `/plugin install everything-evenhub`). Use `/template --minimal` (or `quickstart`) to scaffold into the existing repo. Project name `nudge`.
  2. Run it in the simulator. Change one line of text. Verify one input event (click) is received.
  3. Run it on the real G2 through the QR flow. Show "Hello Nudge".
  4. Vendor the plugin's skill markdown into `docs/vendor/even-skills/` (read-only reference for Cursor and Codex).
  5. Produce `docs/DISPLAY_LIMITS.md`: container size limits, image size limits (max width/height for greyscale images), font/line metrics from the font-measurement skill, characters per line at the default font. **T-106 and T-101 depend on this file.**
  6. Add `npm run build`, `npm run typecheck`, `npm run test` (Vitest, even with zero tests), `npm run pack` (build the `.ehpk`).
  7. Pack once and upload to a Beta group (phone account email). Confirm install from Me, Beta tester.
  8. README: how to run the sim, how to do QR on LAN, how to pack.
- **Acceptance criteria:**
  - [ ] Sim and real G2 both show the hello screen; click event logged.
  - [ ] `build`, `typecheck`, `test`, `pack` all succeed from a clean clone.
  - [ ] A Beta build is installed from the phone app.
  - [ ] `docs/DISPLAY_LIMITS.md` has numeric limits (or says exactly which ones the docs do not give).
  - [ ] No secrets committed.

### T-001 Contracts and architecture docs
- **Owner:** ORCH (Claude)
- **Status:** MERGED (PR #4). Additive changes vs. the PLAN.md draft are listed in `docs/CONTRACTS.md`.
- **Branch:** `orch/contracts`
- **Depends on:** none (rebases onto T-002 when it lands)
- **Files it may EDIT:** `src/core/**`, `docs/CONTRACTS.md`, `OWNERS.json`, `docs/G2_SMOKE.md`, `docs/PREDICTOR_PROMPT.md`
- **Why this owner:** architecture and prompt design are the highest-leverage Claude work.
- **Spec:** implement the contracts in `PLAN.md` Section 4 as `src/core/types.ts`, plus `CONTRACT_VERSION`. Fill `OWNERS.json` from the ownership table. Write `docs/G2_SMOKE.md` (Beta checklist plus the main flow per step). Write `docs/PREDICTOR_PROMPT.md`: the Gemini system prompt, input format (transcript tail with a marker where the user stalled, personal word bank with tags, optional place), required JSON output (array of up to 3 `{word, confidence}`), validation rules, and fallback behavior.
- **Acceptance criteria:**
  - [ ] `src/core/types.ts` compiles under the scaffold's `tsc`.
  - [ ] `OWNERS.json` covers every path in the ownership table; every lane has a prefix.
  - [ ] Predictor prompt has at least 5 worked examples drawn from `fixtures/` shapes.

### T-003 Mocks, stub modes, registry, config, CI, ownership check
- **Owner:** LOGIC (Codex)
- **Status:** MERGED (PR #8). CI and `check-ownership` are live on every PR.
- **Branch:** `logic/foundation`
- **Depends on:** T-001, T-002 (both merged)
- **Files it may EDIT:** `src/main.ts`, `src/config.ts`, `src/modes/index.ts`, `src/modes/step1/index.ts`, `src/modes/step2/index.ts`, `src/modes/step3/index.ts` *(stubs only; their owners replace the contents later)*, `src/mocks/**`, `.github/workflows/ci.yml`, `.github/CODEOWNERS`, `scripts/check-ownership.*`
- **Do not edit:** `src/core/**`, `package.json`, `src/glasses/**`.
- **Read for context:** `src/core/types.ts`, `docs/CONTRACTS.md`, `OWNERS.json`, the current `src/main.ts`.
- **Why this owner:** self-contained, well-specified, testable.
- **Spec:**
  1. `src/config.ts`: read `Flags` from `?svc=mock`, URL params, and env. Defaults: `step2Enabled=false`, `step3Enabled=false`, `imuEnabled=false`.
  2. `src/mocks/`: `MockStt` (replays a scripted conversation fixture with timestamps and speech state), `MockPredictor` (returns canned Suggestions keyed by `stalledAfter`), `MemoryStore`, `MockUI` (records Screens and lets tests emit Intents).
  3. Registry in `src/modes/index.ts` registers `step1`, `step2`, `step3`. Each stub shows `status: "<id> not built yet"`. **This registry file is never edited again after this task.**
  4. `src/main.ts`: read `Flags` from `src/config.ts` and build a `ModeContext` (mocks when `mockServices` is true). Keep the existing SDK hello screen and exit handling for now; T-101 replaces the display path with `GlassesUI`. Log the active mode's Screens to the console so the wiring is visible in the simulator.
  5. `ci.yml`: install (`npm ci`), typecheck, test, build, then `check-ownership`. **No lint step** (ORCH decision: no ESLint dependency for now). Checkout with `fetch-depth: 0` so the changed-file list can be computed against the base branch.
  6. `check-ownership` (Node, no new dependencies, hand-written glob matching): reads `OWNERS.json`, takes the PR's branch name and changed file list, and fails if any file matches neither the lane's `paths` nor `branchGrants[<branch>]`. Fails branches whose prefix is not a lane. Glob rules are in `docs/CONTRACTS.md`.
- **Acceptance criteria:**
  - [ ] Vitest: each stub enters from the registry with a mock `ModeContext`, shows its `status` Screen on `MockUI`, and exits cleanly. (Seeing the stubs on the glasses moves to T-101, which owns rendering.)
  - [ ] `npm run dev` + simulator still boots with `src/main.ts` wired to config and registry; no console errors.
  - [ ] `MockStt` replay test passes (emits transcripts and speech-state events in order).
  - [ ] `check-ownership` has tests: a PR from `ui/` touching `src/glasses/` fails; touching `src/phone/` passes; `logic/foundation` touching `src/main.ts` passes (branch grant); `logic/other` touching `src/main.ts` fails; `copilot/x` fails.
  - [ ] CI is green on the PR itself.

### T-004 Fixtures and word bank seed
- **Owner:** LOGIC (Codex)
- **Status:** MERGED (PR #9). Realism follow-up is T-007.
- **Branch:** `logic/fixtures`
- **Depends on:** T-001
- **Files it may EDIT:** `fixtures/**`, `src/content/words.json`
- **Read for context:** `src/core/types.ts`, `docs/PREDICTOR_PROMPT.md` Section 8 (the worked examples show the fixture shapes).
- **Spec:**
  - `src/content/words.json`: 30 `WordEntry` objects across objects, food, and everyday places, plus 8 sample personal entries (names, a medication, a place) clearly marked `tags: ["sample"]`. Each has 2 sentence frames with `____`. No real people's names.
  - `fixtures/conversations/*.json`: at least 8 scripted conversations. Each is an array of timed transcript segments and speech-state changes, with at least one stall point, the `intendedWord`, and `expectedTop3` (words acceptable as suggestions). Include: a clean stall, a stall after a filler ("um"), two near-synonym cases, a name the user knows, and a case where the intended word is not in the bank.
  - `fixtures/predictor-eval.json`: 25 cases of `PredictRequest` plus `intendedWord`.
- **Acceptance criteria:**
  - [ ] JSON validates against the `core` types (add a Vitest schema test in `fixtures/`).
  - [ ] Every `intendedWord` in an in-bank case exists in `words.json`.

### T-005 Predictor prompt design
- **Owner:** ORCH
- **Status:** MERGED (as part of T-001: `docs/PREDICTOR_PROMPT.md`, prompt version 1)

### S-1 Spike: ElevenLabs Scribe from the WebView
- **Owner:** AI (Claude Code)
- **Status:** READY
- **Branch:** `ai/spike-stt` (writes only `spikes/stt/**`)
- **Depends on:** none
- **Spec:** answer, with measured numbers and code: (1) batch vs realtime, which works from a browser WebView; (2) does it need a server-minted token (so we need `api/`)? (3) CORS behavior; (4) latency for a 1-3 second single-word clip; (5) behavior on slurred or partial words ("cop" for cup), including whether it autocorrects to a real word; (6) whether it accepts biasing toward a target word. Output `spikes/stt/FINDINGS.md` with a recommendation for Step 1 (utterance) and Steps 2-3 (rolling).
- **Acceptance criteria:** FINDINGS answers all six questions with evidence.

### S-2 Spike: Gemini predictor against fixtures
- **Owner:** AI (Claude Code)
- **Status:** READY (T-004 merged)
- **Branch:** `ai/spike-predictor` (writes only `spikes/predictor/**`)
- **Depends on:** T-001, T-004
- **Spec:** run `docs/PREDICTOR_PROMPT.md` against `fixtures/predictor-eval.json` with the fastest Gemini tier. Report accuracy at top-1 and top-3, p50/p95 latency, and JSON-validity rate. Confirm current model ID from Gemini docs. Recommend prompt changes to ORCH.
- **Acceptance criteria:** results table in `spikes/predictor/FINDINGS.md`.

### S-3 Spike: on-device audio and IMU
- **Owner:** GLASS
- **Status:** READY (T-002 code merged; **must finish before H8 while the Even table is staffed**)
- **Branch:** `glass/spike-device` (writes only `spikes/device/**`)
- **Depends on:** T-002
- **Spec:** on the real G2: (1) capture 10 seconds from the glasses mic and from the phone mic, save locally for comparison (do not commit audio); report which is cleaner at normal conversation distance; (2) log raw IMU x/y/z during nod left, nod right, look up, look down; (3) confirm an event-capturing container works while nothing is visible (needed for the `blank` Screen); (4) confirm the WebView page is visible on the phone while the glasses render; (5) test lock/resume while the mic is open.
- **Acceptance criteria:** `spikes/device/FINDINGS.md` answers all five; flag anything that changes `PLAN.md`.

### T-006 Design tokens and glasses layout sketches
- **Owner:** UI (Cursor)
- **Status:** MERGED (PR #7). Contrast nits for T-403 are in the PR #7 review.
- **Branch:** `ui/design-tokens`
- **Depends on:** T-002 (reads `docs/DISPLAY_LIMITS.md`)
- **Files it may EDIT:** `src/phone/theme/**`, `docs/design/**`
- **Spec:** design tokens for the phone companion UI (large type, high contrast, calm: the users are stroke survivors and caregivers). Layout sketches for each `Screen` kind at 576x288. Check what the Paper challenge requires (read its "View Additional Information") and note it in `docs/design/PAPER.md`.
- **Acceptance criteria:** tokens file used by a demo component; sketches cover all 7 Screen kinds.

### T-007 Fixture realism (follow-up to T-004)
- **Owner:** LOGIC (Codex)
- **Status:** READY (lower priority than T-103, T-106 and T-102; **must merge before T-301 starts**)
- **Branch:** `logic/fixtures-v2`
- **Depends on:** T-004
- **Files it may EDIT:** `fixtures/**`
- **Read for context:** the PR #9 review (follow-up items 1-4), `src/mocks/fixtures.ts`, `docs/PREDICTOR_PROMPT.md` Section 8.
- **Spec:**
  1. Stop sharing one timing skeleton across the conversations. Vary the length (20-90 s), the number of turns, the wording, and the pause lengths. Include normal pauses (end of a sentence, between turns) that are **longer** than some stall silences, so a pure silence threshold cannot separate them.
  2. Add at least 2 conversations with more than one stall and 1 conversation with no stall at all (keep the 8 existing shapes).
  3. Define `stalls[].tMs` as the time of the last `speaking: false` before the stall (when the user stops speaking), and fix the existing files. Document this in `fixtures/README.md`.
  4. Rewrite the filler-stall dialogue so it doesn't give away the answer ("sample tablet starting with lisi"). Relabel or rewrite eval cases tagged `clean-stall` that are really circumlocution.
  5. Extend `fixtures/fixtures.test.ts` to check rule 3 and that no two conversations share an identical timing skeleton.
- **Acceptance criteria:**
  - [ ] At least 11 conversations; tests pass; the stall rule is documented.
  - [ ] No silence threshold splits stall pauses from non-stall pauses perfectly across the set (add a test that proves it).

**Phase 0 exit:** T-001, T-002, T-003, T-004 merged to `integration`; spikes S-1, S-2, S-3 reported; ORCH reviews findings and updates `PLAN.md` before Phase 1 begins.

---

## Phase 1 Step 1 slice (H6:15 to H10) → Gate G1

**Goal:** Step 1 works end-to-end on the real G2 and in a Beta build.

### T-101 Glasses renderer, input mapper, cue ladder, lifecycle
- **Owner:** GLASS
- **Status:** READY
- **Branch:** `glass/renderer`
- **Depends on:** T-001, T-002, T-003
- **Files it may EDIT:** `src/glasses/**` (excluding `src/glasses/imu/`), `src/main.ts` (branch grant for `glass/renderer`)
- **Read for context:** `src/core/types.ts`, `docs/DISPLAY_LIMITS.md`, `docs/design/GLASSES_LAYOUTS.md`, `docs/vendor/even-skills/`
- **Also builds (CONTRACT_VERSION 2):** the `AppShell` (glasses launcher as the root screen, mode switching, Screen mirroring for the phone), `createBridgeKeyValue` (a `KeyValueStore` over SDK storage), and lifecycle handling. Full spec in the Phase 1 builder prompt.
- **Spec:** implement `GlassesUI`: render each `Screen` kind with SDK containers sized by the font-measurement guidance; `blank` is an event-capturing empty container. Map touchpad events to `Intent` (click=SELECT, swipe down=NEXT, swipe up=PREV, double-click=BACK). Reusable cue ladder component (`level 1/2/3`). Page lifecycle: survive phone lock/resume, handle exit. Await `waitForEvenAppBridge()` before SDK calls. Render `feedback` with `√` / `×` or words, never `✓` / `✗` (not in the G2 font). Request `@evenrealities/pretext` in the PR description if you need text measurement; ORCH installs it. Also take over the display path in `src/main.ts` from T-003's console logging (request the edit; `src/main.ts` is ORCH-owned).
- **Acceptance criteria:**
  - [ ] Each Screen kind renders in the simulator with a screenshot check.
  - [ ] The three stub modes from the registry show their status text on the simulator.
  - [ ] Intents arrive correctly from sim input injection.
  - [ ] No text overflows the container on the longest sentence in `words.json`.
  - [ ] Works on the real G2.

### T-102 Step 1 engine and mode
- **Owner:** LOGIC (Codex)
- **Status:** READY
- **Branch:** `logic/step1-mode`
- **Depends on:** T-001, T-003, T-004, T-103 (`matchWord`), T-106 (`resolveAssets`). Start after T-103 and T-106 merge.
- **Files it may EDIT:** `src/modes/step1/**`
- **Spec:** loop: pick a `WordEntry` (rotate categories, avoid repeats within a session), show `prompt` (sentence frame with blank), open `stt.transcribeUtterance({maxMs: 8000, endSilenceMs: 1200, targetHint: word})`, match against the target, show `feedback` (check or X). SELECT during a prompt escalates the cue: level 1 picture, level 2 masked word (`c_p`), level 3 full word. After feedback, auto-advance after a short pause. NEXT skips. BACK leaves the session. Track per-item result (solved at cue level, attempts). A 10-item session ends with a `status` summary screen and `store.saveSession`. Pure TypeScript against `ModeContext` only.
- **Acceptance criteria:**
  - [ ] Vitest with `MockUI`/`MockStt`: correct word at cue 0, correct after cue 2, wrong word then skip, silence timeout.
  - [ ] No SDK imports.
  - [ ] Session of 10 items completes and saves.

### T-103 Fuzzy matcher
- **Owner:** LOGIC (Codex)
- **Status:** READY
- **Branch:** `logic/matcher`
- **Depends on:** T-001
- **Files it may EDIT:** `src/matching/**`
- **Spec:** `matchWord(transcript: string, target: string, strictness: 0|1|2): {ok: boolean; score: number; heard: string}`. Normalize case and punctuation. Accept exact, target contained in a multi-word transcript, phonetic-code match, and small edit distance scaled by word length (stricter for short words). Strictness 0 = lenient, 2 = exact. Include a table test of at least 40 cases (cup/"cop"/"cup uh", cat/"cap" should fail at strictness 2).
- **Acceptance criteria:** all 40 table cases pass; documented thresholds; pure functions, no dependencies beyond those already installed.

### T-104 Audio capture, VAD, and utterance STT
- **Owner:** AI
- **Status:** TODO (waiting on S-1 and S-3)
- **Branch:** `ai/audio-utterance`
- **Depends on:** T-001, T-002, S-1, S-3
- **Files it may EDIT:** `src/audio/**` (excluding `src/audio/rolling/`), `api/stt/**`. `app.json` permissions (`g2-microphone` or `phone-microphone`, `network` with the proxy URL whitelisted) are requested in the PR description; ORCH adds them.
- **Spec:** implement `SttService` for real: capture PCM (source chosen per S-3), energy-based VAD producing `onSpeechState`, and `transcribeUtterance` (record until `endSilenceMs` of silence after speech or `maxMs`, wrap PCM, send to the ElevenLabs adapter via `api/` if S-1 says a proxy is needed). Honor `targetHint` if S-1 found biasing is supported. No audio written to disk or storage. Graceful errors: mic denied, network down, timeout (return an empty `Transcript` with a typed error the mode can show as `status`).
- **Acceptance criteria:**
  - [ ] Real utterance round-trip works from the simulator mic path and on the G2.
  - [ ] VAD emits speaking true/false transitions on a recorded test clip (clip not committed; test uses a synthetic PCM generator).
  - [ ] Keys are server-side only; bundle contains no API keys.

### T-105 Phone companion v1 and Screen preview
- **Owner:** UI (Cursor)
- **Status:** READY
- **Branch:** `ui/companion-v1`
- **Depends on:** T-003, T-006
- **Files it may EDIT:** `src/phone/**`
- **Spec:** the page shown on the phone: a mode launcher (Step 1, Step 2 when enabled, Step 3 when enabled), the Step 1 session summary, a read-only word-bank list, and a **Screen preview** component that renders any `Screen` as a 576x288 green-on-black canvas (uses `MockUI` in dev). Large, high-contrast, calm per T-006 tokens.
- **Acceptance criteria:** preview renders all 7 Screen kinds from a fixture playlist; launcher starts Step 1 against mocks; layout works at phone width.

### T-106 Picture and mouth-shape assets, store
- **Owner:** LOGIC (Codex)
- **Status:** READY
- **Branch:** `logic/assets-store`
- **Depends on:** T-002 (reads `docs/DISPLAY_LIMITS.md`), T-004
- **Files it may EDIT:** `src/content/assets/**`, `src/content/index.ts`, `src/content/*.test.ts`, `src/store/**`, `scripts/make-assets.*` (not needed: SVG assets are rasterized at runtime in the WebView; see the Phase 1 builder prompt)
- **Spec:** (1) greyscale line pictures for the 30 bank words at the max image size from `DISPLAY_LIMITS.md`, produced by a script (SVG source to greyscale PNG) from original or permissively licensed art (record licenses in `src/content/assets/LICENSES.md`); (2) a set of 8-10 mouth-shape images covering common first-sound groups (for example lips together, teeth on lip, rounded lips, open, tongue between teeth); (3) `resolveAssets(entry)` returning `imageKey` and `mouthKey` (heuristic from initial letter or digraph, with `firstSound` override); (4) `Store` implementation over the SDK local-storage wrapper (abstracted so it runs in Node with an in-memory fallback).
- **Acceptance criteria:** every bank word resolves to an image key; sizes within limits; store tests pass; asset licenses documented.

### T-107 Gate G1: audit, integrate, smoke, tag
- **Owner:** ORCH (with GLASS holding the device)
- **Status:** TODO
- **Depends on:** T-101 to T-106
- **Spec:** audit every PR against the checklist; verify no contract drift; merge order T-101, T-104, T-103, T-102, T-106, T-105; run `docs/G2_SMOKE.md` on the real G2 with the Beta build; fast-forward `main`, tag `v0.1-step1`, upload the `.ehpk`.
- **Acceptance criteria (gate):** Step 1 runs 10 prompts on the real G2, with check/X feedback and the cue ladder; survives a 5-minute lock/resume; mic-denied path shows a message; root double-tap exits cleanly.

---

## Phase 2 Step 2 (H10 to H14:30) → Gate G2

**Goal:** a user asks for help mid-conversation and gets suggestions, pictures, and a cue ladder. Detailed specs are refined by ORCH at G1 using what the spikes and Step 1 taught us; the ownership and shape are fixed now.

### T-201 Predictor implementation
- **Owner:** LOGIC (Codex)
- **Status:** TODO
- **Branch:** `logic/predictor`
- **Depends on:** T-001 (`PREDICTOR_PROMPT.md`), S-2, T-004. Develop against `MockPredictor` and a stubbed fetch until T-203's proxy merges; do not wait on it.
- **Files it may EDIT:** `src/ai/predictor/**`, `scripts/eval-predictor.*`
- **Spec:** `PredictorService` per ORCH's prompt: call via `api/predict` (T-203's proxy), validate JSON against a schema, 1.2 s timeout via `AbortSignal`, and a **bank-only fallback** ranking words by tag overlap and recency. Include the eval script that reports top-1/top-3 accuracy on `fixtures/predictor-eval.json`.
- **Acceptance criteria:** schema validation rejects malformed output; fallback engages on timeout and on invalid JSON (tested); eval script runs and prints accuracy.

### T-202 Rolling-transcript STT and buffer
- **Owner:** AI
- **Status:** TODO
- **Branch:** `ai/audio-rolling`
- **Depends on:** T-104, S-1
- **Files it may EDIT:** `src/audio/rolling/**`
- **Spec:** implement `onTranscript` for continuous use (streaming, or chunked utterances per the S-1 recommendation) and a `TranscriptBuffer` giving the last N seconds/words with timestamps. Reconnect on failure. Keep mic lifecycle consistent with `src/audio/`'s existing capture.
- **Acceptance criteria:** 5-minute continuous run without leak or crash against the mock path; reconnect test; buffer unit tests.

### T-203 Serverless proxy for prediction
- **Owner:** AI
- **Status:** TODO
- **Branch:** `ai/api-predict`
- **Depends on:** T-001
- **Files it may EDIT:** `api/predict/**`
- **Spec:** a minimal endpoint that holds the Gemini key, accepts a `PredictRequest`, enforces input size limits and an origin allow-list, and returns the model's raw JSON. CORS configured for the app origin. *(`api/stt/**` stays under T-104.)*
- **Acceptance criteria:** works from the Beta build; key not present in the client bundle; oversized input rejected.

### T-204 Step 2 mode
- **Owner:** GLASS
- **Status:** TODO
- **Branch:** `glass/step2-mode`
- **Depends on:** T-101, T-201 (mock first), T-202 (mock first)
- **Files it may EDIT:** `src/modes/step2/**`
- **Spec:** idle `blank` Screen (event-capturing). On each final transcript segment, refresh a candidate cache in the background (speculative). SELECT shows `candidates` at level 1 (picture/mouth shape of top candidate); SELECT again escalates to level 2 (first letter), then level 3 (full word); NEXT/PREV cycle among the top 3 and reset the ladder; BACK returns to `blank`. If STT hears the target word (via the matcher), clear the display automatically. Auto-dismiss after a configurable timeout. Works fully on mocks first (`?svc=mock`), then with the real services.
- **Acceptance criteria:**
  - [ ] Mock run against all 8 fixtures: help tap shows candidates in under 300 ms (cache hit).
  - [ ] Ladder and swipe behavior covered by Vitest with `MockUI`.
  - [ ] Real-service run works on the G2 in a two-person conversation.
  - [ ] `step2Enabled` flag gates the whole mode.

### T-205 Mouth-shape resolver and asset expansion
- **Owner:** LOGIC (Codex)
- **Status:** TODO
- **Branch:** `logic/mouth-resolver`
- **Depends on:** T-106
- **Files it may EDIT:** `src/content/phonetics/**`
- **Spec:** improve `mouthKey` resolution beyond initial-letter heuristics (digraphs, silent letters, per-entry `firstSound` override), with a table test of at least 60 words including names and medication names. Expand pictures for words the predictor commonly returns.
- **Acceptance criteria:** table test passes; unknown words degrade to text-only (no crash).

### T-206 Companion v2: personal word bank and debug panel
- **Owner:** UI (Cursor)
- **Status:** TODO
- **Branch:** `ui/companion-v2`
- **Depends on:** T-105, T-106
- **Files it may EDIT:** `src/phone/**` *(this task owns `src/phone/` for the duration of Phase 2; T-105 must be merged first)*
- **Spec:** add and edit personal words (names, medications, places) with category and tags; live transcript view; "last suggestions" debug panel with confidence (also a demo asset); calm, large-type design.
- **Acceptance criteria:** adding a word makes it appear in `store.getBank()` and in predictor requests; works at phone width.

### T-207 Gate G2: audit, integrate, smoke, tag
- **Owner:** ORCH
- **Status:** TODO
- **Spec:** audit, merge in dependency order, run `docs/G2_SMOKE.md` plus a live two-person conversation test, fast-forward `main`, tag `v0.2-step2`, upload Beta. **Decision:** enable `step2Enabled` by default.
- **Acceptance criteria (gate):** in a 5-minute live conversation, the user can ask for help and get at least one correct or acceptable suggestion within about 1.5 s on most attempts; Step 1 still passes its smoke test (regression).

---

## Phase 3 Step 3 (H14:30 to H18) → Gate G3

**Goal:** automatic hints after a lull, behind a flag, additive to Step 2.

### T-301 Stall detector
- **Owner:** AI
- **Status:** TODO
- **Branch:** `ai/stall`
- **Depends on:** T-202, T-007
- **Files it may EDIT:** `src/ai/stall/**`
- **Spec:** combine speech state (silence after speech), transcript signals (ends on a connective or filler, unfinished sentence) and an optional cheap model check, behind a pure interface `StallDetector.onEvent(...) -> StallSignal | null`. Thresholds in config, starting guesses only. Includes a cooldown and a max-hints-per-minute cap.
- **Acceptance criteria:** precision/recall script over the fixtures; false auto-hints in the replayed non-stall segments stay under a target ORCH sets at G2 from data.

### T-302 Step 3 mode
- **Owner:** AI
- **Status:** TODO
- **Branch:** `ai/step3-mode`
- **Depends on:** T-301, T-204
- **Files it may EDIT:** `src/modes/step3/**`
- **Spec:** on `StallSignal`, show Step 2's candidates at level 1 using the shared cue ladder from `src/glasses/` (do not copy Step 2 code); tap escalates; speaking the word or a timeout clears. Key-word behavior per the open decision (default: shown after a stall). A pause/resume gesture decided with ORCH. All of it gated by `step3Enabled`; if the detector throws, the mode falls back to Step 2 behavior.
- **Acceptance criteria:** replay of fixtures on mocks triggers hints at expected stall points; fallback test; flag off = no behavior change.

### T-303 Key-word extractor
- **Owner:** LOGIC (Codex)
- **Status:** TODO
- **Branch:** `logic/keywords`
- **Depends on:** T-004
- **Files it may EDIT:** `src/ai/keywords/**`
- **Spec:** from the rolling transcript and the word bank, extract names, places, and topic words (rules plus bank matching, no model call). Return a ranked top-N with recency decay.
- **Acceptance criteria:** table tests on fixtures; deterministic output.

### T-304 Companion v3: Step 3 settings and session log
- **Owner:** UI (Cursor)
- **Status:** TODO
- **Branch:** `ui/companion-v3`
- **Depends on:** T-206
- **Files it may EDIT:** `src/phone/**`
- **Spec:** sensitivity setting (maps to stall thresholds), pause/resume, a session log showing when hints fired and whether they helped. Includes demo mode controls (see T-401).

### T-305 Stretch: head tilt to intents
- **Owner:** GLASS
- **Status:** TODO (start only when G2 passes; drop if it threatens G3)
- **Branch:** `glass/imu-tilt`
- **Depends on:** S-3, T-101
- **Files it may EDIT:** `src/glasses/imu/**`
- **Spec:** calibrate on mode entry (look straight), derive tilt from raw x/y/z, emit `NEXT`/`PREV` through the same `Intent` stream (modes need no changes). Debounce, dead-zone, and a visible indicator when tilt is active. Flag `imuEnabled`, default off.
- **Acceptance criteria:** on the real G2, 20 deliberate tilts register at least 18 times and 20 idle head movements trigger at most 2 false intents.

### T-306 Gate G3: audit, soak, decide, tag
- **Owner:** ORCH
- **Spec:** audit; 10-minute live soak; count false hints per minute; decide whether `step3Enabled` ships default ON; tag `v0.3-step3` (or keep `v0.2` as the ship candidate); upload Beta.

---

## Phase 4 Harden and ship (H18 to H22)

No new features after H18. Only fixes, packaging, polish, and the story.

### T-401 Demo mode and judge flow
- **Owner:** UI (Cursor)
- **Branch:** `ui/demo-mode`
- **Files it may EDIT:** `src/phone/demo/**`
- **Spec:** a "Demo" entry on the phone page with a scripted stall so a judge can try Steps 2-3 without needing a second person to hold a conversation. Plan the hand-off: judges are told to put the G2 on and try it.

### T-402 Beta final and lifecycle tests
- **Owner:** GLASS
- **Branch:** `glass/beta-final`
- **Files it may EDIT:** `docs/BETA_RESULTS.md`
- **Spec:** build final `.ehpk`, upload, install from Beta tester, run the full lifecycle checklist (5-minute lock, permission denial, root double-tap exit), record results.

### T-403 Design polish (Paper challenge)
- **Owner:** UI (Cursor)
- **Branch:** `ui/polish`
- **Files it may EDIT:** `src/phone/**` (excluding `src/phone/demo/`, owned by T-401), `docs/design/**`
- **Spec:** one polish pass per the Paper brief (design fundamentals, ease of use, personal craft).

### T-404 Devpost writeup and demo script
- **Owner:** ORCH
- **Files it may EDIT:** `docs/DEVPOST.md`, `docs/DEMO_SCRIPT.md`
- **Spec:** problem and user story, how G2 is used (the judge will ask), architecture, what is real vs mocked, sponsor-prize claims (Gemini, ElevenLabs, Paper), honest limitations. Demo script with timings and a backup plan (simulator + Screen preview).

### T-405 Final audit and submission
- **Owner:** ORCH
- **Spec:** final audit pass; confirm tag, Beta build, Devpost, and G2 return arrangement; two full rehearsals.

---

## Backlog (Steps 4-5 and ideas)
- Step 4: record without showing text; detect mumbled or poorly formed words; show the corrected word as a prompt.
- Step 5: detect missing filler words (the, and, like, with, but, or) and suggest sentence completions using the user's actual recorded words.
- Optional Gemini-generated pictures for words without art.
- Clinician or caregiver export of session logs.

## Done log
- H5: `PLAN.md` and `TASKS.md` merged to `main` (PR #2). `integration` created from `main`.
- H6: T-002 scaffold code merged to `integration` (PR #3, audited; G2 and Beta checks still open).
- H6: T-001 contracts merged to `integration` (PR #4): `src/core/types.ts` (CONTRACT_VERSION 1), `OWNERS.json`, `docs/CONTRACTS.md`, `docs/G2_SMOKE.md`, `docs/PREDICTOR_PROMPT.md`. Includes T-005.
- H6: Phase 0 builder prompts merged (PR #6, `docs/prompts/phase0-builder-prompts.md`).
- H7: T-003 foundation merged (PR #8): mocks, registry, config, CI, `check-ownership`.
- H7: T-004 fixtures merged (PR #9). Follow-up filed as T-007.
- H7: T-006 design tokens and glasses layouts merged (PR #7, after one round of changes).
- H7: CONTRACT_VERSION 2 (additive: `AppShell`, `ModeInfo`, `ModeContext.leave?()`, `GreyImage`, `ImageSource`, `KeyValueStore`). `@evenrealities/pretext@0.1.4` installed. Menu layout corrected to a text container. Phase 1 builder prompts added. **All lanes: rebase on `integration`.**

---

## Builder prompt template (paste with zero editing; fill the angle brackets)

```
ROLE: You are implementing one task for Nudge, a word-finding aid for people with aphasia, built as an Even Hub app for the Even G2 glasses (Vite + TypeScript web app running in the Even phone app's WebView). An architect has already designed it. Follow the spec exactly and do not redesign.

TASK <T-id>: <title>
BRANCH: create and work only on `<lane>/<slug>`. Open a PR into `integration`. Never commit to `main` or `integration`.
CONTEXT: Read PLAN.md (architecture, contracts, git rules) and TASKS.md (your card). Read src/core/types.ts for the contracts. Read docs/vendor/even-skills/ before touching any SDK code; do not guess SDK signatures.
SPEC: <paste the spec from the card>
READ FIRST: <paths from the card>. You may read any other file in the repo whenever you need to.
FILES YOU MAY EDIT: <paths from the card>. Do not edit any other file. If you believe another file must change (including src/core/, package.json, or another lane's files), STOP and tell me in your reply instead of editing it.
ACCEPTANCE CRITERIA: <paste the checklist>
CONSTRAINTS: no new dependencies (request them in the PR description); modes never import the Even SDK; no secrets, no API keys, and no audio committed; never persist audio; keep style consistent with surrounding code; the screen is 576x288 monochrome green, so check layouts against docs/DISPLAY_LIMITS.md.
WHEN DONE: reply with (1) summary of changes, (2) files changed, (3) how you tested (do not claim tests passed unless you ran them), (4) anything you were unsure about, deviated on, or wanted to change outside your editable files.
```

## Audit checklist (ORCH, every returned PR)

Read the actual diff, not the builder's summary.
1. **Spec and ownership:** every acceptance criterion met; nothing out of scope; no files outside the card's edit list (CI `check-ownership` must be green).
2. **Correctness:** edge cases, async and race issues (STT reconnects, cancelled predictions), timers cleaned up on mode exit.
3. **Data safety:** no audio persisted or committed; no API keys in the bundle or repo; LLM output validated against a schema before use; word bank stays on-device.
4. **Integration:** matches `CONTRACT_VERSION`; modes import no SDK; flags default OFF for unfinished work.
5. **G2 fit:** layouts within 576x288 and the documented container and image limits; an event-capturing container exists on every Screen including `blank`; lifecycle (lock/resume, permission denial, root double-tap exit) handled.
6. **Quality:** meaningful tests; no hallucinated SDK calls or packages; fallbacks present for model and network failure.

Audit output: verdict (APPROVED or CHANGES_REQUESTED), then findings as Blocking / Should fix / Nit with file and line, then the updated status and the next step for the human courier.
