# G2 Smoke Test

Run at every gate (G1, G2, G3) and before final submission, on the **real G2** with the **Beta build** installed from the phone app (Me → Beta tester). QR prototype mode does not work right now (Even-side issue, `docs/BETA_RESULTS.md`), so the Beta build is the only way onto the glasses. Record results in the table at the bottom and paste it into the gate PR.

Sections A and B are required at every gate. Run C, D and E for the steps the gate covers, plus every earlier step as a regression check.

## Build and install (each cycle takes a few minutes; batch your checks)

1. Check out the gate candidate (`integration` at the commit being tagged) with a clean tree. `npm ci`, then `npm run typecheck`, `npm test`, `npm run build`.
2. Set this gate's flags **at pack time**. A packaged build has no URL to add `?step2=1` to, so flags come from the `VITE_*` env variables read by `src/config.ts`:
   - G1: `npm run pack`
   - G2: `VITE_STEP2=1 npm run pack`
   - G3: `VITE_STEP2=1 VITE_STEP3=1 npm run pack` (or per the G3 decision)
3. Upload `nudge.ehpk` at [hub.evenrealities.com](https://hub.evenrealities.com) → **My projects**. If the portal rejects a re-upload with the same version, bump `version` in `app.json` (ORCH) and repack.
4. Phone: Even Realities app → **Me → Beta tester** → install or update Nudge. Confirm the version shown matches `app.json`.
5. Record the commit, the flags and the version in the Results table.

## Setup

- [ ] Steps 1-5 above done; the installed version matches `app.json`.
- [ ] Phone on venue Wi-Fi **and** tested once on cellular (the proxy must not depend on the laptop).
- [ ] Glasses charged above 30%, worn, and connected.
- [ ] Flags for this gate set as intended (G1: Step 2/3 off; G2: `step2Enabled` on; G3: per the G3 decision).

## A. Beta lifecycle (Even's Beta requirements)

| # | Check | Pass when |
|---|---|---|
| A1 | Install and launch from Me → Beta tester | App opens on the glasses without a crash; the phone page renders |
| A2 | **5-minute phone lock** while a mode is running (mic on for Step 2/3) | After unlock: same screen, same state (`onBackgroundRestore` worked), intents still work, mic resumes |
| A3 | Background the Even app for 1 minute, then return | Same as A2 |
| A4 | **Mic unavailable / denied.** The glasses mic (D7) comes over BLE and is **not** governed by the phone's OS mic permission, and the Even app has no per-app switch for `g2-microphone`, so denial can't be triggered on a stock device (G1 finding, D16). Run instead: (a) the unit tests `src/audio/stt.test.ts` (`audioControl` → false gives `mic-denied`) and `src/modes/step1/practice.test.ts` ("Microphone is off…" status) pass in CI; (b) on the device, turn the glasses **off or out of range** mid-Step 1 | (a) is green. (b) Step 1 shows a status message ("Could not hear you" / "Microphone is off"), with no crash and no hang; double-tap still leaves |
| A5 | Network down (airplane mode) during Step 1 and Step 2 | `status` message for STT; Step 2 shows bank-only suggestions within ~1.5 s |
| A6 | **Root-page double-tap** | System exit dialog appears. Cancel keeps the app working (still receives taps). Confirm exits cleanly; mic and IMU are off afterwards |
| A7 | Relaunch after exit | Starts clean; word bank and session history are still there |

## B. Display and input basics

| # | Check | Pass when |
|---|---|---|
| B1 | Every Screen kind seen in this run | No text clipped, no scrollbar, no missing glyphs (feedback uses `√` / `×` or words, never `✓` / `✗`) |
| B2 | `blank` Screen | Glasses look dark, but a tap still registers |
| B3 | Click / swipe down / swipe up / double-click | Map to SELECT / NEXT / PREV / BACK (double-click on root = exit dialog) |
| B4 | Images (pictures, mouth shapes) | Appear within ~2 s; the screen stays usable while they load |
| B5 | **Touchpad while the glasses mic is open** (Step 1 listening for an answer) | Tap still escalates the cue, swipe down still skips, and double-tap still leaves Step 1. The app has two `onEvenHubEvent` listeners at once (shell input and mic capture); this confirms the real SDK delivers events to both. **A fail here blocks G1.** |
| B6 | Mic open/close across items | After 3-4 items, audio still arrives (no "Could not hear you" while speaking); the mic closes when leaving Step 1 |

## C. Step 1 (Practice) main flow

1. [ ] Launch Step 1 from the phone launcher (or the glasses menu).
2. [ ] A `prompt` shows a sentence with `____`, for example "You drink from a ____."
3. [ ] Say the right word clearly → `feedback` with a check, then auto-advance.
4. [ ] Say a wrong word → `feedback` with an X.
5. [ ] On a new prompt, tap three times → picture (level 1), then masked word like `c_p` (level 2), then the full word (level 3).
6. [ ] Say the word after cue 2 → counted as solved at cue level 2.
7. [ ] Stay silent for 8 s → handled (status or re-prompt), no hang.
8. [ ] Swipe down skips the item.
9. [ ] Finish 10 items → summary `status` Screen; the phone shows the session summary.
10. [ ] Double-click leaves the session back to the menu.

## D. Step 2 (Assist) main flow (G2 and later)

Two people, a natural conversation on any topic, about 5 minutes.

1. [ ] Glasses stay blank during normal talking.
2. [ ] The user stalls and taps → `candidates` within ~1.5 s (target: under 300 ms on a cache hit). Level 1 shows a picture or mouth shape for the top suggestion.
3. [ ] Tap again → first letter (level 2); tap again → full word (level 3).
4. [ ] Swipe down / up cycles through the top 3 and resets to level 1.
5. [ ] The user says the word → display clears on its own.
6. [ ] Double-click → back to `blank`.
7. [ ] No tap for the auto-dismiss timeout → back to `blank`.
8. [ ] A personal word added on the phone (name, medication) shows up as a suggestion when the conversation fits.
9. [ ] Count: help taps, taps with a correct or acceptable suggestion, rough latency. **Gate G2 needs "most attempts" correct or acceptable within ~1.5 s.**

## E. Step 3 (Ambient) main flow (G3 and later)

1. [ ] With `step3Enabled` on: the user pauses mid-sentence → a hint appears without a tap.
2. [ ] Normal pauses between turns (the other person speaking, end of sentence) do **not** trigger hints.
3. [ ] Tap escalates the cue ladder exactly as in Step 2.
4. [ ] Saying the word or the timeout clears the hint.
5. [ ] Pause/resume control works.
6. [ ] 10-minute soak: count false hints per minute against the G3 target.
7. [ ] With `step3Enabled` off: behaviour is identical to Step 2.

## Results

| Gate | Date / time | Commit | Flags | Build version | Tester | A | B | C | D | E | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | |

Mark each column `pass`, `fail (#)`, or `n/a`. Any fail in A or B blocks the gate.
