# Contributing and developing

## Setup

Needs Node 20+.

```bash
npm ci
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5173, bound to your LAN so the phone can reach it |
| `npm run simulate` | Opens the Even G2 desktop simulator at `http://localhost:5173` (run `dev` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run pack` | Build, then package `dist/` into `nudge.ehpk` for Even Hub |

Useful dev pages (mock services, no glasses needed):

- `/src/phone/dev/?step3=1`: the phone companion, with buttons for glasses touchpad intents.
- `/src/phone/demo/`: the scripted judge demo.

Packaged builds read feature flags at pack time:

- `VITE_STEP2` / `VITE_STEP3`: modes.
- `VITE_IMU`: head gestures.
- `VITE_SPEAKER_GATE`: wearer/partner tagging by loudness.
- `VITE_DEBUG`: the Debug tab with a session-log export.

`.env.production` holds the judge-build defaults.

## Run in the simulator

```bash
npm run dev
npm run simulate
```

The simulator window shows the 576×288 glasses display. Click to tap; double-tap exits. If port 5173 is busy, run `npx vite --port 5174` and `npx evenhub-simulator http://localhost:5174`. To script the simulator (screenshots, injected taps), add `--automation-port 9898`; see `docs/vendor/even-skills/simulator-automation/SKILL.md`.

## Run on the real G2

QR prototype mode didn't work during the hackathon (a known issue on Even's side), so every device test was a packaged build:

1. Iterate in the simulator first.
2. `npm run pack` → `nudge.ehpk` (gitignored).
3. Upload it at [hub.evenrealities.com](https://hub.evenrealities.com). Every upload needs a higher `version` in `app.json`.
4. On the phone: Even Realities app → **Me → Beta tester** → install or update Nudge.

`app.json` declares the permissions packaged builds enforce: `g2-microphone`, plus `network` with a whitelist of the ElevenLabs hosts and our Vercel host. The pack script stamps against SDK `0.0.12`, the version the vendored docs in `docs/vendor/even-skills/` describe.

## Server (`api/`)

Two Vercel functions:

- `api/stt/token` mints single-use ElevenLabs Scribe tokens.
- `api/predict` proxies Gemini.

The API keys live only in Vercel environment variables. Production deploys go through `bash api/_deploy-prod.sh` from a merged commit, never `vercel --prod` from a working branch (PLAN D15).

## How we worked

- **Branches:** `<lane>/<slug>` (`glass/`, `ai/`, `logic/`, `ui/`, `orch/`). Every PR goes into `integration`. `main` only moves forward at device-tested gates, which are tagged.
- **Ownership:** each lane edits only its own paths (`OWNERS.json`). CI runs `scripts/check-ownership.mjs` with the typecheck and tests on every PR.
- **Planning:** task cards with acceptance criteria are in `TASKS.md`; decisions are in `PLAN.md` §13; the live project state is in `docs/ORCH_STATE.md`.
- **SDK boundary:** only `src/glasses/` and `src/audio/capture` import the Even SDK. Modes talk to the glasses through the contracts in `src/core/types.ts`.

## Security

- Never commit secrets, API keys or audio. `.env.local` is gitignored. Server variables: `ELEVENLABS_API_KEY`, `GEMINI_API_KEY`, `STT_ALLOWED_ORIGINS`, `PREDICT_ALLOWED_ORIGINS`.
- `VITE_*` variables are bundled into the client, so they only ever hold public URLs and flags.
- No audio is persisted anywhere.
