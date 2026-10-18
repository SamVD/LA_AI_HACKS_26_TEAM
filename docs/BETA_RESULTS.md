# Beta Results

On-device test log for Nudge on the Even G2. Owner: GLASS.

## Getting a build onto the glasses

**The QR "prototype mode" does not work.** Scanning a dev-server QR code from the Even app (Even Hub tab → Scan QR) never loads the app. The Even sponsor table confirmed on Sat Oct 17 that this is a known problem on their side. The README's "Run on the real G2 (QR over LAN)" section does not work for now.

So there is **no live reload on the glasses**. Every change that needs testing on the G2 means building a new `.ehpk` and uploading it again:

1. `npm run pack` → writes `nudge.ehpk` in the repo root (gitignored).
2. Go to [hub.evenrealities.com](https://hub.evenrealities.com), open **My projects**, and upload the new `nudge.ehpk`.
3. On the phone: Even Realities app → **Me → Beta tester** → install or update Nudge.

Notes:
- Do all quick iteration in the simulator (`npm run dev` + `npm run simulate`) and only pack for the device when a change is ready to check on the glasses.
- If the portal refuses a re-upload with the same version, bump `version` in `app.json` (ORCH-owned file, so say so in the PR). Not yet confirmed whether this is needed.
- Windows PowerShell may block `npx` (execution policy). Use `npx.cmd`; `npm run ...` scripts are unaffected.

## Results

| Date | Build | Test | Result |
|---|---|---|---|
| Sat Oct 17 | T-002 hello build (`integration` @ `2620904`, SDK 0.0.12) | Installed from Me → Beta tester; "Hello Nudge" shows; tap updates the count; double-tap shows the system exit confirmation | Pass |
| Sat Oct 17 | same | QR prototype mode (Scan QR against `npm run dev`) | Fail: does not load; Even confirmed it's an Even-side issue |
| Sat Oct 17 | S-3 probe (`spike.ehpk` 0.1.1) | Mics, IMU, blank screen, phone page, lock with mic open | See `spikes/device/FINDINGS.md` |
| Sat Oct 17 | T-101 gallery build (`glass/renderer` @ `50e7fd5`, `VITE_GALLERY=1`, v0.2.0, T-106 pictures and store wired) | Launcher boots; Step 1 opens the screen gallery; all 13 Screens render as expected on the G2 (prompt, cue L1 with picture, L2, L3, feedback √ / ×, candidates L1 with mouth shape, L2, L3, menu, status, blank) | Pass |
| Sat Oct 17 | same | Touchpad: tap (SELECT), swipe up / down (PREV / NEXT), double-tap in a mode returns to the launcher, double-tap at the launcher opens the exit dialog | Pass: all gestures registered |
| Sat Oct 17 | same | Phone locked for 5 minutes with the gallery open, then unlocked | Pass: the display and taps kept working through the lock and after it |
| Sat Oct 17 | **G1 build** (`integration` @ `4b13180`, v0.3.0: real Step 1, T-104 batch STT for answers, T-202 rolling STT, token minter at `nudge-seven-psi.vercel.app`) | First try: Step 1 heard the answer, then showed "No connection. Tap to try again." | Fail, fixed server-side: `api/stt` allowed only `http://localhost:5173`, so the WebView's origin got a 403 preflight without CORS headers and `fetch` threw. Sam added the WebView origin to `STT_ALLOWED_ORIGINS` and redeployed; no re-pack. (The message itself shows the mic works: it only appears after the VAD detected speech.) |
| Sat Oct 17 | same, after the server fix | **C. Step 1 flow** (`docs/G2_SMOKE.md` C1-C10): prompt with `____`; correct word → √ "Yes"; wrong word → × "Try again"; three taps → picture → `c_p` → word; swipe skips; 10 items → summary; double-tap leaves | Pass: the tester reports the flow matches the smoke doc, with real speech graded on the real G2 |
| Sat Oct 17 | same | **B. Display and input**: every Screen seen, pictures, no clipped text, taps during listening (B5: the cue taps in C5 happen while the mic is open), mic across items (B6) | Pass: pictures appear well, no clipped text, gestures work while listening |
| Sat Oct 17 | same | **A2. Phone locked** with Step 1 running | Pass: works with the phone locked |
| Sat Oct 17 | same | Phone OS microphone permission for the Even app turned **off**, then Step 1 | Pass, as expected: Step 1 still hears and grades. Nudge records from the **glasses mic** (D7), which reaches the phone over BLE and isn't governed by the phone's mic permission. **A4 as written tests the wrong switch**: the denial path is the Even-level `g2-microphone` permission for Nudge, inside the Even app. |
| Sat Oct 17 | same | **A6. Root double-tap** at the launcher | Pass: the system exit dialog appears |
| Sat Oct 17 | same | **A4. Even-level `g2-microphone` denied** → "Microphone is off" status | **Not testable on device**: the Even app has no per-app mic switch, and the phone's OS mic permission doesn't govern the glasses mic (row above). The path is covered by unit tests (`audioControl` → false gives `mic-denied`, and Step 1 shows "Microphone is off. Tap to try again. Double-tap to leave."). ORCH to decide whether that satisfies the gate criterion. |
| Sat Oct 17 | same | A3 background 1 min, A5 airplane mode, A7 relaunch keeps word bank and sessions (storage persistence) | Not reported yet |

| Sun Oct 18 | **G2 build** (`integration` @ `5b58236`, v0.4.0, `VITE_STEP2=1`, realtime STT) | Step 2 in conversation | **Fail: the transcript never arrived.** Suggestions were only word-bank words unrelated to the conversation. Consistent with the Even app blocking `wss://api.elevenlabs.io` from packaged builds (S-1's open risk). |
| Sun Oct 18 | same | Re-upload of v0.4.0 | **Rejected by the portal**: every upload needs a higher `version` (D10 is a rule, not a fallback) |
| Sun Oct 18 | **G2 build** (`integration` @ `a0052a5`, v0.4.2 stamped from a temp manifest copy, `VITE_STEP2=1 VITE_ROLLING_STT=batch`) | Step 2, two-person conversation (`G2_SMOKE.md` D) | **Pass per the tester ("works as expected")**: suggestions follow the conversation ("the weather is really warm and um um" + tap → "sunny"); it keeps listening after a suggestion; the display clears by saying the word, double-tap, or the 20 s timeout. **Slow**: the tester says it "goes very slowly". In batch mode the newest words are only transcribed after a ~0.8 s pause, so a tap right after "um um" can take ~2-3 s. No per-tap tally was recorded, so "most attempts within ~1.5 s" is **not demonstrated**. |
| Sun Oct 18 | same | Step 1 regression with T-108 (a wrong answer moves up one cue) | Pass per the tester |

**Finding (S-1 open risk, closed):** realtime STT over `wss://` doesn't work from a packaged Even build; the batch fallback over `https://` does. Until Even confirms `wss://` support, packaged builds need `VITE_ROLLING_STT=batch`, and Step 2/3 latency is bound by batch chunking.

**UX finding from G1 (for LOGIC, after the tag):** a wrong answer shows "Try again" and then the same cue again; the user has to tap for more help. The tester expected the next hint to appear straight away. Proposal: after "Try again", advance the cue ladder automatically (L0 → picture → `c_p` → word); the existing 3-wrong rule at L3 still marks the item unsolved. Same direction as the auto-escalate nit in the T-102 review.

Not yet tested on device: the S-3 open items (`spikes/device/FINDINGS.md`: SDK storage write timing).

## Change request from the G2 device run (Sarah, Sun Oct 18): Step 2 hint ladder

The tester (GLASS) wants Step 2's help flow changed. It's written here for ORCH to decide and assign, since it touches the contract, the shared ladder, Step 2/3 and the assets.

**Requested flow** (a tap is still the only way to ask for help; Step 2 never listens for a "help" cue):

1. **Tap** → the top suggestion as **first letter + blanks**, one blank per remaining letter: `s _ _ _ _` for "sunny". No mouth shape and no picture.
2. **Tilt head right** = "yes, that's my word" →
   - **Tap** → **half filled in**: `s u n _ _` (first ⌈n/2⌉ letters)
   - **Tap** → **full word**: `sunny`
3. **Tilt head left** = "not my word" → the **next suggestion**, again as first letter + blanks (`w _ _ _`), with the same tap → half → full.
4. Unchanged: saying the word, double-tap or the 20 s timeout clears the display.

**Remove mouth shapes** from Step 2 (and from Step 3, which shares the ladder). Step 1 keeps its picture cue.

**Why (tester's view):** letters are faster to read than a mouth drawing mid-conversation, and "yes / no" by head movement keeps the hands free.

**What it touches**

| Area | Change | Owner |
|---|---|---|
| `src/core/types.ts` `CueLevel` semantics | For Steps 2-3: L1 = first letter + blanks, L2 = half word, L3 = full word (no visual level). Contract note in `docs/CONTRACTS.md` | ORCH |
| `src/glasses/layout.ts` (`candidates`) | Render the new levels; drop the picture slot for candidates | GLASS |
| `src/modes/step2/` | Tap → letters; "confirm" and "next" intents; ladder only climbs after confirm | GLASS |
| `src/modes/step3/` | Same ladder, so the same change | AI |
| `src/content/phonetics` (T-205 mouth resolver) | No longer used by Steps 2-3 | LOGIC |
| `src/glasses/imu/` (T-305) | Head tilt left/right → intents | GLASS |

**⚠️ Risk: left/right head tilt.** S-3 (`spikes/device/FINDINGS.md` §2) could **not** separate tilt-left from tilt-right: both moved the IMU's y axis negative. That's why **D9** limits T-305 to look up / look down. Options:
- **(a) Recommended:** keep **swipes as the primary "next" / "confirm"** (they already work: swipe = next suggestion), and make tilt an optional extra behind `imuEnabled`. Before building tilt, run a short probe to re-measure roll (combining y and z, with held poses and per-user calibration). If left/right separates cleanly, wire tilt; if not, use **look up / look down** (proven in S-3) for confirm / next.
- (b) Build tilt left/right directly: high risk of false or missed intents on the real G2.

**Touchpad mapping proposal** (works without tilt): tap = show letters / reveal more; swipe down = next suggestion (= "tilt left"); swipe up = confirm (= "tilt right"); double-tap = hide. Tilt mirrors swipe down / swipe up when enabled.

**Open question for ORCH:** this is a UX change made after G2 testing. Ship it before the G2 tag, or tag `v0.2-step2` on the current flow and make it the first post-G2 task? The latency issue (batch STT) matters more for the gate than the ladder shape.

## G3 device run and refinement plan (Sarah, Sun Oct 18)

**Build:** `integration` @ `34e46db`, v0.4.3, `VITE_STEP3=1` (`.env.production`: batch STT, Step 2 on), installed from Me → Beta tester.

| Test | Result |
|---|---|
| Step 3 soak (two-person conversation) | **Works, but too slow.** A hint appears **~3-4 s after "umm"**, and "detects more 3-4 s later" (to clarify: a second hint, or the hint changing). No helped / false / missed tally was recorded. |
| Step 1 | **Not as expected.** After a wrong answer the tester saw "incorrect, try again" and then the **next item**. Expected: "try again" → picture → wait → `c _ p` → full word. |
| T-208 latency tally, T-209 ladder | Not reported separately |

### 1. Why Step 3 takes 3-4 s (from the code, not guessed)

| Stage | Setting | Time |
|---|---|---|
| Stall detector: silence after the last word | `minSilenceMs` 1500 (Balanced; Eager 900, Calm 2500) | 1.5 s |
| Batch STT closes the chunk and transcribes it (overlaps the above) | `segmentSilenceMs` 800 + upload/transcribe | ~1.2-1.8 s |
| Prediction: usually a live call, because prefetch is throttled to 1 per 5 s on the free tier (D11) | timeout 1.5 s | ~1-1.5 s |
| Render over BLE | | ~0.2 s |
| **Total** | | **~2.7-3.5 s** (matches the device) |

A stall can't be told apart from a normal pause without ~1-1.5 s of silence (T-007), so **~1.5-2 s is the realistic floor** with the current architecture. Levers, cheapest first:
1. **Eager sensitivity** (`minSilenceMs` 900): ~0.6 s faster, more false hints. Try it on the device now (phone Home card); no code change.
2. **`segmentSilenceMs` 800 → ~500** (T-208 option 3): the final lands ~0.3 s sooner.
3. **Prefetch on every final** so the hint is a cache hit (~1 s saved). This needs **Gemini billing (Tier 1)**: on the free 15/min the throttle (D11) can't prefetch more often. Team decision (cost).
4. **Realtime STT** (`wss://`), blocked by the Even app (G2). Ask Even (sponsor table / Discord) whether packaged apps can open `wss://`; it would save another ~1 s.

### 2. Speakers: the system can't tell who is talking
**Today the transcript mixes both people.** The glasses mic hears the partner too, and nothing labels who said what. So Step 3 can treat the partner's pause or "um" as the user's stall, and the prediction context includes the partner's words without knowing they're the partner's. This is likely the biggest accuracy issue. Options:
- **Loudness**: the wearer's voice is much louder on the glasses mic than a partner ~1 m away. Tag each chunk by its energy level and only let stalls fire on the wearer's speech. Cheap; uses the existing VAD energy. Needs a calibration check on the device.
- **ElevenLabs diarization** (`diarize=true` on batch Scribe gives a speaker label per word). Not tested in S-1; adds latency, and the labels are arbitrary ("speaker 0/1") without loudness to say which one is the wearer.

### 3. A "pipeline inspector" page (requested)
A debug view that shows **what the backend is doing, live**, so we can measure accuracy instead of guessing:
- every transcript chunk with its **times** (speech end → transcript arrived) and **speaker** (wearer / other, once section 2 exists);
- the **stall detector's** decision per pause (silence length, ending type, fired or not, and why: cooldown, rate cap, paused);
- the exact **context sent to the predictor** (`transcriptTail`, `stalledAfter`) and the **suggestions back**, with model vs bank fallback and ms;
- **per-hint timing**: "um" → hint on the glasses, split by stage (the table in section 1, measured);
- Step 1 attempts: what was heard, the match score, and why it moved on.

Where: a **Debug tab on the phone companion page** (it runs on the device, so it sees real data), fed by a small in-memory event log behind the `log` function `src/main.ts` already passes everywhere. An "Export" button copies the session as JSON for analysis. No audio stored.

### 4. Step 1: the requested behavior is already the coded behavior
`src/modes/step1/index.ts`: after a wrong answer it shows × for 1.2 s, **escalates one cue and listens again** (picture → `c_p` → word). It only moves to the next item after **3 wrong answers at the full word**, or **silence at the full word**. Likely explanations for what the tester saw:
- **No picture for that word**: the ladder skips straight from L0 to `c_p` (it may have looked like a new item);
- **Background speech counted as attempts**: the partner talking, or the user continuing, produces quick "wrong" utterances that burn through the cues in seconds (same root cause as section 2);
- the × screen shows **what was heard** (`× <heard text>`), which can look like a new word.

Fix direction (LOGIC): only count an utterance as an attempt if it's the **wearer** (section 2) and longer than ~300 ms; hold the cue on screen longer before listening again; keep "× Try again" text-only. **Confirm with the inspector (section 3) first.**

### 5. Step 2 vs Step 3: merge in the launcher, not in the code
Step 3 **is** Step 2 plus an automatic tap: `src/modes/step3` creates a Step 2 inside itself, sends it a virtual tap when the stall detector fires, and manual taps still work. So Step 2 is a strict subset of Step 3.

**Safe plan, with no mode code touched:**
1. **Hide Step 2 from the launcher**: set `VITE_STEP2=0` with `VITE_STEP3=1` in `.env.production` (ORCH). Step 3 forces Step 2 on internally, so it keeps working.
2. **Rename in the launcher**: "Practice" (Step 1) and "Conversation" (Step 3, which hints automatically and also on tap). A label change in `src/glasses/shell.ts` (GLASS) and the phone Home card (UI).
3. **Keep `src/modes/step2/` as it is**: Step 3 runs on it. Deleting or reshaping it is what would break Step 3. Tests on both stay.

The risk is only the launcher text and a flag. Step 1's and Step 3's code paths are unchanged.

### Proposed task set (ORCH to confirm owners and order)

| Task | What | Lane | Risk |
|---|---|---|---|
| R-1 | **Pipeline inspector**: in-memory event log + phone Debug tab + JSON export | ORCH (log hook in `main.ts`) + UI (tab) + GLASS/AI (emit events) | Low: read-only |
| R-2 | **Speaker tagging by loudness**: label chunks wearer/other; stalls and Step 1 attempts only from the wearer | AI (`src/audio`, stall) | Medium: needs device calibration via R-1 |
| R-3 | **Latency levers**: device-test Eager; `segmentSilenceMs` 500; decide on Gemini billing for un-throttled prefetch | AI + ORCH decision | Low |
| R-4 | **Ask Even about `wss://`** from packaged apps | ORCH / anyone at the sponsor table | None |
| R-5 | **Step 1 attempt filtering** (wearer-only, ≥300 ms) + clearer cue hold | LOGIC | Low, after R-1 confirms the cause |
| R-6 | **Launcher: Practice + Conversation** (hide Step 2, rename) | ORCH (flag) + GLASS (shell label) + UI (Home card) | Low |
| R-7 | **End-to-end UX review**: Claude runs every flow in the simulator against the conversation fixtures, plus a device pass, and writes a prioritized UX report; each fix becomes a card | GLASS (Claude) | None: review only |

Order suggestion: **R-1 first** (it measures everything else), R-6 and R-3/R-4 in parallel, then R-2 and R-5 with R-1's data, R-7 last before the demo freeze.

## G3 re-run on 0.4.4 (Sarah + partner, Sun Oct 18, 7:06-7:09 AM PT)

**Build:** `integration` @ `0467898`, v0.4.4, `VITE_STEP3=1 VITE_DEBUG=1` (batch STT, Step 2 on). Data: the phone Debug tab export (96 events, Conversation mode only). No audio stored.

**The run stopped after ~3 minutes: Gemini's daily free quota ran out.** At 7:09:11 `api/predict` returned **429** with `blockedUntil` = **4:59:59 PM PT** (midnight UTC), so every hint after that is the bank fallback. The 10-minute tally, the 10 timed taps and the Practice check were **not done**. Until billing is on (R-3) or the quota resets, predictions don't work on any device.

### What the log shows

| Area | Measured |
|---|---|
| Batch STT | 22 transcript chunks; `sttMs` 367-1392, typically ~550 ms. Chunks are long (up to 14.9 s, one hit the `max` cap) and often **contain both people**. |
| Predictor | 22 calls: **14 model** (915-1083 ms, typically ~1020 ms), **7 timeout** (32 %), 1 rate-limited. The client timeout is **1200 ms** (`src/ai/predictor/service.ts`), barely above the model's typical time, so a third of calls spill into the fallback. |
| Fallback words | Stale bank words from earlier context (`bread, soup, eggs` four times; `park, garden, grocery store`), so a fallback is effectively a false hint. |
| Auto-hints (Step 3) | **1** in 3 min (`reason: filler`, "I think it's, um"). Letters were on screen **1.15 s after the transcript arrived** (prediction timed out, fallback shown). Stop speaking → hint ≈ silence wait + ~0.6 s STT + ~1.15 s ≈ **3 s**. The hint's `keywords` were stale (`coffee, cup, conversation` from minute 1). |
| Missed stall (likely) | "Where exactly is it? Um, I think it's" ended a chunk with no auto-hint. The wearer found the word ("Outside by the food tables") ~3 s later. |
| False hints | `park` (fallback, unrelated to the food-table answer); **`me` / `help`** (function words). "Park? Oh dear" was logged as `heard park`, but that was the wearer reading the hint aloud, not the hint helping. `me` was later marked `heard` from the partner's speech. |
| Speaker loudness (T-316) | Single-speaker chunks separate: wearer **-12 to -14 dB**, partner **-20 to -26 dB** (e.g. "How about you? I'm from UW Madison…" -20; "Right now, it knows" -26). Mixed chunks read as the louder (wearer) level, so tagging needs **shorter chunks** to be useful. To confirm with Sarah's recollection of who said what. |
| STT noise | Two quiet, short chunks (-24/-28 dB, < 0.5 s speech) came back as **Malayalam and Chinese** text, although batch STT sends `language_code=en` (`src/audio/scribe.ts`). They also fed the predictor. |
| Lifecycle | The phone was in the background for 42 s (`lifecycle hidden` → `visible`); STT and hints kept working. |
| Start of run | The partner says the first attempt was lost and something was "blank". That earlier session isn't in this export (to clarify). |

### Proposed follow-ups (ORCH to assign)

| # | Change | Why | Lane |
|---|---|---|---|
| F-1 | **Gemini billing (Tier 1)** or a second key, before any further device run | Daily quota exhausted at 7:09 AM | ORCH / Sam |
| F-2 | Predictor `timeoutMs` 1200 → **~1800** | 32 % timeouts at a ~1020 ms typical model time | AI |
| F-3 | In Step 3 auto-hints, **show nothing on a fallback** (taps may still show it) | Fallback words are stale, so they are the main false-hint source | AI / GLASS |
| F-4 | **Filter suggestions**: drop pronouns/function words and multi-word phrases (`me`, `help`, `then`, `Did you`) | False hints | AI (prompt + post-filter) |
| F-5 | **Drop junk chunks**: < 500 ms speech, or speech below ~-22 dB, or mostly non-Latin text | Hallucinated Malayalam/Chinese; partner fragments | AI (`src/audio`) |
| F-6 | **Shorter batch chunks** (`segmentSilenceMs` 800 → ~500, lower `max`) so each chunk is one speaker, then tag wearer vs partner at ~-17 dB | Loudness separates single-speaker chunks by 6-12 dB | AI (R-2) |
| F-7 | "Heard" should not count the wearer **reading the hint aloud** right after it appears, or partner speech | Inflates "helped" | AI / LOGIC |
| F-8 | Refresh the stall `keywords` from the latest context | Stale `coffee, cup` | AI |

Re-run the full protocol (10-minute tally, 10 timed taps, Practice) once F-1 is done.

### Tests 2 and 3 (same build, 7:15-7:22 AM PT, still inside the quota block)

Two more Conversation-mode exports (144 + 66 events). **Both ran almost entirely without Gemini**: test 2 got 2 model answers before its first 429 (7:16:15), and test 3 got its 429 on the second call. So every hint below is the **bank fallback**. The team's own remark in the transcript ("accuracy's gone down a lot … last night it was working pretty well") is this quota block, not a code regression.

| Area | Measured |
|---|---|
| Stall detection | **8 auto-hints** (+1 skipped while candidates were showing). **4 were real wearer stalls** ending in "um": "pretty warm and, um", "I have two, um", "the other one, um", "I don't really like, um". 1 was plausible ("I was working on a"). **3 were false**: "to" (a 260 ms partner fragment at -24 dB), "So we", "if we upgrade to-". |
| Speed without a model call | Bank hints appear **1-6 ms** after the auto-hint, which fires 0.2-1.5 s after the transcript. So the cost of stopping speaking → letters is **mostly the silence wait plus STT (~2-2.5 s)**. The predictor adds the rest when it runs. |
| Hint quality | **0 helpful hints.** The fallback offered `phone`, `Maya`, `lisinopril` and `glasses` (sample personal-bank words) for "I have two, um" (sisters), "don't really like, um" (football) and the others. Showing a person's name or a medication at random is worse than showing nothing. |
| Why the same words repeat | `rankFallback` adds +0.5 to any word **shown in the last 5 min** (`RECENT_MS`, `src/ai/predictor/fallback.ts`). And when the wearer reads a hint aloud, the word lands in the transcript tail. Both feed back, so `phone` and `glasses` won every later stall. |
| False "heard" | The wearer reading the hint aloud ("Phone, bro", "Glasses", "Oh, it said the person's name, Maya") counted as `heard`. `heard phone` was also logged on a chunk with no "phone" in it ("It says lisinopril … signatories"), which looks like a matcher false positive (to check in `src/matching`). |
| Speaker loudness (T-316) | Confirms test 1, with clearer data. **Partner alone: -24 to -30 dB** ("Hi, how are you?" -30; "Do you have any brothers or sisters?" -29; "And I miss it sometimes…" -26; "Like AI, CS stuff" -27). **Wearer alone: -9 to -15 dB** ("I have two, um" -12; "I have two siblings…" -12; "Last night I barely slept…" -13). A **-20 dB** threshold separates every single-speaker chunk in all three tests. Mixed chunks land in between (-14 to -19). |
| STT noise | "OK啊" (-11 dB, 340 ms speech): a short, loud clip still came back partly Chinese, so a script filter is needed as well as a loudness one (F-5). There was one `no-speech` error (empty transcript, harmless). |

### What this changes in the follow-ups
- **F-1 (Gemini billing) is the top priority.** No useful device data is possible without it, and the demo would show `lisinopril` as a hint.
- **F-3 is confirmed**: in auto mode, show **nothing** when the answer is a fallback. On a tap, show the fallback only if it scored on context, not just on recency.
- **New, F-9**: drop the "shown recently" boost in `rankFallback`, or invert it (penalize words already shown), so one wrong word doesn't stick.
- **New, F-10**: don't auto-hint on a function-word stall ("to", "So we") unless the chunk is the wearer's (≥ -20 dB) and ≥ 1 s of speech; keep "um"/filler stalls as they are.
- **R-2 / F-6 are now low-risk**: the -20 dB split held on every single-speaker chunk across ~10 minutes of conversation.
- **Quota budget**: prefetching on every chunk, including partner fragments and noise, spends quota for nothing. Skip prediction for chunks < 500 ms of speech or below -20 dB.

## G3b Conversation re-test on 0.4.6 (Sarah, Sun Oct 18, 8:40-8:47 AM PT)

**Build:** `integration` @ `2fc148c`, v0.4.6, `VITE_STEP3=1 VITE_DEBUG=1`, Gemini back (billing). Data: one Debug-tab export (268 events): ~0.5 min of Practice, then **~6.5 min of Conversation**. Counts below come from the log; the run was shorter than the 15-minute D21 checklist, and segments A and B were mixed (some planted stalls were tapped).

**Short version:** with Gemini live, **every real stall got a fitting word in the top 3**, including words outside the bank (`sunny`, `umbrella`, `foggy`). Tap help is near-instant (prefetch cache). Auto-hints helped 2 of 3 times. The full B criterion (6 planted stalls, no taps) was **not run**.

### Against the D21 criteria

| Part | Criterion | Measured | Verdict |
|---|---|---|---|
| A. Tap help | median ≤ 2.5 s; ≥ 3 of 5 fitting | **4 taps**: 3 served from the prefetch cache in **2 ms**, 1 live in **0.97 s**. Fitting: **3 of 4** (`sunny`, `umbrella`, `Rachel`); the 4th (`phone, water`) was a tap during chat, with no target word | Pass on speed; 4 taps, not 5 |
| B. Auto-hints | ≥ 3 of 6 helped; ≤ 2 false; stall → letters ≤ 3 s | **3 auto-hints fired**. **2 helped**: "I walk my dog at the, um, um" → `park`; "San Francisco is, uh" → `foggy` ("Ooh, it does"). **1 false**: "Talk to me now. Okay, um" → `Rachel, phone, Maya`. Stall → letters: **3.2, 2.1, 2.5 s** (silence wait + transcript + prediction). 2 more stalls were skipped while paused, 1 while a hint was showing | **Not demonstrated**: 2 helped, not ≥ 3 of 6 planted; false and latency are within limits |
| C. Pause | no hints while paused | 2 stalls logged `auto-hint skipped: paused` | Pass |
| D. Practice | 3 words | `toothbrush` right first try; `coffee` failed after 3 "attempts" that were fragments ("T", 300 ms); `bathroom` skipped | Works, but see issue 3 |

### What the log shows
- **Gemini quality (live): very good.** Predictions that fit the stall: "no clouds, warm. It was" → `sunny, warm, nice`; "I forgot my, um" → `umbrella, hat, jacket`; "my sister" → `Rachel` (wearer's own bank entry); "dog at the, um" → `park`; "San Francisco is, uh" → `foggy, cold, sunny`; "where are you from?" → `Chicago, London, Boston`.
- **Latency:** 41 model calls, **median 1018 ms** (917-1257). **7 timeouts (15 %)**, all at ~1.0-1.25 s; the first was the cold start. Timeouts fall back to bank words, which is where `phone, glasses` still came from (F-2 open: `timeoutMs` is still 1200).
- **#122 quick fixes work:** `rolling.drop` removed a quiet 220 ms fragment and a Chinese hallucination ("我们是去"); the stale bank-recency loop is gone.
- **Sample bank words leak.** Gemini offered `Maya` (a sample entry) three times, and the testers asked "Who's Maya?". The prompt spec drops `sample` entries in production (`docs/PREDICTOR_PROMPT.md` §4), but they still reach the model.

### Issues for the judge build / next fixes
1. **Raise `timeoutMs` 1200 → ~1800 (F-2).** Model median is 1018 ms, so 15 % of calls miss the cut and show bank words.
2. **Strip `sample` bank entries** from predictor requests (and the fallback) in packaged builds, or replace them with the tester's real entries before the demo.
3. **Practice: raise the minimum attempt to ~500 ms of speech.** Two 300 ms "T" fragments counted as wrong answers, so `coffee` failed without a real attempt (T-313's limit is 250 ms).
4. A weak "Okay, um" in chat still fires an auto-hint with generic bank words (1 false in 6.5 min); acceptable under D21's ≤ 2.

### Recommendation for the 9:30 decision
The evidence leans toward **Conversation working with Gemini live**: fitting words on every real stall, near-instant taps, 1 false hint, and C passes. But **B wasn't run as specified**. If there's time before 9:30, one clean 8-minute B block (6 planted stalls, no taps, no pausing, partner silent during stalls) would settle it. Otherwise ORCH decides on this partial data.

### Clean B block (9:09-9:13 AM PT, same build)

One more export (138 events, ~4 min). Planted stalls from the demo script; no taps on the planted stalls. Time ran out after **3 of the 6** planted stalls (cake, Rachel and dog weren't reached).

| # | Stall | Auto-hint (top 3) | Result | Stall → letters* |
|---|---|---|---|---|
| 1 | "…no clouds this morning. Very, um" | `sunny, bright, clear` | **Helped** ("All three, guys") | 1.9 s |
| 2 | "I got soaked and I forgot my, um" (2nd try; the 1st was skipped because stall 1's words were still showing) | `towel, umbrella, jacket` | **Helped** (`umbrella` #2; the wearer chose "towel") | 2.6 s |
| 3 | "My hands were freezing, so I wore my, um" | `gloves, jacket, sweater` | **Helped** (said "Gloves") | 2.9 s |

\* From the last detected sound to letters on the lens: the stall detector's silence wait, plus the prediction time (0-0.9 s; stall 1 was already in the prefetch cache).

**Against D21 B:** **3 helped** (meets ≥ 3 of 6), **0 false auto-hints** (≤ 2), stall → letters **1.9-2.9 s** (≤ 3 s). All three are words outside the bank, so all three came from Gemini. **B passes on its numbers**, with the caveat that only 3 of the 6 stalls were run.

Other notes: 5 of 23 predictor calls timed out (including the cold start), and a timed-out stall would have shown bank words or nothing (F-2 still open). Three taps during between-stall chatter gave non-target words (`towel, jacket, bathroom`; `ready, prepared, planned`), but none was an automatic hint.

### Overall G3b verdict for ORCH
| Part | Verdict |
|---|---|
| A. Tap help | Pass on speed (2 ms cached / 0.97 s live); 3 of 4 fitting (4 taps, not 5) |
| B. Auto-hints | **Pass**: 3 of 3 planted stalls helped, 0 false, ≤ 2.9 s |
| C. Pause | Pass |
| D. Practice | Works (fragment attempts: issue 3 above) |

Recommendation: **Conversation meets D21** → judge build 0.4.7 with `VITE_STEP3=1`. Before or right after 0.4.7, if possible: `timeoutMs` → ~1800 (F-2) and strip `sample` bank entries.

## 0.4.8 feature check (Sarah, Sun Oct 18, 9:40-9:44 AM PT): blocked, ElevenLabs out of credits

**Build:** `integration` @ `09114bc`, v0.4.8, `VITE_STEP3=1 VITE_IMU=1 VITE_SPEAKER_GATE=1 VITE_DEBUG=1`. Data: one Debug export (72 events, about 4 min, Conversation started 3 times).

**Result: no feature could be tested.** No suggestions appeared, but the speaker gate is not the cause:

| Evidence | What it means |
|---|---|
| **Every** transcription failed: 19 × `stt.error` `scribe http 401`, plus 2 × `stt.no-audio` | No transcript at all, so nothing for the gate, the stall detector or the predictor to act on |
| `stage: "scribe"`, not `"token"` | Our token server works; ElevenLabs rejected the call itself |
| `predictor.fallback` `http 400` on taps | The predict request had an empty transcript (a side effect, not a separate bug) |
| `imu.on ok: true` | Tilt switched on, but couldn't be tried: tilt only arms while suggestions are showing, and none showed |

**Root cause, confirmed at 9:47 AM:** I minted a token from `/api/stt/token` (HTTP 200) and sent Scribe 0.5 s of silence. ElevenLabs answered **401 `quota_exceeded`: "This request exceeds your quota of 10000. You have 0 credits remaining."** The ElevenLabs account behind `ELEVENLABS_API_KEY` is out of credits.

**This affects every build, including the 0.4.7 judge build.** Without credits, Practice can't hear answers and Conversation gets no transcript, so the demo video and judging can't work.

### Needed now (ORCH / Sam: account owner)
1. **Restore ElevenLabs credits**: upgrade or top up the plan, or put a funded key in Vercel's `ELEVENLABS_API_KEY` and redeploy `api/`.
2. To confirm: a Practice word on any build is heard, or the Debug log shows `stt.utterance` instead of `scribe http 401`.
3. Then re-run this 12-minute check on 0.4.8 (tilt, speaker gate) unchanged.

The speaker gate and tilt are **untested**, not failed.
