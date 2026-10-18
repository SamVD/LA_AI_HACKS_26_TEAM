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

## Run on the real G2 (QR over LAN)

1. Laptop and phone on the same Wi-Fi. Venue Wi-Fi often blocks device-to-device traffic; a phone hotspot works.
2. `npm run dev`
3. Find your laptop's LAN IP (Windows: `ipconfig`, look for IPv4 Address; macOS: `ipconfig getifaddr en0`).
4. `npx evenhub qr --url http://<your-ip>:5173`
5. In the Even app, scan the QR code. The glasses show "Hello Nudge"; edits hot-reload.

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
