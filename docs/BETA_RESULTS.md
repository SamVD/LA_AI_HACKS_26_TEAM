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

Not yet tested on device: mic permission denial, SDK storage persistence across an app restart (the store is wired but nothing in the gallery writes to it), the S-3 open items (`spikes/device/FINDINGS.md`).
