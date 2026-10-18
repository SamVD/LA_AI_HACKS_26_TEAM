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

Not yet tested on device: 5-minute phone lock and resume, mic permission denial (no mic in this build), behaviour after the phone app is backgrounded.
