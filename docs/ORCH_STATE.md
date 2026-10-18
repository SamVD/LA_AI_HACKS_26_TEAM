# ORCH State

The orchestrator's single snapshot of where Nudge stands. **ORCH updates this after every gate (G1, G2, G3, final) and after any merge that changes a gate's readiness.** Detailed task cards live in `TASKS.md`, decisions in `PLAN.md` §13, contracts in `docs/CONTRACTS.md`.

_Last updated: **Sun Oct 18, 2026, 8:40 AM PT** by ORCH (aaravj9). **Gemini is back (0.95-1.22 s).** Next: **Conversation re-test G3b on 0.4.6 (Sarah), decision at 9:30 → final judge build 0.4.7.** Read "Conversation re-test" first. Video due 11:00 AM._

## Final stretch (D25): sideways tilt, last test 0.4.9, judge build 0.5.0

| When | What |
|---|---|
| now | Sarah finishes the 0.4.8 check (tilt up/down, speaker gate) |
| **10:15** | **Cut-off:** T-319 (sideways tilt = reveal more) and T-407 (phone cleanup, extended from 10:10) PRs green. Late = dropped |
| 10:20 | ORCH merges what passed review, sets `app.json` **0.4.9**. Sarah packs the **last test build**: `npm ci && npm test && VITE_IMU=1 VITE_SPEAKER_GATE=1 VITE_DEBUG=1 npm run pack` (`VITE_STEP3` is already on) |
| 10:20-10:30 | **Final check (10 min):** suggestion showing: 10 sideways tilts → ≥ 8 reveal; 10 down/up → switch, ≤ 1 wrong reveal; 2 min talking/nodding → ≤ 1 unwanted action; partner talks with 3 pauses → 0 hints; 3 wearer stalls → ≥ 2 hints; phone UI looks right |
| 10:30 | ORCH: passing flags go into `.env.production` (`VITE_IMU=1`, `VITE_SPEAKER_GATE=1`); `app.json` **0.5.0** |
| 10:35 | Sarah packs a clean **0.5.0** (`npm ci && npm test && npm run pack`), uploads it **last**, and deletes or disables older test builds if she can. **The judge build** |
| 10:35-10:55 | Film the remaining clips on 0.5.0, cut, upload. **Submit by 11:00** |

## Late features (D22): head tilt + partner-proof Conversation, cut-off 9:45 AM

Two small features, **both off by default behind a flag**, built in parallel while Sarah runs G3b. Anything not green by 9:45 is dropped.

| Task | Who | Branch | Flag | What it does |
|---|---|---|---|---|
| **T-305** head tilt | juannli | `glass/imu-tilt` | `VITE_IMU=1` | While suggestions show: **look down = next, look up = previous** (same as a swipe). No left/right (D9). Ignored on every other screen |
| **T-314** speaker gate | Sam | `ai/speaker-gate` | `VITE_SPEAKER_GATE=1` | Chunks quieter than **−20 dB** are tagged the partner (`other`); a partner chunk never triggers or keeps a Conversation hint |

**Status:** ✅ T-314 merged (#138; juannli built it). ✅ T-305 merged (#137, after one fix: calibrate only when suggestions first appear). `app.json` **0.4.8**: Sarah can pack the feature test build.

**Timeline (all times AM):**

| When | What |
|---|---|
| 9:30 | G3b decision (D21). ORCH merges `app.json` **0.4.7** (+ `VITE_STEP3=1` on a pass). Sarah packs a clean 0.4.7 and uploads it: **the safe build; start filming the main demo on it** |
| **9:45** | **Cut-off:** T-305 / T-314 PRs open with green CI. Late = dropped |
| 9:55 | ORCH audits and merges; `app.json` → **0.4.8** |
| 10:00 | Sarah packs the **feature test build 0.4.8** (test only): `npm ci && npm test && VITE_STEP3=1 VITE_IMU=1 VITE_SPEAKER_GATE=1 VITE_DEBUG=1 npm run pack` |
| 10:00-10:12 | **Feature check** (below) |
| 10:15 | ORCH decides each feature on its own: pass → its flag goes into `.env.production`. `app.json` → **0.4.9** |
| 10:20 | Sarah packs a clean **0.4.9** (`npm ci && npm test && npm run pack`), uploads it **last**, and deletes or disables 0.4.6 and 0.4.8 if the portal allows. **0.4.9 is the judge build either way.** It's the highest version, so the 0.4.8 test build can't win. If nothing passed, it is 0.4.7's code again |
| 10:20-10:50 | Film any tilt / Conversation clips on 0.4.9; cut; upload. **Submit by 11:00** |

**Feature check on 0.4.8 (12 min, partner about 1 m away):**
1. **Tilt (5 min):**
   - Tap for help so a suggestion shows. 10 deliberate looks down / up: **at least 8** switch the right way.
   - 2 min of normal talking and nodding with a suggestion showing: **at most 1** unwanted switch.
   - Blank Conversation screen, 5 head moves: **no** pause toggle.
2. **Speaker gate (5 min, Conversation):**
   - The partner talks with 3 pauses or "um"s: **0 auto-hints**.
   - The wearer makes 3 planted stalls: **at least 2 hints**.
3. **Log (2 min):** Debug → Export session log. `imu.tilt` lines appear, and `stt.speaker` lines tag the partner `other` and the wearer `wearer`. Post the counts in Discord, and in a results PR if there's time.

**Also in 0.4.9 if green by 10:10: T-407 phone cleanup** (Cursor, `ui/phone-cleanup`, D24). Home = Practice + Conversation only, tabs Home · Preview · Word Bank · Demo, hint settings folded into the Conversation card. Phone-only: ORCH checks it in the browser at 375 px; no device check needed. **Film phone-screen shots after 0.4.9**, or keep them short.

**If G3b failed but the speaker gate passes,** ORCH may still ship Conversation in 0.4.9 (call at 10:15). That needs partner speech to give 0 hints and the wearer's stalls to give at least 2.

## Conversation re-test (G3b, D21): ✅ PASSED 9:20 AM (#134, D23)

**Why:** G3 ran with Gemini blocked (all hints were fallback words). Gemini is back as of 8:31 AM: 5 live calls took **0.95-1.22 s** with good answers, after one **2.06 s cold start**. **No new code**; the four quick fixes (#122) are already in.

**Sarah: test build 0.4.6 (test only, never the judge build).** From a clean, up-to-date `integration`:
```
npm ci && npm test && VITE_STEP3=1 VITE_DEBUG=1 npm run pack
```
Check that `app.json` says **0.4.6**, upload, install from Me → Beta tester, and confirm the launcher shows **Practice / Conversation** and the phone has a **Debug** tab. Don't film the phone screen from this build (it has the Debug tab).

**15-minute checklist (two people, partner about 1 m away, normal voices):**

| Time | Test | How | Pass |
|---|---|---|---|
| 0-1 min | Warm-up | In Conversation, say a sentence and tap once (wakes Gemini from its cold start) | Letters appear |
| 1-4 min | **A. Tap help** | 5 taps right after a hesitation ("…pour my tea into the, um" → tap). Stopwatch tap → first letters | **Median ≤ 2.5 s** and **≥ 3 of 5** show a fitting word within the top 3 (swipe to check) |
| 4-12 min | **B. Auto-hints** | Natural chat with **6 planted stalls** spread out (e.g. "it's so warm and, um…", "I need to call my, um…", "pass me the, um…"), then **stay silent** about 3 s. No taps. Note each hint: **helped** (the intended word was in it), **false** (appeared when no word was needed), or **missed** (no hint within ~4 s of a planted stall) | **≥ 3 of 6 helped**, **≤ 2 false hints** in the 8 min, typical stall → letters **≤ 3 s**, no stream of repeated hints |
| 12-13 min | C. Pause | Swipe on the blank display ("Auto-hints paused"), make a stall, swipe again | No hint while paused |
| 13-14 min | D. Practice | 3 words: one correct, one wrong (it should move up a cue), one correct | Correct ✓; a wrong answer climbs the ladder |
| 14-15 min | E. Log | Phone → **Debug** → **Export session log**; paste it with the tallies into a results PR (`docs/BETA_RESULTS.md`) | JSON exported |

**G3b passes** if B passes **and** A passes, with no crash or freeze. C and D failing are bugs to note, not blockers.

**Decision at 9:30 AM (ORCH, Aarav confirms):**
- **Pass:** ORCH merges `.env.production` with `VITE_STEP3=1` and `app.json` **0.4.7**, and tags `v0.3-step3`. The judge build is **Practice + Conversation**; Conversation includes tap-for-help, so Assist's behavior is all there.
- **Fail (or results not in by 9:30):** ORCH merges `app.json` **0.4.7** only. The judge build is **Practice + Assist** (D20).

**Final judge build 0.4.7, either way (Sarah, right after the decision):**
```
npm ci && npm test && npm run pack
```
No flags: `.env.production` decides, and there's no `VITE_DEBUG`. Then:
- upload **0.4.7 as the last upload**;
- delete or disable 0.4.6 in the Even Hub portal if it allows;
- on the phone, confirm Me → Beta tester shows **0.4.7**, the launcher is right, and there is **no Debug tab**;
- run a 5-minute smoke: 1 Practice word, 1 tap help, plus 1 auto-hint if Conversation.

The version history then reads: 0.4.5 Practice + Assist candidate, 0.4.6 G3b test, **0.4.7 judge build**.

**Video (due 11:00 AM):** film the glasses from the 0.4.7 judge build, or the glasses-only view from 0.4.6. The phone screen only from 0.4.7. Before every take, do one warm-up tap.

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
| `integration` | **`24c8ea8`** after #116 (T-316). typecheck, build, **802 tests**. **G3 re-run pack verified:** `VITE_STEP3=1 VITE_DEBUG=1 npm run pack` → 0.4.4, batch STT, Step 3 + Debug tab, `stt.level` logging |
| `main` | **`ae2294d`** (fast-forwarded at G2: the tested 0.4.2 code + D17 + D18; a plain `npm run pack` reproduces it byte-for-byte) |
| Tags | `v0.1-step1` → `4b13180` (G1); **`v0.2-step2` → `ae2294d`** (G2); **`backup-g3-working` → `34e46db`** (the G3 run-1 build, 0.4.3 + `VITE_STEP3=1`; a backup, **not** a passed gate). Next: `v0.3-step3` on a G3 pass; **`v0.3-step3` → the #136 merge commit** (G3b) |
| `app.json` version | **0.4.7** = the **safe judge build** (Practice + Conversation, no Debug, predictor timeout 2 s, no sample words to Gemini). Upload now and film on it. **0.4.8** = feature test build (D22, if T-305/T-314 land); **0.4.9** = final judge build at 10:20, uploaded last |
| Contracts | **`CONTRACT_VERSION 4`**: v3 (`SttService.flush?`, letters-first candidates) + v4 (`Speaker`, `speaker?` on `Transcript`/`SpeechState`, T-314) |
| Production `api/` | `https://nudge-seven-psi.vercel.app`, redeployed by Sam with the WebView origin. At 10:54 PM: `127.0.0.1:<any port>` preflight 204, **but `null` and `file://` also 204, so it's looser than intended**; tighten after #61 (see blockers) |
| Open PRs | #121 (T-406 Devpost finish, juannli), #118 (screenshot). #111 **closed** (D20: no Conversation default) |
| Open issues | none (#73 closed by #76) |

## Gates

| Gate | What it proves | Status | Blocker / next action |
|---|---|---|---|
| **G1: Step 1 on the real G2** | Practice: 10 prompts, cue ladder, √/× feedback, lock/resume, mic denial, exit | ✅ **PASSED (H11:15, #68)**: real speech graded on the G2; lock, exit, B5, B6 pass; A4 accepted via unit tests (D16). Tagged `v0.1-step1` | Done. A3/A5/A7 carried to G2 |
| **G2: Step 2 in a live conversation** | Help tap → good suggestion in ≤ ~1.5 s on most attempts; Step 1 regression | ✅ **PASSED on function (H13, D18, #90/#91)**: 0.4.2 batch followed the conversation ("warm and um um" → "sunny"); Step 1 + T-108 clean. **Latency not demonstrated** (the tester said 2-3 s) | Tagged `v0.2-step2`. Latency → **T-208**; ladder request → **T-209/T-210** |
| **G3: Step 3 ambient hints** | Auto-hints after a stall, no false-hint spam | ✅ **PASSED on G3b (0.4.6, #134, D23).** A: taps 2 ms cached / 0.97 s live, 3 of 4 fitting. B clean block: 3 of 3 planted stalls helped (`sunny`, `umbrella`, `gloves`; all Gemini), 0 false, 1.9-2.9 s. C pause ✅. Tag `v0.3-step3` | Ships **on** in 0.4.7: launcher **Practice + Conversation** |
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
| T-306 | 🚦 Gate G3 | ORCH + GLASS | ❌ not passed (D20); Conversation ships off | #100, #120 |
| T-311 | Early stall prediction (latency, free tier) | LOGIC (juannli, reassigned from Sam) | ✅ merged; device numbers from the G3 re-run | #104 |
| T-312 | Launcher: Practice + Conversation | UI ✅ #103 · launcher ✅ #109 · title ✅ #110 · ORCH flags ⬜ at decision B | 🟡 code done | #103, #109, #110 |
| T-313 | Step 1 ignores short/background speech | LOGIC (juannli/Devin) | ✅ merged: match first (correct answers always count); ignores non-matching speech < 250 ms or `other` | #105 |
| T-314 | Speaker tagging by loudness | AI | ⏸ ON HOLD: measure first (T-316), decide after the G3 re-run with data | — |
| T-316 | Speaker loudness logging (measure-only; `stt.level` per utterance) | juannli | ✅ merged; data comes from the G3 re-run log export | #116 |
| T-315 | Lean pipeline log export | ORCH ✅ + UI ✅ (Debug tab; shown with `VITE_DEBUG=1` or `?debug`) | ✅ | #101, #103, #108 |
| T-401 | Judge demo (in-companion Demo tab) | UI | ✅ | #40, #44, #47 |
| T-402 | Beta final + lifecycle tests | GLASS | ⬜ | — |
| T-403 | Paper design polish | UI | 🟡 partly done (tagline, focus rings, contrast, Devpost asset index, Home copy, preview captions, Words asset hint, Step 3 demo); #80 needs a rebase | #41→#44, #47, #64, #69, #71, #83, #80 |
| T-404 | Devpost + demo script | ORCH | 🟡 drafts merged (#113, #114). Non-G3 finishing moved to **T-406** (juannli); ORCH fills the G3-dependent `[FILL]`s after the decision | #113, #114 |
| T-406 | Finish Devpost (team, What we learned, local demo steps, screenshot, field map, video prep) | UI (juannli + Claude) | ✅ merged (#121); left: Devpost handles + the G3/final-build `[FILL]`s (ORCH) | #121 |
| T-317 | StepFun predictor spike, Phase A | AI (Sam) | ❌ **FAIL on latency** (#129): step-5-preview p50 6.6 s, 0/62 within 1.2 s; accurate when it answers. Like-for-like Gemini on the same 31 cases (#132): p50 764 ms, top-3 1.00, 0/31 over 1.2 s | #129, #132 |
| T-318 | StepFun in `api/predict` (Phase B) | AI (Sam) | ✖ cancelled (T-317 failed); Gemini stays the only provider | — |
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
| D21 | Fair Conversation re-test (G3b) on 0.4.6 with Gemini back; 9:30 decision; final judge build 0.4.7 (pass: Practice + Conversation; fail: Practice + Assist) |
| D20 | G3 not passed → ship Practice + Assist; four quick fixes; unblock Gemini via billing before the demo |
| D19 | G3 held: Step 3 works but ~3-4 s per hint. Free tier; T-311 early stall prediction first, then T-312/T-313, T-314 only if stable by 5:30, T-315 log export; tallied re-run; freeze **7:00** (moved from 06:00 for the 1:45-3:45 break) |

## Blockers and risks

| # | Item | Impact | Owner | Mitigation |
|---|---|---|---|---|
| 1 | ~~Packaged WebView origin unknown; production origins too loose~~ **Resolved (H11:45):** production now answers `127.0.0.1:<port>` and `localhost:5173` preflights with 204, and `null` and `file://` with 403 (checked live) | — | Sam | Done |
| 2 | **Realtime `wss://` STT gets no transcript on the G2.** The cause is **unconfirmed**: the whitelist entry is correct (`wss://api.elevenlabs.io` matches `realtime.ts`'s URL exactly), and the simulator works end to end (#89). Suspects: the Even app's matching or CSP for `wss://`, WebSockets unsupported, or the realtime token step | Steps 2-3 run on batch (D17), at the cost of latency | AI / GLASS | **Mitigated by D17.** Optional: run #89's probe on the device (5 min) to decide whether realtime is worth reviving; check the Vercel log for `realtime_scribe` token mints during the 0.4.0 run |
| 3 | Gemini **free tier 15 req/min, daily cap unknown** | Suggestions fall back to bank-only under load | AI | Throttle (D11); check AI Studio → Rate limits before the demo; billing would remove it |
| 4 | **Vercel Hobby** blocks Git deploys from non-members; only Sam can deploy | A deploy bottleneck | AI | D15: only `bash api/_deploy-prod.sh` (merged commits, auto-checks). A `vercel --prod` from a checkout caused the 9-minute 500 outage (05:07-05:16 UTC, issue #56) |
| 5 | Single-device team (one G2) and minutes-long pack/upload cycles | Slow device iteration | GLASS | Simulator first; batch device checks; G1 and G2 back to back when possible |
| 10 | ~~ElevenLabs out of credits (9:40 AM)~~ **Resolved 9:51 AM:** the account was upgraded in place (same key, no deploy); ORCH check: token 200, Scribe 200. Was:: Scribe returns 401 `quota_exceeded` (free tier, 10,000 credits, 0 left). **Every build is deaf**, including 0.4.7. Found in the 0.4.8 check (#141), reproduced by ORCH 9:49 | **Upgrade the SAME ElevenLabs account** (the one behind Vercel `ELEVENLABS_API_KEY`) to a paid tier: the key stays the same, so there's **no Vercel change and no deploy**. A new key would need a Vercel env change + `api/_deploy-prod.sh` (avoid) | Account owner (Sam / Aarav) | ORCH re-checks with a token + 0.5 s silence → expect `scribe http 200`. Then Sarah: one Practice word on 0.4.7, then the 0.4.8 check. **If not fixed by 10:05: skip the 0.4.8 check; 0.4.9 = 0.4.7 code (+ T-407)** |
| 9 | ~~Gemini free daily quota exhausted~~ **Resolved 8:31 AM:** live `/api/predict` answers again (5 calls 0.95-1.22 s; the first, cold, 2.06 s) | Warm up with one tap before tests and demo takes. Sam set a **$5/month Gemini spend cap** with alerts at 50/80/100% (#132); that covers about 25k calls, far beyond demo use | Aarav / Sam | Done |
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
| **Sarah (GLASS)** | **Now: pack 0.4.7** from `integration` (`npm ci && npm test && npm run pack`), upload, install, check the launcher shows **Practice / Conversation** and there's no Debug tab; **start filming the main demo**. ~10:00: feature check on 0.4.8. 10:20: clean **0.4.9**, uploaded last | Warm-up tap before every take |
| **Sam (AI)** | **T-314 speaker gate** (`ai/speaker-gate`, flag `VITE_SPEAKER_GATE`), **PR green by 9:45**. No `api/` deploys before the demo | Then the video and the Devpost technical section |
| **juannli (LOGIC via Devin + UI)** | **T-305 head tilt** (`glass/imu-tilt`, flag `VITE_IMU`), **PR green by 9:45** | Devpost [FILL]s after |
| **Aarav (ORCH)** | 9:30 G3b decision → 0.4.7. Audit and merge T-305 / T-314 by 9:55 → 0.4.8. 10:15 feature decision → 0.4.9 flags | Devpost [FILL]s, video link, submit by 11:00 |

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
| Sun 10:30 AM | **D27 / T-320:** Practice ladder fix (letter → letter + picture → show answer → next). Branch `logic/practice-ladder`, grant for glasses layout. Goes into 0.5.1 after a device check; doesn't block 0.5.0 or the video |
| Sun 10:25 AM | **0.5.0 judge build (D26).** #148: tilt passed (4/4 sideways, 2/2 down, none off-screen) → `VITE_IMU=1` in `.env.production`. Speaker gate untestable (all chunks mixed) → off. Latency: set Eager on the phone for filming; shorter chunks after the hackathon |
| Sun 10:10 AM | Merged #144 (T-407 phone cleanup) and #146 (T-319 sideways tilt = SELECT). `app.json` **0.4.9** = last test build. No open PRs |
| Sun 10:00 AM | **D25 / T-319:** sideways head tilt = tap on a suggestion (any roll; S-3 could not split left/right). Cut-off 10:15 (T-407 extended to 10:15 too). Builds: 0.4.9 last test, **0.5.0 judge build** |
| Sun 9:51 AM | Blocker #10 resolved: ElevenLabs upgraded, Scribe 200 from production. Sarah: one Practice word on 0.4.7, then re-run the 0.4.8 check |
| Sun 9:50 AM | 🚨 **Blocker #10: ElevenLabs credits exhausted** (#141, reproduced). All STT fails on every build. Fix = upgrade the same account (no deploy). 0.4.8 check blocked; tilt and gate untested, not failed |
| Sun 9:35 AM | Merged #137 (T-305 head tilt, fix: arm on entry only) and **0.4.8** for the feature check |
| Sun 9:33 AM | Merged #138 (T-314 speaker gate, flag off by default; non-blocking: `speechDb` −120 would tag `other`). #137 (T-305) changes requested: arm on entry to `candidates` only. 0.4.8 bump staged |
| Sun 9:30 AM | **D24 / T-407:** phone companion cleanup for Cursor (`ui/phone-cleanup`, cut-off 10:10, joins 0.4.9). From the tester suggestions: no Step 1 tab, Words → Word Bank, Home = Practice + Conversation only, Preview caption "Mirrors the glasses.", Step 3 card folded into Conversation → Hint settings |
| Sun 9:20 AM | **G3 PASSES on G3b (D23).** Merged #134 (Sarah: B clean block 3/3 helped, 0 false, ≤ 2.9 s). 0.4.7: `VITE_STEP3=1`, predictor timeout 1.5 → **2 s** (15 % of calls timed out), `dropSamples: true` (no more "Maya"). Main fast-forwarded, tag `v0.3-step3`. Known: Practice counts 300 ms fragments |
| Sun 9:05 AM | **D22:** two flag-gated late features. **T-305** head tilt (juannli, `VITE_IMU`) and **T-314** speaker gate at −20 dB (Sam, `VITE_SPEAKER_GATE`). Cut-off 9:45; feature test build 0.4.8 at 10:00; **judge build 0.4.9** at 10:20 either way; 0.4.7 is the safe filming build. Grant `ai/speaker-gate` → `src/main.ts` |
| Sun 8:45 AM | Merged #132 (Sam): like-for-like Gemini baseline for T-317, p50 764 ms, 31/31 in top 3, 0 over 1.2 s. StepFun FAIL confirmed. Gemini $5 monthly spend cap set. **No open PRs**; waiting on the G3b re-test for 9:30 |
| Sun 8:40 AM | Gemini back (billing): live predict 0.95-1.22 s. **D21:** one fair Conversation re-test (G3b) on **0.4.6** (`VITE_STEP3=1 VITE_DEBUG=1`), 15-min checklist with pass criteria, decision at 9:30, **final judge build 0.4.7** uploaded last. `app.json` → 0.4.6 |
| Sun 8:25 AM | Merged #129 (T-317 StepFun spike: **FAIL**, reasoning model, p50 6.6 s). T-318 cancelled; #124 closed. Merged #121 (T-406), #128 (gallery). **No open PRs.** Left: Gemini billing, 0.4.5 final build + check, video, Devpost FILLs, submit |
| Sun 8:20 AM | Merged #121 (T-406: field map, What we learned, local judge demo, team, Practice · Assist screenshot, shoot plan). System-map diagram added to the Devpost gallery order. No open PRs; waiting on T-317 (Sam, local) |
| Sun 8:15 AM | System map (Sam's, updated to the 0.4.5 judge build by ORCH) added: `docs/design/system-map.html` + `system-map-diagram.png` / `system-map.png` for the Devpost gallery. The investor deck stays out of the repo |
| Sun 8:10 AM | Sam's anomia-evidence brief (issue #125) added as reference: `docs/research/ANOMIA_EVIDENCE.md`. Not a task; Sarah reads it after the final build |
| Sun 8:00 AM | New **T-317** (StepFun spike, Phase A, local, Sam; results by 8:45) and **T-318** (StepFun behind `PREDICT_PROVIDER` in `api/predict`, Phase B, blocked on T-317; cut-off 9:30). `spikes/stepfun/**` → AI lane. Priority stays: Gemini billing, 0.4.5 build, video, Devpost |
| Sun 7:55 AM | **G3 not passed → ship Practice + Assist (D20).** Merged #120 (re-run results: Gemini daily quota hit 7:09 AM). ORCH quick fixes: no fallback recency boost, function-word filter, junk-segment filter (non-Latin / short-quiet). `app.json` 0.4.5. #111 closed. Blocker #9: unblock Gemini (billing) |
| Sun 6:55 AM | New **T-406** for juannli: finish the non-G3 parts of the Devpost writeup (grant `ui/devpost-finish`). No hosted judge-demo URL (Vercel root needs the bridge; no redeploys) |
| Sun 6:50 AM | Merged #116 (T-316 `stt.level` logging, no behavior change). G3 re-run build verified from `24c8ea8` |
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
