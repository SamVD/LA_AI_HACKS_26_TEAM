# Nudge

A quiet word-finding aid for people with aphasia, built as an Even Hub app for the **Even G2** glasses (LA Hacks 2026). It is a Vite + TypeScript web app that runs inside the Even phone app's WebView and draws on the glasses through `@evenrealities/even_hub_sdk`.

Team plan and task board: `PLAN.md` and `TASKS.md`. G2 display numbers: [`docs/DISPLAY_LIMITS.md`](docs/DISPLAY_LIMITS.md). Even's SDK docs (read-only copy, for every tool including Cursor and Codex): [`docs/vendor/even-skills/`](docs/vendor/even-skills/).

## Setup

Needs Node 20+.

```bash
npm install
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5173, bound to your LAN so the phone can reach it |
| `npm run simulate` | Opens the Even G2 desktop simulator pointed at `http://localhost:5173` (run `dev` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (passes with zero tests) |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run pack` | Build, then package `dist/` into `nudge.ehpk` for Even Hub |

## Run in the simulator

```bash
npm run dev
npm run simulate
```

The simulator window shows the 576x288 glasses display. Click in it to tap; the console logs `[nudge] click event`. Double-tap exits.

If port 5173 is busy, run `npx vite --port 5174` and `npx evenhub-simulator http://localhost:5174`.

To script the simulator (screenshots, injected taps, console logs) add `--automation-port 9898`; see `docs/vendor/even-skills/simulator-automation/SKILL.md`.

## Run on the real G2

**QR prototype mode does not work right now.** Scanning a dev-server QR code from the Even app never loads the app; the Even sponsor table confirmed this is a known issue on their side (Sat Oct 17). There is no live reload on the glasses. See [`docs/BETA_RESULTS.md`](docs/BETA_RESULTS.md).

Every device test goes through a packaged build:

1. Iterate in the simulator first (`npm run dev` + `npm run simulate`).
2. `npm run pack` → `nudge.ehpk` (gitignored).
3. Upload it at [hub.evenrealities.com](https://hub.evenrealities.com) → **My projects**. If the portal rejects a re-upload with the same version, bump `version` in `app.json` (ORCH-owned: say so in your PR, or ask ORCH).
4. On the phone: Even Realities app → **Me → Beta tester** → install or update Nudge.

A cycle takes a few minutes, so batch your device checks.

**Packaging a spike page** (for example `spikes/device/`) as its own build, with no repo changes:

```bash
npx vite build spikes/device --config vite.config.ts --outDir "$PWD/dist/spike" --emptyOutDir
npx evenhub pack app.json dist/spike --sdk-ver 0.0.12 -o spike.ehpk
```

`--config vite.config.ts` is required (it sets the `esnext` target the SDK's top-level `await` needs). Add any permissions the spike needs (for example `g2-microphone`, `phone-microphone`) to `app.json` **locally only**, because packaged builds enforce them. Uploading a spike build replaces the Nudge Beta app, so re-pack from `integration` afterwards.

If QR mode starts working again: `npm run dev`, then `npx evenhub qr --url http://<LAN-IP>:5173` (macOS: `ipconfig getifaddr en0`; Windows: `ipconfig`), and scan it in the Even app. Venue Wi-Fi often blocks phone-to-laptop traffic; a phone hotspot helps.

## Package and upload a Beta build

```bash
npm run pack
```

This writes `nudge.ehpk` (gitignored). Upload it to an EvenHub Beta group at the Even Hub developer portal, add the testers' phone-account emails, then install it on the phone from **Me → Beta tester**.

The pack script stamps against SDK `0.0.12` (`--sdk-ver 0.0.12`), which is the version the vendored docs describe; `app.json` sets `min_app_version` to the floor the CLI requires for it.

## Rules (short version, full rules in `PLAN.md`)

- Branch `<lane>/<slug>` (`glass/`, `ai/`, `ui/`, `logic/`, `orch/`), PR into `integration`, never commit to `main`.
- Edit only the files on your task card.
- Never commit secrets, API keys or audio. `.env.local` is gitignored; `.env.example` lists variable names.
- Only `src/glasses/` and `src/audio/capture` import the Even SDK.

## Repo folders kept from setup

- `docs/ideas/`, `docs/decisions/`, `docs/meeting-notes/`, `tasks/`
