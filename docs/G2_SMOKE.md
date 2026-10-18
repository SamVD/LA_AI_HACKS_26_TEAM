# G2 Smoke Test

Run at every gate (G1, G2, G3) and before final submission, on the **real G2** with the **Beta build** installed from the phone app (Me → Beta tester), not the LAN QR dev build. Record results in the table at the bottom and paste it into the gate PR.

Sections A and B are required at every gate. Run C, D and E for the steps the gate covers, plus every earlier step as a regression check.

## Setup

- [ ] `main` (or the gate candidate on `integration`) passes `npm run typecheck`, `npm run test`, `npm run build`.
- [ ] `npm run pack` produces `nudge.ehpk`; it is uploaded to the Beta group and the version number shown in the phone app matches `app.json`.
- [ ] Phone on venue Wi-Fi **and** tested once on cellular (the proxy must not depend on the laptop).
- [ ] Glasses charged above 30%, worn, and connected.
- [ ] Flags for this gate set as intended (G1: Step 2/3 off; G2: `step2Enabled` on; G3: per the G3 decision).

## A. Beta lifecycle (Even's Beta requirements)

| # | Check | Pass when |
|---|---|---|
| A1 | Install and launch from Me → Beta tester | App opens on the glasses without a crash; the phone page renders |
| A2 | **5-minute phone lock** while a mode is running (mic on for Step 2/3) | After unlock: same screen, same state (`onBackgroundRestore` worked), intents still work, mic resumes |
| A3 | Background the Even app for 1 minute, then return | Same as A2 |
| A4 | **Permission denial**: deny the mic permission, then start Step 1 | A `status` Screen explains the mic is off; no crash, no hang; double-tap still exits |
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

| Gate | Date / time | Build version | Tester | A | B | C | D | E | Notes |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

Mark each column `pass`, `fail (#)`, or `n/a`. Any fail in A or B blocks the gate.
