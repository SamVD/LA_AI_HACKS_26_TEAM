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

**UX finding from G1 (for LOGIC, after the tag):** a wrong answer shows "Try again" and then the same cue again; the user has to tap for more help. The tester expected the next hint to appear straight away. Proposal: after "Try again", advance the cue ladder automatically (L0 → picture → `c_p` → word); the existing 3-wrong rule at L3 still marks the item unsolved. Same direction as the auto-escalate nit in the T-102 review.

Not yet tested on device: the S-3 open items (`spikes/device/FINDINGS.md`: SDK storage write timing).
