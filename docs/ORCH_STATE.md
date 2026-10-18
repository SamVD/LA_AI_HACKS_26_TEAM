# ORCH State

The orchestrator's single snapshot of where Nudge stands. **ORCH updates this after every gate (G1, G2, G3, final) and after any merge that changes a gate's readiness.** Detailed task cards live in `TASKS.md`, decisions in `PLAN.md` §13, contracts in `docs/CONTRACTS.md`.

_Last updated: **Sun Oct 18, 2026, 6:35 AM PT** by ORCH (aaravj9). Sarah is up. **Next: T-316 (log-only speaker levels, ~20 min), then the G3 re-run with `VITE_STEP3=1 VITE_DEBUG=1 npm run pack` (0.4.4).** T-314 on hold until G3 data. G1 and G2 PASSED; G3 HELD._

## Wake-up plan (3:45-7:00 AM build window, then ship by 10:00)

**Where we are at 3:45:**
- `integration` has Step 1, Step 2 (letters-first ladder, flush on tap) and Step 3 (works, but ~3-4 s per hint).
- **Two safe builds exist:**
  - `v0.2-step2` (`ae2294d`): G2 passed.
  - `backup-g3-working` (`34e46db`): the G3 run-1 build. A backup, not a passed gate.
- Every task card is in `TASKS.md` → "Phase 3b". Nothing below needs a new decision unless a decision point says so.

### Timeline (PT)

| Time | What | Who |
|---|---|---|
| **3:45** | Everyone pulls `integration`. Post the messages below. | Aarav |
| 3:45-5:00 | **T-311** early stall prediction | Sam |
| 3:45-4:30 | **T-312** launcher: label (Sarah), Step 3 title (Sam, one line), phone Home (juannli) | Sarah, Sam, juannli |
| 3:45-4:15 | **T-315** "Export session log" button | juannli |
| 4:15-5:15 | **T-313** Step 1 short-speech filter | juannli (Devin) |
| as PRs land | Audit and merge. When T-312 is in, flip `.env.production` to `VITE_STEP2=0`, `VITE_STEP3=1`; bump to **0.4.4** | Aarav |
| **5:15-6:00** | **G3 re-run** on 0.4.4: 10-min soak with tally, 10 timed taps, Step 1 check, log export | Sarah + a partner |
| 6:00-6:30 | Record G3, decide what ships (decision point B), tag `v0.3-step3` on a pass | Aarav |
| 6:30-7:00 | Last fixes from the re-run only. **Code freeze 7:00** | all |
| 7:00-7:45 | **T-402 final Beta**: pack the shipping build, install, 5-minute smoke on the G2, keep the `.ehpk` | Sarah |
| 7:00-9:30 | **T-404 Devpost + demo script + video**; screenshots (`15-phone-companion.png`) | Aarav (+ juannli for screenshots) |
| 9:30-10:00 | **T-405** final audit + submit (Devpost due **10:00**) | Aarav |

### Priority: what must get done, what gets dropped

| Priority | Task | If it slips |
|---|---|---|
| **MUST 1** | **T-311** early stall prediction (Sam). The latency fix; G3 depends on it | Not merged by **5:15** → ship without it; G3 re-run tests run-1 speed; decision point B |
| **MUST 2** | **T-312** launcher Practice + Conversation (+ ORCH flag flip) | Not in by **5:00** → ship the current launcher (Step 1 / Step 2 / Step 3 if on). Cosmetic, no risk |
| **MUST 3** | **T-315** export button (juannli). The tally needs data | Not in by **5:15** → the re-run uses a stopwatch + paper tally |
| **MUST 4** | **G3 re-run** with tally (Sarah) | Can't be skipped. Without it, decision point B defaults to "Step 3 off" |
| **MUST 5** | **T-402 final Beta**, **T-404 Devpost**, **T-405 submit** | Never dropped. These start at 7:00 regardless |
| SHOULD | **T-313** Step 1 short-speech filter (Devin) | Not merged by **5:30** → drop; demo Step 1 in a quiet spot |
| DROP FIRST | **T-314** speaker tagging by loudness (Sam) | Only after T-311 is merged. **Not stable on the device by 5:30 → drop** (it ships off; Step 3 behaves as today) |
| DROP | #89 `wss://` probe; asking Even about `wss://` (R-4) | Only if someone is idle at the venue |
| DROPPED (D19) | Full pipeline inspector, Gemini billing, head tilt left/right | — |

### Decision points (ORCH decides; Aarav confirms)

- **A, 5:15:** is T-311 merged? Yes → G3 re-run on 0.4.4 with it. No → re-run anyway, so we have numbers.
- **B, 6:00, what ships:** two outcomes.
  - **Pass:** Step 3 **ON**, launcher **Practice + Conversation**, tag `v0.3-step3`. The bar:
    - roughly **≤ 1 false hint per 5 min**;
    - **at least 1 helped hint**;
    - a typical auto-hint **≤ ~2.5 s**;
    - tap help **≤ ~2 s**.
  - **Fail:** ship **Practice + Assist**, set by `VITE_STEP2=1` and no `VITE_STEP3` in `.env.production`. That's the G2-passed behavior plus T-208/T-209. The demo shows Step 3 only on the phone's judge demo, honestly labelled.
- **C, 7:00:** freeze. After this, only a fix for a broken demo, with ORCH's audit.

### Messages to post at 3:45 (copy and paste)

**Sam:**
> Morning! Pull `integration`. **T-311 first** (card in TASKS → Phase 3b): when a final transcript ends like a stall ("…into the", "…um"), start the Gemini prediction immediately. Skip the 5 s gap between predictions, but keep the 15/min window and the tap reserve. The help that follows should be a cache hit or share the in-flight call (one Gemini call). Branch `ai/stall-prefetch` (OWNERS grant for the throttle and Step 2 files). Target in the simulator: end of speech → candidates **≈ 1.5-2 s**. **Please have it merged by 5:15.** Also the one-line T-312 change: Step 3's `title` → **"Conversation"** (`ai/conversation-title`). Only after T-311: **T-314** loudness speaker tagging, using the new optional `speaker` field (CONTRACT v4). **If it isn't stable on the device by 5:30, it ships off.**

**Sarah:**
> Morning! Pull `integration`. **T-312:** in `src/glasses/shell.ts`, show just each mode's `ModeInfo.title` in the launcher (no "Step N" prefix), so it reads **Practice / Conversation** (`glass/launcher-names`). Then at **~5:15**, the **G3 re-run** on **0.4.4** (I'll bump it and flip the flags):
> 1. a 10-minute two-person soak, counting helped / false / missed hints;
> 2. 10 timed help taps right after a hesitation;
> 3. a quick Step 1 check;
> 4. **"Export session log"** on the phone, pasted into your results PR.
>
> At 7:00 you'll do the **final Beta pack** (T-402).

**juannli:**
> Morning! Pull `integration`. In this order:
> 1. **T-315** (`ui/log-export`): an **"Export session log"** button on the phone that copies `eventLog.toJSON()` (`src/debug/eventLog`) to the clipboard, plus an entry count. Needed by 5:15 for Sarah's re-run.
> 2. **T-312** (`ui/conversation-home`): when Step 3 is in the build, hide the Step 2 card on Home. The Conversation copy reads "Hints appear on their own after a pause; tap anytime for help."
> 3. **T-313** via Devin (`logic/step1-attempt-filter`): Step 1 only counts an answer if it's **≥ 300 ms** long (`tEndMs - tStartMs`). Shorter ones are ignored and it keeps listening, with no cue change. Drop it if it isn't merged by 5:30.
>
> At 7:00, refresh `15-phone-companion.png` for Devpost.


## Snapshot

| Item | Value |
|---|---|
| `integration` | **`a08b135`** after #108, #109, #110 (+ this PR). typecheck, build, **797 tests**. **G3 re-run pack: `VITE_STEP3=1 VITE_DEBUG=1 npm run pack`** (0.4.4; the Debug tab has the session-log export). Final judge build: no `VITE_DEBUG` |
| `main` | **`ae2294d`** (fast-forwarded at G2: the tested 0.4.2 code + D17 + D18; a plain `npm run pack` reproduces it byte-for-byte) |
| Tags | `v0.1-step1` → `4b13180` (G1); **`v0.2-step2` → `ae2294d`** (G2); **`backup-g3-working` → `34e46db`** (the G3 run-1 build, 0.4.3 + `VITE_STEP3=1`; a backup, **not** a passed gate). Next: `v0.3-step3` on a G3 pass |
| `app.json` version | **0.4.4** for the G3 re-run upload. 0.4.3 = G3 run 1 (`backup-g3-working`); 0.4.2 = G2 |
| Contracts | **`CONTRACT_VERSION 4`**: v3 (`SttService.flush?`, letters-first candidates) + v4 (`Speaker`, `speaker?` on `Transcript`/`SpeechState`, T-314) |
| Production `api/` | `https://nudge-seven-psi.vercel.app`, redeployed by Sam with the WebView origin. At 10:54 PM: `127.0.0.1:<any port>` preflight 204, **but `null` and `file://` also 204, so it's looser than intended**; tighten after #61 (see blockers) |
| Open PRs | #111 (juannli): **hold, don't merge.** Flips pack defaults to Conversation; ORCH does it at decision B, after the G3 re-run |
| Open issues | none (#73 closed by #76) |

## Gates

| Gate | What it proves | Status | Blocker / next action |
|---|---|---|---|
| **G1: Step 1 on the real G2** | Practice: 10 prompts, cue ladder, √/× feedback, lock/resume, mic denial, exit | ✅ **PASSED (H11:15, #68)**: real speech graded on the G2; lock, exit, B5, B6 pass; A4 accepted via unit tests (D16). Tagged `v0.1-step1` | Done. A3/A5/A7 carried to G2 |
| **G2: Step 2 in a live conversation** | Help tap → good suggestion in ≤ ~1.5 s on most attempts; Step 1 regression | ✅ **PASSED on function (H13, D18, #90/#91)**: 0.4.2 batch followed the conversation ("warm and um um" → "sunny"); Step 1 + T-108 clean. **Latency not demonstrated** (the tester said 2-3 s) | Tagged `v0.2-step2`. Latency → **T-208**; ladder request → **T-209/T-210** |
| **G3: Step 3 ambient hints** | Auto-hints after a stall, no false-hint spam in a 10-minute soak | **HELD (D19).** Run 1 (#100, 0.4.3): works, but ~3-4 s per hint and no tally. Measured: Gemini via Vercel ~1.0 s (0.94-1.27); the 1.5 s stall silence is the largest share | Re-run on 0.4.4 at ~5:15 after T-311 (+T-312/T-313; T-314 if stable by 5:30) with a tally and a T-315 log export (see Wake-up plan) |
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
| T-210 | Phone preview + demo: letters-first | UI (juannli) | ✅ uses `revealWord` | #93 |
| T-301 | Stall detector | AI (Sam) | ✅ 0 false hints on fixtures, recall 11/12; contextual like/thing (#85) | #75, #85 |
| T-302 | Step 3 mode | AI (Sam) | ✅ merged; swipe pause; key words log-only | #78 |
| T-303 | Keyword extractor | LOGIC | ✅ | #52 |
| T-304 | Companion v3 (Step 3 settings, log) | UI | ✅ merged and wired to the detector by ORCH (`src/modes/index.ts` `settingsDetector`). Open nits: hide the card unless Step 3 is on; `eager` without content words | #82, #83 |
| T-305 | Stretch: head tilt (up/down only, D9) | GLASS | ⬜ only after G2 | — |
| T-306 | 🚦 Gate G3 | ORCH + GLASS | **HELD** (run 1: works, too slow); re-run after T-311 | #100 |
| T-311 | Early stall prediction (latency, free tier) | LOGIC (juannli, reassigned from Sam) | ✅ merged; device numbers from the G3 re-run | #104 |
| T-312 | Launcher: Practice + Conversation | UI ✅ #103 · launcher ✅ #109 · title ✅ #110 · ORCH flags ⬜ at decision B | 🟡 code done | #103, #109, #110 |
| T-313 | Step 1 ignores short/background speech | LOGIC (juannli/Devin) | ✅ merged: match first (correct answers always count); ignores non-matching speech < 250 ms or `other` | #105 |
| T-314 | Speaker tagging by loudness | AI | ⏸ ON HOLD: measure first (T-316), decide after the G3 re-run with data | — |
| T-316 | Speaker loudness logging (measure-only; `stt.level` per utterance) | juannli (grant `logic/speaker-levels`) | ⬜ READY, ~20 min, **in the G3 re-run build** | — |
| T-315 | Lean pipeline log export | ORCH ✅ + UI ✅ (Debug tab; shown with `VITE_DEBUG=1` or `?debug`) | ✅ | #101, #103, #108 |
| T-401 | Judge demo (in-companion Demo tab) | UI | ✅ | #40, #44, #47 |
| T-402 | Beta final + lifecycle tests | GLASS | ⬜ | — |
| T-403 | Paper design polish | UI | 🟡 partly done (tagline, focus rings, contrast, Devpost asset index, Home copy, preview captions, Words asset hint, Step 3 demo); #80 needs a rebase | #41→#44, #47, #64, #69, #71, #83, #80 |
| T-404 | Devpost + demo script | ORCH (drafted by juannli) | 🟡 drafts merged (#113) + ORCH fact-check fixes; **[FILL]**s wait on the G3 re-run, final build, links and names | #113 |
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
| D19 | G3 held: Step 3 works but ~3-4 s per hint. Free tier; T-311 early stall prediction first, then T-312/T-313, T-314 only if stable by 5:30, T-315 log export; tallied re-run; freeze **7:00** (moved from 06:00 for the 1:45-3:45 break) |

## Blockers and risks

| # | Item | Impact | Owner | Mitigation |
|---|---|---|---|---|
| 1 | ~~Packaged WebView origin unknown; production origins too loose~~ **Resolved (H11:45):** production now answers `127.0.0.1:<port>` and `localhost:5173` preflights with 204, and `null` and `file://` with 403 (checked live) | — | Sam | Done |
| 2 | **Realtime `wss://` STT gets no transcript on the G2.** The cause is **unconfirmed**: the whitelist entry is correct (`wss://api.elevenlabs.io` matches `realtime.ts`'s URL exactly), and the simulator works end to end (#89). Suspects: the Even app's matching or CSP for `wss://`, WebSockets unsupported, or the realtime token step | Steps 2-3 run on batch (D17), at the cost of latency | AI / GLASS | **Mitigated by D17.** Optional: run #89's probe on the device (5 min) to decide whether realtime is worth reviving; check the Vercel log for `realtime_scribe` token mints during the 0.4.0 run |
| 3 | Gemini **free tier 15 req/min, daily cap unknown** | Suggestions fall back to bank-only under load | AI | Throttle (D11); check AI Studio → Rate limits before the demo; billing would remove it |
| 4 | **Vercel Hobby** blocks Git deploys from non-members; only Sam can deploy | A deploy bottleneck | AI | D15: only `bash api/_deploy-prod.sh` (merged commits, auto-checks). A `vercel --prod` from a checkout caused the 9-minute 500 outage (05:07-05:16 UTC, issue #56) |
| 5 | Single-device team (one G2) and minutes-long pack/upload cycles | Slow device iteration | GLASS | Simulator first; batch device checks; G1 and G2 back to back when possible |
| 8 | **The repo is public** (it was private earlier) | Anyone can read the full history | ORCH | **Checked H18:** all 287 commits on every branch scanned for Google/ElevenLabs keys, `sutkn_` tokens, private keys and `.env`/`.vercel` files: **clean**. Keep secrets on Vercel only |
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
| **Sarah (GLASS)** | **T-312** launcher label ("Practice", "Conversation": show `ModeInfo.title` only). Then the **G3 re-run** on 0.4.4 with the tally + log export | T-402 final Beta at 7:00 (after the freeze) |
| **Sam (AI)** | **T-311 early stall prediction (first)**; T-312 Step 3 title → "Conversation"; then T-314 speaker tagging (**ships off unless stable by 5:30**) | Support the G3 re-run |
| **juannli (LOGIC via Devin + UI)** | **T-313** Step 1 short-speech filter (Devin); **T-312** phone Home (hide Step 2, Conversation copy); **T-315** export-log button | Refresh `15-phone-companion.png`; final T-403 polish |
| **Aarav (ORCH)** | Audit T-311..T-315 as they land; flip `.env.production` (`VITE_STEP2=0`, `VITE_STEP3=1`) when T-312 is in; bump to 0.4.4; record the G3 re-run; tag `v0.3-step3` on a pass | **T-404 Devpost + demo script** (start now), T-405 submission |

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
| Sun 6:35 AM | Decided: **measure before building T-314.** New T-316 (log-only `stt.level {speechDb, peakDb, floorDb, speechMs, text}` per utterance), grant `logic/speaker-levels`, goes into the G3 re-run build; the runbook adds a speaker-labelling step (4b). T-314 on hold |
| Sun 6:30 AM | T-404 drafts merged (#113, `docs/DEVPOST.md`, `docs/DEMO_SCRIPT.md`); ORCH fact-check fixes applied (T-314 not built, SVG preview, v3 gallery, 55 pictures, D16 mic advice, `c_p`, 797 tests) |
| Sun 6:20 AM | Merged #110 (Step 3 title Conversation), #109 (launcher titles; Step 2 hidden when Step 3 is on), #108 (Debug tab via `VITE_DEBUG=1`). #111 held for decision B. Repo is public: history scanned, no secrets |
| Sun 6:05 AM | Merged #105 (T-313, after the match-first fix). Left: T-312 launcher label + Step 3 title, then the G3 re-run on 0.4.4 |
| Sun 6:00 AM (H18) | Merged #103 (T-315 export + T-312 phone Home) and #104 (T-311 early stall prediction; juannli took it while Sam slept). `app.json` → 0.4.4. ~45 min behind plan: G3 re-run now, decide ~6:45, freeze 7:00-7:15 |
| Sun 1:45 AM (H14) | Team break until 3:45. Added **Wake-up plan**: timeline, must/drop priorities, decision points A-C, messages to paste. Freeze moved to **7:00**, T-314 cut-off to **5:30**. Tagged **`backup-g3-working` → `34e46db`** (the G3 run-1 build; backup, not a gate) |
| Sun 1:30 AM (H14) | **G3 HELD (D19)** after run 1 (#100): works, ~3-4 s per hint. Measured Gemini via Vercel ~1.0 s. Merged #93 (T-210), #100. Plan on the free tier: T-311..T-315 cards; CONTRACT v4 (`speaker?`); T-315 log hook (`src/debug/eventLog.ts`) wired in `main.ts`. Freeze 06:00 |
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
