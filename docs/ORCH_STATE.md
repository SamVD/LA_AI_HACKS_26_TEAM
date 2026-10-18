# ORCH State

The orchestrator's single snapshot of where Nudge stands. **ORCH updates this after every gate (G1, G2, G3, final) and after any merge that changes a gate's readiness.** Detailed task cards live in `TASKS.md`, decisions in `PLAN.md` §13, contracts in `docs/CONTRACTS.md`.

_Last updated: **Sat Oct 17, 2026, 10:30 PM PT (hackathon hour ~H10:30 of 24)** by ORCH (aaravj9)._

## Snapshot

| Item | Value |
|---|---|
| `integration` | `c297bbf` (PR #57). CI green: typecheck, 533 tests, build, ownership |
| `main` | `278ad9b` (PR #2). **Not fast-forwarded yet**: moves at G1 |
| Tags | none yet (`v0.1-step1` at G1, `v0.2-step2` at G2, `v0.3-step3` at G3) |
| `app.json` version | **0.3.0** (not uploaded yet). Last Beta upload: 0.2.0 (T-101 gallery build). Bump for every upload (D10) |
| Contracts | `CONTRACT_VERSION 2` |
| Production `api/` | `https://nudge-seven-psi.vercel.app` = `integration` @ `4b13180`. Verified 10:20 PM: `api/stt/token` 200 (both types), foreign origin 403, `api/predict` 200 in 0.94 s |
| Open PRs | none |
| Open issues | #56 (Sam → ORCH handoff): items 1-3 done in #55, item 4 is in the G1 runbook. Closed with this update |

## Gates

| Gate | What it proves | Status | Blocker / next action |
|---|---|---|---|
| **G1: Step 1 on the real G2** | Practice: 10 prompts, cue ladder, √/× feedback, lock/resume, mic denial, exit | **READY TO RUN.** All code merged (T-101 to T-106); the renderer already passed on the G2 (#38); hosting is live | **Sarah runs the T-107 runbook now.** Ping Sam within 1 h of the first STT attempt (the WebView origin probably needs adding to `STT_ALLOWED_ORIGINS`) |
| **G2: Step 2 in a live conversation** | Help tap → good suggestion in ≤ ~1.5 s on most attempts; Step 1 regression | **Code complete** (T-201, T-202, T-203, T-204 merged and wired) | After G1. Sarah + a second person run the T-207 runbook (`VITE_STEP2=1 npm run pack`). Risk: `wss://` whitelist → batch fallback |
| **G3: Step 3 ambient hints** | Auto-hints after a stall, no false-hint spam in a 10-minute soak | **Not started** (T-301 and T-302 TODO; T-303 merged) | After G2. Ships flag-off unless it passes (PLAN §2) |
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
| T-007 | Fixture realism | LOGIC | ✅ (eval-04 "Sunrise Clinic" fix still open) | #23 |
| S-1 | ElevenLabs STT spike | AI (Sam/juannli) | ✅ | #17 |
| S-2 | Gemini predictor spike | AI (Sam) | ✅ | #26 |
| S-3 | On-device audio/IMU spike | GLASS | ✅ (0.1.2 rerun items open, not blocking) | #20 |
| T-101 | Glasses renderer, input, shell, lifecycle | GLASS | ✅ **passed on the real G2** | #29, #38 |
| T-102 | Step 1 Practice mode | LOGIC | ✅ | #34 |
| T-103 | Fuzzy matcher | LOGIC | ✅ | #21 |
| T-104 | Glasses mic, VAD, utterance STT, `api/stt` | AI (Sam) | ✅ wired, hosted | #33, #37, #50 |
| T-105 | Phone companion v1 + preview | UI | ✅ | #11, #18 |
| T-106 | Assets, content API, store | LOGIC | ✅ (40 PNGs verified in a browser) | #22, #28 |
| T-107 | 🚦 Gate G1 | ORCH + GLASS | **READY TO RUN** | — |
| T-201 | Predictor (fallback v2, throttle, 429) | LOGIC | ✅ wired, 1.5 s timeout | #31, #51, #55 |
| T-202 | Rolling transcript (realtime) | GLASS (reassigned) | ✅ wired | #49, #54 |
| T-203 | `api/predict` Gemini proxy | AI (Sam) | ✅ hosted | #53, #57 |
| T-204 | Step 2 Assist mode | GLASS | ✅ | #43 |
| T-205 | Mouth-shape resolver | LOGIC | 🟡 branch `logic/mouth-resolver` pushed, **no PR**; thin vs the card (60-word table, wiring into `resolveAssets`) | — |
| T-206 | Companion v2 (personal words, debug) | UI | ✅ (Debug tab dev-only until the shell exposes transcripts) | #24, #36, #48 |
| T-207 | 🚦 Gate G2 | ORCH + GLASS | after G1 | — |
| T-301 | Stall detector | AI | ⬜ | — |
| T-302 | Step 3 mode | AI | ⬜ | — |
| T-303 | Keyword extractor | LOGIC | ✅ | #52 |
| T-304 | Companion v3 (Step 3 settings, log) | UI | ⬜ | — |
| T-305 | Stretch: head tilt (up/down only, D9) | GLASS | ⬜ only after G2 | — |
| T-306 | 🚦 Gate G3 | ORCH | ⬜ | — |
| T-401 | Judge demo (in-companion Demo tab) | UI | ✅ | #40, #44, #47 |
| T-402 | Beta final + lifecycle tests | GLASS | ⬜ | — |
| T-403 | Paper design polish | UI | 🟡 partly done (tagline, focus rings, contrast) | #41→#44, #47 |
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

## Blockers and risks

| # | Item | Impact | Owner | Mitigation |
|---|---|---|---|---|
| 1 | The packaged WebView's **Origin is unknown**; `STT_ALLOWED_ORIGINS` only has `http://localhost:5173` | The first device STT/predict call gets 403 | Sarah → Sam | Ping Sam within 1 h of the first attempt (Vercel Hobby log retention); he adds the origin and redeploys in ~2 min. No re-pack needed |
| 2 | **`wss://` may not pass the Even whitelist** | Step 2 hears nothing on the device | GLASS | Re-pack with `VITE_ROLLING_STT=batch` (PLAN §9) |
| 3 | Gemini **free tier 15 req/min, daily cap unknown** | Suggestions fall back to bank-only under load | AI | Throttle (D11); check AI Studio → Rate limits before the demo; billing would remove it |
| 4 | **Vercel Hobby** blocks Git deploys from non-members; only Sam can deploy | A deploy bottleneck | AI | Only `bash api/_deploy-prod.sh` (merged commits, auto-checks); never `vercel --prod` from a working checkout (caused the 9-minute 500 outage, issue #56) |
| 5 | Single-device team (one G2) and minutes-long pack/upload cycles | Slow device iteration | GLASS | Simulator first; batch device checks; G1 and G2 back to back when possible |
| 6 | Not yet seen on hardware: mic denial path, SDK storage persistence across restarts, multiple `onEvenHubEvent` listeners | Possible G1 failures | GLASS | G2_SMOKE A4, A7, B5 cover them explicitly |

## Next steps by person

| Person | Now | Then |
|---|---|---|
| **Sarah (GLASS)** | **Run G1** (TASKS T-107): clean `integration` → `npm ci && npm test && npm run pack` → install 0.3.0 → G2_SMOKE A, B (incl. B5/B6), C → record in `docs/BETA_RESULTS.md` | G2 with a second person (T-207, `VITE_STEP2=1`); then T-305 only if time allows |
| **Sam (AI)** | Stand by during G1/G2 to add the WebView origin; deploy only via `api/_deploy-prod.sh` | **T-301** stall detector (tune on T-007 fixtures), then T-302 Step 3 mode |
| **juannli (LOGIC + UI)** | Finish **T-205** (60-word table, wire into `resolveAssets`) and open a PR; eval-04 fixture fix | T-304 (Step 3 settings and log) after T-301; T-403 final polish pass |
| **Aarav (ORCH)** | Record G1; on a pass: fast-forward `main`, tag `v0.1-step1` | Run G2 the same way; make `step2Enabled` the default on a G2 pass; start T-404 (Devpost, demo script) |

## Loose ends (non-blocking)

- `ai/spike-stt` has a stray commit (`check-key.mjs`) never PR'd. Open a PR or drop it.
- `spikes/stt/token-server.mjs` should bind `127.0.0.1` by default (S-1 review nit).
- T-007 eval-04 should accept "Sunrise Clinic"; T-203 noted the eval-21 plural "stamp/stamps".
- S-3 0.1.2 rerun: SDK storage timing, phone-mic retry, blank-screen darkness confirmation.
- The companion Debug tab needs an `AppShell` transcript/suggestion feed (contract v3) to work in production.
- `src/glasses/screenshots/*.png` could move to `docs/` later.

## Infrastructure quick reference

- **Device workflow:** packaged Beta only. `npm run pack` → upload at hub.evenrealities.com → Me → Beta tester. URLs come from `.env.production`. Gate flags at pack time (`VITE_STEP2=1`, `VITE_STEP3=1`). Checklists: `docs/G2_SMOKE.md`; results: `docs/BETA_RESULTS.md`.
- **Hosting:** Vercel `la-hacks-team/nudge`, region `iad1`. Env (set on Vercel only): `ELEVENLABS_API_KEY`, `GEMINI_API_KEY`, `STT_ALLOWED_ORIGINS` (also used by `api/predict`). Deploy: `bash api/_deploy-prod.sh [ref]` (AI lane).
- **Ownership:** `OWNERS.json` lanes + `branchGrants`; CI `check-ownership` on every PR. Active grants: `glass/renderer`, `logic/step1-mode`, `glass/step2-mode`, `glass/audio-rolling`, `logic/predictor-v2`, `logic/foundation`, `glass/scaffold`.
- **Builder prompts:** `docs/prompts/phase0-builder-prompts.md`, `docs/prompts/phase1-builder-prompts.md`.

## Update log

| When | Change |
|---|---|
| Sat 10:30 PM (H10:30) | First version. Step 1 and Step 2 code complete; production `api/` healthy; G1 ready to run |
