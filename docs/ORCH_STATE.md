# ORCH State

The orchestrator's single snapshot of where Nudge stands. **ORCH updates this after every gate (G1, G2, G3, final) and after any merge that changes a gate's readiness.** Detailed task cards live in `TASKS.md`, decisions in `PLAN.md` §13, contracts in `docs/CONTRACTS.md`.

_Last updated: **Sun Oct 18, 2026, 12:50 AM PT (hackathon hour ~H13:50 of 24)** by ORCH (aaravj9). **G1 and G2 PASSED. `main` = `v0.2-step2` = `ae2294d`. G3 READY TO RUN from `a34bc50` (0.4.3).**_

## Snapshot

| Item | Value |
|---|---|
| `integration` | **`a34bc50`** after #98 (T-209 part 2) + this PR. typecheck, build, **776 tests**. `VITE_STEP3=1 npm run pack` verified (0.4.3, batch + Step 2 + Step 3 in the bundle) |
| `main` | **`ae2294d`** (fast-forwarded at G2: the tested 0.4.2 code + D17 + D18; a plain `npm run pack` reproduces it byte-for-byte) |
| Tags | `v0.1-step1` → `4b13180` (G1); **`v0.2-step2` → `ae2294d`** (G2). Next: `v0.3-step3` at G3 |
| `app.json` version | **0.4.3** for the next upload (the G3 pack, with T-208 + T-209). 0.4.2 = the G2 build (D10) |
| Contracts | **`CONTRACT_VERSION 3`**: `SttService.flush?()` (T-208) and letters-first `candidates` levels (T-209). All lanes: merge `integration` |
| Production `api/` | `https://nudge-seven-psi.vercel.app`, redeployed by Sam with the WebView origin. At 10:54 PM: `127.0.0.1:<any port>` preflight 204, **but `null` and `file://` also 204, so it's looser than intended**; tighten after #61 (see blockers) |
| Open PRs | #93 (T-210, juannli): changes requested, still not using `revealWord` (preview only; not needed for G3); #88 (juannli): rebase or close |
| Open issues | none (#73 closed by #76) |

## Gates

| Gate | What it proves | Status | Blocker / next action |
|---|---|---|---|
| **G1: Step 1 on the real G2** | Practice: 10 prompts, cue ladder, √/× feedback, lock/resume, mic denial, exit | ✅ **PASSED (H11:15, #68)**: real speech graded on the G2; lock, exit, B5, B6 pass; A4 accepted via unit tests (D16). Tagged `v0.1-step1` | Done. A3/A5/A7 carried to G2 |
| **G2: Step 2 in a live conversation** | Help tap → good suggestion in ≤ ~1.5 s on most attempts; Step 1 regression | ✅ **PASSED on function (H13, D18, #90/#91)**: 0.4.2 batch followed the conversation ("warm and um um" → "sunny"); Step 1 + T-108 clean. **Latency not demonstrated** (the tester said 2-3 s) | Tagged `v0.2-step2`. Latency → **T-208**; ladder request → **T-209/T-210** |
| **G3: Step 3 ambient hints** | Auto-hints after a stall, no false-hint spam in a 10-minute soak | **READY TO RUN** (0.4.3 from `a34bc50`, `VITE_STEP3=1`): Step 3 + T-208 flush + T-209 letters-first | Sarah + a second person: TASKS T-306 runbook (latency tally, ladder check, 10-min soak). Ships flag-off unless it passes (PLAN §2) |
| **Final** | Beta `.ehpk` + Devpost by **H22 (10 AM Sunday)** | Not started (T-402, T-404, T-405) | Demo assets (T-401) are done |

## Every task

Legend: ✅ merged · 🟡 in progress / review · ⬜ todo · 🚦 gate.

| ID | Task | Owner | Status | PRs |
|---|---|---|---|---|
| T-001 | Contracts, OWNERS, smoke doc, predictor prompt | ORCH | ✅ | #4, #12 (v2) |
| T-002 | Scaffold + first Beta | GLASS (Sarah) | ✅ code and device (QR broken → packaged builds) | #3, #13 |
| T-003 | Mocks, registry, config, CI, ownership check | LOGIC (juannli) | ✅ | #8 |
| T-004 | Word bank + fixtures | LOGIC | ✅ | #9 |
| T-005 | Predictor prompt (now v2) | ORCH | ✅ | #4, #30 |
| T-006 | Design tokens + glasses layouts | UI (juannli) | ✅ | #7, #15 |
| T-007 | Fixture realism | LOGIC | ✅ | #23, #65, #70 |
| S-1 | ElevenLabs STT spike | AI (Sam/juannli) | ✅ | #17 |
| S-2 | Gemini predictor spike | AI (Sam) | ✅ | #26 |
| S-3 | On-device audio/IMU spike | GLASS | ✅ (0.1.2 rerun items open, not blocking) | #20 |
| T-101 | Glasses renderer, input, shell, lifecycle | GLASS | ✅ **passed on the real G2** | #29, #38 |
| T-102 | Step 1 Practice mode | LOGIC | ✅ | #34 |
| T-103 | Fuzzy matcher | LOGIC | ✅ | #21 |
| T-108 | Step 1 auto-escalate after a wrong answer (G1 finding) | LOGIC (Devin) | ✅ (device check during G2) | #76 |
| T-104 | Glasses mic, VAD, utterance STT, `api/stt` | AI (Sam) | ✅ wired, hosted; WebView origin support | #33, #37, #50, #61 |
| T-105 | Phone companion v1 + preview | UI | ✅ | #11, #18 |
| T-106 | Assets, content API, store | LOGIC | ✅ (40 PNGs verified in a browser) | #22, #28 |
| T-107 | 🚦 Gate G1 | ORCH + GLASS | ✅ **PASSED**, tagged `v0.1-step1` | #68 |
| T-201 | Predictor (fallback v2, throttle, 429) | LOGIC | ✅ wired, 1.5 s timeout | #31, #51, #55 |
| T-202 | Rolling transcript (realtime) | GLASS (reassigned) | ✅ wired | #49, #54 |
| T-203 | `api/predict` Gemini proxy | AI (Sam) | ✅ hosted | #53, #57 |
| T-204 | Step 2 Assist mode | GLASS | ✅ | #43 |
| T-205 | Mouth-shape resolver + 25 pictures | LOGIC (Devin) | ✅ | #62, #70 |
| T-206 | Companion v2 (personal words, debug) | UI | ✅ (Debug tab dev-only until the shell exposes transcripts) | #24, #36, #48 |
| T-207 | 🚦 Gate G2 | ORCH + GLASS | ✅ **PASSED** (D18), tagged `v0.2-step2` | #90, #91 |
| T-208 | Step 2 latency: flush the batch segment on a tap | AI (Sam) | ✅ merged; sim median ≈ 1.49 s tap → candidates; device tally pending (0.4.3) | #96 |
| T-209 | Letters-first hint ladder (Steps 2-3) | GLASS (Sarah) | ✅ merged; device check in the G3 pack | #95, #98 |
| T-210 | Phone preview + demo: letters-first | UI (juannli) | 🟡 changes requested again (still a second letters implementation) | #93 |
| T-301 | Stall detector | AI (Sam) | ✅ 0 false hints on fixtures, recall 11/12; contextual like/thing (#85) | #75, #85 |
| T-302 | Step 3 mode | AI (Sam) | ✅ merged; swipe pause; key words log-only | #78 |
| T-303 | Keyword extractor | LOGIC | ✅ | #52 |
| T-304 | Companion v3 (Step 3 settings, log) | UI | ✅ merged and wired to the detector by ORCH (`src/modes/index.ts` `settingsDetector`). Open nits: hide the card unless Step 3 is on; `eager` without content words | #82, #83 |
| T-305 | Stretch: head tilt (up/down only, D9) | GLASS | ⬜ only after G2 | — |
| T-306 | 🚦 Gate G3 | ORCH + GLASS | **READY TO RUN** (runbook in TASKS) | — |
| T-401 | Judge demo (in-companion Demo tab) | UI | ✅ | #40, #44, #47 |
| T-402 | Beta final + lifecycle tests | GLASS | ⬜ | — |
| T-403 | Paper design polish | UI | 🟡 partly done (tagline, focus rings, contrast, Devpost asset index, Home copy, preview captions, Words asset hint, Step 3 demo); #80 needs a rebase | #41→#44, #47, #64, #69, #71, #83, #80 |
| T-404 | Devpost + demo script | ORCH | ⬜ | — |
| T-405 | Final audit + submission | ORCH | ⬜ | — |

ORCH infrastructure PRs: #2, #5, #6, #10, #12, #14, #15, #16, #19, #25, #27, #30, #32, #35, #37, #39, #42, #45, #46, #54, #55, plus this update.

## Decisions (full text: `PLAN.md` §13)

| ID | Decision |
|---|---|
| D1 | Step 1 never sends the target word as an STT keyterm (it causes false "correct" results) |
| D2 | Steps 2-3 send personal names, medications and places as realtime keyterms, never the on-screen candidates |
| D3 | `api/stt` only mints single-use tokens; no audio passes through our servers |
| D4 | `app.json` network whitelist: ElevenLabs `https` + `wss`, and our Vercel host |
| D5 | Always `language_code=en`; drop empty realtime commits; speech state from local VAD |
| D6 | Device testing uses packaged Beta builds (QR is broken on Even's side) |
| D7 | Glasses mic only (`g2-microphone`); the phone mic is unreliable |
| D8 | Lock/background via `document.visibilitychange`; SDK 0.0.12 has no `setBackgroundState` |
| D9 | Head tilt is up/down only (T-305 stretch) |
| D10 | Every Beta upload bumps `app.json` above the last upload |
| D11 | Gemini `gemini-3.5-flash-lite`, minimal thinking, few-shot; free tier with a throttle (≤12/min prefetch, 3/min for taps, never retry 429) |
| D12 | Fallback v2: no boost for already-said non-name words, partial-word prefix, `[]` when nothing fits |
| D13 | `dropSamples` false for the hackathon (the demo needs the sample names and meds) |
| D14 | Predictor timeout 1.5 s (measured p95 ~1.15 s through Vercel); real predictor wired |
| D15 | Production `api/` only from merged `integration` or a gate tag, via `bash api/_deploy-prod.sh`; never `vercel --prod` from a checkout |
| D16 | G1 passes; mic-denied (A4) accepted via unit tests, since the device can't trigger it; A4 reworded; A3/A5/A7 run at G2 |
| D17 | Packaged builds default to batch rolling STT and Step 2 on (`.env.production`); realtime stays in the code until `wss://` works on the device |
| D18 | G2 passes on function; latency is a known issue (T-208); ladder request scoped to letters-first (T-209), no tilt left/right (D9 stands) |

## Blockers and risks

| # | Item | Impact | Owner | Mitigation |
|---|---|---|---|---|
| 1 | ~~Packaged WebView origin unknown; production origins too loose~~ **Resolved (H11:45):** production now answers `127.0.0.1:<port>` and `localhost:5173` preflights with 204, and `null` and `file://` with 403 (checked live) | — | Sam | Done |
| 2 | **Realtime `wss://` STT gets no transcript on the G2.** The cause is **unconfirmed**: the whitelist entry is correct (`wss://api.elevenlabs.io` matches `realtime.ts`'s URL exactly), and the simulator works end to end (#89). Suspects: the Even app's matching or CSP for `wss://`, WebSockets unsupported, or the realtime token step | Steps 2-3 run on batch (D17), at the cost of latency | AI / GLASS | **Mitigated by D17.** Optional: run #89's probe on the device (5 min) to decide whether realtime is worth reviving; check the Vercel log for `realtime_scribe` token mints during the 0.4.0 run |
| 3 | Gemini **free tier 15 req/min, daily cap unknown** | Suggestions fall back to bank-only under load | AI | Throttle (D11); check AI Studio → Rate limits before the demo; billing would remove it |
| 4 | **Vercel Hobby** blocks Git deploys from non-members; only Sam can deploy | A deploy bottleneck | AI | D15: only `bash api/_deploy-prod.sh` (merged commits, auto-checks). A `vercel --prod` from a checkout caused the 9-minute 500 outage (05:07-05:16 UTC, issue #56) |
| 5 | Single-device team (one G2) and minutes-long pack/upload cycles | Slow device iteration | GLASS | Simulator first; batch device checks; G1 and G2 back to back when possible |
| 7 | **Vercel Hobby deploy quota exhausted** (100 per 24 h, rolling; error `api-deployments-young-hobby-team-24h` on every PR since about #79). Cause: every branch push made a preview deploy | **Production keeps serving** (checked live), but Sam **can't redeploy `api/`** until slots free up. Each freed slot was being used by the next push | ORCH / Sam | `vercel.json` `git.deploymentEnabled: false` (this PR) stops preview deploys. `api/_deploy-prod.sh` writes its own `vercel.json`, so production deploys are unaffected. **Avoid `api/` changes before the demo**; if one is critical, Sam checks `vercel ls` for a free slot. Ignore the red "Vercel" status on PRs; `verify` is the check that counts |
| 6 | Not yet seen on hardware: mic denial path, SDK storage persistence across restarts, multiple `onEvenHubEvent` listeners | Possible G1 failures | GLASS | G2_SMOKE A4, A7, B5 cover them explicitly |

## G1 troubleshooting (symptom → cause → fix)

There are no console logs on the device. Use the phone companion's **Preview** tab (it mirrors every glasses Screen) and **Step 1** tab (saved sessions), plus the Vercel function log (Sam; kept 1 hour).

| What Sarah sees | Most likely cause (from our code) | Fix |
|---|---|---|
| The portal rejects the upload, or the old build still runs | Version not above the last upload (D10) | ORCH bumps `app.json` to 0.3.1 and re-packs |
| **"No connection. Tap to try again."** (seen at G1, H10:45; **confirmed and fixed H11**) | **Confirmed root cause: the WebView's origin `http://127.0.0.1:<port>` wasn't allowed.** The token POST is preflighted; production answers a disallowed origin with **403 and no CORS headers**, so the browser blocks it and `fetch` throws, which maps to `network`. Verified on production: only `http://localhost:5173` passes; `null`, `file://`, `https://localhost`, `capacitor://localhost` and no-origin all get 403. Less likely: the installed build predates #54 (packed between 9:45 and 10:13 PM, so the Vercel host isn't whitelisted), or the phone is offline | **Sam:** read the Vercel log for `stt-token: rejected origin "…"` (kept 1 h) and add that exact origin to `STT_ALLOWED_ORIGINS`; if it's missing, set `STT_ALLOW_MISSING_ORIGIN=1`. If the log is gone or unclear, temporarily set `STT_ALLOWED_ORIGINS=*` (the handler supports it; dev only) plus `STT_ALLOW_MISSING_ORIGIN=1` to unblock G1, then tighten. Redeploy with `api/_deploy-prod.sh`. **No re-pack needed.** **Sarah:** confirm the build was packed from `integration` at or after `930db50` (#54) |
| **"Could not hear you. Tap to try again."** right after speaking | The request reached a server that answered with an error the browser could read (token minting or Scribe failed: `unknown`) | Ask Sam to check the Vercel log; retry |
| **"Microphone is off. Tap to try again."** | `audioControl(true, Glasses)` returned false: `g2-microphone` permission denied, or never prompted | Allow the mic for Nudge in the Even app, then tap to retry. That's also smoke check A4 |
| The prompt sits for ~8 s and then moves up a cue, over and over | VAD never hears speech (glasses mic quiet, or speaking too far away; speech must be ≥12 dB over the room floor and above −50 dBFS) | Speak closer and louder. If it persists, the VAD thresholds need tuning: send the details to Sam |
| **"That took too long."** | Scribe took over 4 s (slow venue Wi-Fi) | Retry; try another network or a phone hotspot |
| Every answer gets **×** with odd text | STT works, but Scribe "corrected" the word (S-1 Q5), or the matcher is strict for 3-4 letter words | Expected sometimes; note the words. Not a G1 blocker unless it's every word |
| **Touchpad stops responding while Step 1 is listening** | The SDK delivers events to only one `onEvenHubEvent` listener (risk 6, B5) | **G1 blocker.** Stop and report it; ORCH + GLASS switch to a single event dispatcher |
| Pictures don't show at cue level 1 | `updateImageRawData` rejected the PNG (size or format) | Not a G1 blocker (the ladder still works with letters); note it for GLASS |
| Glasses stay blank after launch | The startup page failed, or the app crashed before the launcher | Check the phone page: if the companion renders, the JS is running. Reinstall; report the version and exact steps |

## Next steps by person

| Person | Now | Then |
|---|---|---|
| **Sarah (GLASS)** | **Run G3 now** (TASKS T-306): `VITE_STEP3=1 npm run pack` from `integration` ≥ `a34bc50` (0.4.3); latency tally, ladder check, 10-min soak | T-402 final Beta |
| **Sam (AI)** | T-208 done. Support the G3 run (tune `minSilenceMs` from the soak); turn off Git deploys in Vercel; no `api/` redeploys | T-404 help: Devpost technical section |
| **juannli (LOGIC via Devin + UI)** | **#93**: switch to `revealWord` (the review is still open); rebase or close #88 | Refresh `15-phone-companion.png` for Devpost; final T-403 polish |
| **Aarav (ORCH)** | Audit T-209 part 2 and #93; record G3 + the T-208 tally; on a pass, tag `v0.3-step3` | **T-404 Devpost + demo script**, T-405 final submission |

## Loose ends (non-blocking)

- `check-ownership` can't tell who opened a branch, so the `orch/` prefix is honor-system (see closed #63). Real enforcement needs CODEOWNERS + branch protection (repo admin: Sam).
- `ai/spike-stt` has a stray commit (`check-key.mjs`) never PR'd. Open a PR or drop it.
- `spikes/stt/token-server.mjs` should bind `127.0.0.1` by default (S-1 review nit).
- S-3 0.1.2 rerun: SDK storage timing, phone-mic retry, blank-screen darkness confirmation.
- The companion Debug tab needs an `AppShell` transcript/suggestion feed (contract v3) to work in production.
- `src/glasses/screenshots/*.png` could move to `docs/` later.

## Infrastructure quick reference

- **Device workflow:** packaged Beta only. `npm run pack` → upload at hub.evenrealities.com → Me → Beta tester. URLs come from `.env.production`. Gate flags at pack time (`VITE_STEP2=1`, `VITE_STEP3=1`). Checklists: `docs/G2_SMOKE.md`; results: `docs/BETA_RESULTS.md`.
- **Hosting:** Vercel `la-hacks-team/nudge`, region `iad1`. Env (set on Vercel only): `ELEVENLABS_API_KEY`, `GEMINI_API_KEY`, `STT_ALLOWED_ORIGINS` (also used by `api/predict`). Deploy: `bash api/_deploy-prod.sh [ref]` (AI lane).
- **Ownership:** `OWNERS.json` lanes + `branchGrants`; CI `check-ownership` on every PR. Active grants: `ai/step3-mode`, `glass/renderer`, `logic/step1-mode`, `glass/step2-mode`, `glass/audio-rolling`, `logic/predictor-v2`, `logic/foundation`, `glass/scaffold`.
- **Builder prompts:** `docs/prompts/phase0-builder-prompts.md`, `docs/prompts/phase1-builder-prompts.md`.

## Update log

| When | Change |
|---|---|
| Sun 12:50 AM (H13:50) | Merged #98 (T-209 part 2: letters-only suggestions). **G3 ready to run** from `a34bc50` (0.4.3; pack verified). #93 still needs `revealWord` |
| Sun 12:45 AM (H13:45) | Merged #96 (T-208 flush on tap: sim median ≈ 1.49 s), #95 (T-209 part 1: letters-first on the glasses), #94 (docs). #93 changes requested (one shared `revealWord`). `app.json` → 0.4.3 for the G3 pack |
| Sun 12:20 AM (H13) | **G2 PASSED** (D18, #91): `main` → `ae2294d`, tag `v0.2-step2`; D17 batch default. CONTRACT_VERSION 3 (`flush?`, letters-first candidates). New: T-208 (Sam), T-209 (Sarah), T-210 (juannli). Merged #80, #89, #90. Blocker #2 reworded: the cause is unconfirmed, and the whitelist entry is correct |
| Sun 12:10 AM (H12:10) | Merged #85 (AI cleanup: token wedge fix, `stt.no-speech` diagnostics, shared `api/` helpers, not deployed) and #78 (T-302). ORCH wired the companion's Step 3 Pause/Sensitivity into the detector. **G3 code complete** |
| Sat 11:55 PM (H11:55) | Merged #82 (T-304) and #83 (Step 3 demo); #80 needs a rebase; #78 approved (waiting on ready). D17 approved by aaravj9 for a G2 pass; gate PR staged |
| Sat 11:45 PM (H11:45) | Found the Vercel Hobby quota exhausted (blocker #7). Added `vercel.json` to stop Git preview deploys; production unaffected. Blocker #1 resolved (origins tightened, checked live) |
| Sat 11:40 PM (H11:40) | G2 on the device: the realtime build gave Step 2 no transcript (blocker #2). Sarah re-packed `a0052a5` as **0.4.2 with `VITE_ROLLING_STT=batch`**; `app.json` set to 0.4.2. Proposed D17 (batch default for packaged builds) pending the G2 result |
| Sat 11:30 PM (H11:30) | Pre-G2 sweep of every open PR and branch. Merged #76 (T-108; juannli merged it), #69 (leak fixed), #71, #75 (T-301). #73 closed. #78 (T-302) reviewed as a draft; `ai/step3-mode` grant added. **`integration` `82e487d` ready for the G2 pack** |
| Sat 10:30 PM (H10:30) | First version. Step 1 and Step 2 code complete; production `api/` healthy; G1 ready to run |
| Sat 11:15 PM (H11:15) | **G1 PASSED** (#68). `main` → `4b13180`, tag `v0.1-step1`. D16 (A4 via unit tests; G2_SMOKE A4 reworded). Merged #70, #65; #69 changes requested; T-108 filed (#73). G2 ready to run |
| Sat 11:00 PM (H11) | G1 origin root cause confirmed from the Vercel log (`http://127.0.0.1:61976`), fixed on Vercel + #61. Merged #62 (T-205), #64 (T-403 assets). #63 closed. LOGIC tool → Devin. Open: tighten production origins |
| Sat 10:50 PM (H10:50) | G1 symptom "No connection" traced to a CORS preflight 403 for the WebView origin (verified on production); troubleshooting table corrected |
| Sat 10:45 PM (H10:45) | Applied Sam's TASKS corrections (production live, deploy script); D15 deploy rule; #56 closed. G1 in progress on the device (Sarah); T-205 about to be pushed (juannli) |
