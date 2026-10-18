# Contracts

The code is the source of truth: `src/core/types.ts`, **CONTRACT_VERSION 2**. This page explains the meaning behind the types and the rules that keep five lanes from breaking each other.

## Rules

- Only ORCH edits `src/core/`. A builder that needs a change stops and says so in its reply.
- Changes are additive (new optional fields, new union members, new types). Bump `CONTRACT_VERSION`, note it in `TASKS.md`, and tell every lane to rebase on `integration`.
- `src/core/` holds types and constants only. No runtime code, no SDK imports.
- Modes import from `src/core/` and nothing in `src/glasses/` or the Even SDK.

## Changes from the PLAN.md draft (all additive)

| Addition | Why |
|---|---|
| `Transcript.error?: SttErrorCode` | T-104 needs a typed error ("mic-denied", "network", "timeout", "no-speech", "unknown") so a mode can show a `status` Screen instead of hanging. |
| `Store.removeWord`, `Store.getSessions`, `addWord` is an upsert | T-206 edits the personal bank; T-105 and T-304 show session history. |
| `SessionRecord` (with `endedAt?`) | Names the shape `saveSession` already took. |
| `SpeechState`, `UtteranceOptions`, `Unsubscribe`, `WordCategory`, `SuggestionSource`, `ScreenKind`, `ModeId` | Named aliases for shapes that were inline. No behavior change. |

## Version 2 (additive, Phase 1)

| Addition | Why |
|---|---|
| `AppShell`, `ModeInfo` | T-101 builds the shell (glasses launcher, mode switching, screen mirroring); T-105's phone UI drives it. One shared interface so neither invents its own. |
| `ModeContext.leave?()` | A mode had no way to say "I'm done". On BACK at its top level, a mode calls `ctx.leave?.()` and the shell calls `exit()`. Optional so existing mock contexts stay valid. |
| `GreyImage`, `ImageSource` | T-106 renders pictures and mouth shapes; T-101 sends them to image containers. The PNG must be exactly the container size. |
| `KeyValueStore` | T-106's `Store` persists through this; T-101 provides one over the SDK's `get/setLocalStorage`, so `src/store/` never imports the SDK. |

## Semantics

**Intent.** Click = `SELECT`, swipe down = `NEXT`, swipe up = `PREV`, double-click = `BACK`. The root page is the shell's launcher menu: double-click there calls `shutDownPageContainer(1)` (system exit dialog) and no mode sees it. Inside a mode, double-click is `BACK`, and the mode calls `ctx.leave?.()` when BACK happens at its top level. Long-press is not used. `src/glasses/` (T-101) owns the mapping.

**Menus are text, not list containers.** A firmware list container scrolls internally on swipes (no event) and reports clicks with an item index that `Intent` cannot carry. So `menu` Screens render as one text container with a `> ` marker on `items[index]`, and the mode moves `index` on NEXT/PREV.

**Screen.** Plain data. Modes build Screens; only `src/glasses/` renders them, and `src/phone/` previews them at 576x288.
- `blank`: nothing visible, but it still captures events (a single-space text container).
- `prompt`: a sentence with exactly one `____`.
- `cue`: one level of the ladder. Level 1 shows `imageKey` (Step 1) or `mouthKey` (Steps 2-3). Level 2 shows `masked` (Step 1, for example `c_p`) or the first letter (Steps 2-3). Level 3 shows `word`.
- `feedback`: `ok` true or false. Render with `√` / `×` or words; `✓` / `✗` are not in the G2 font (see `docs/DISPLAY_LIMITS.md`).
- `candidates`: `items[index]` shown at `level`; NEXT/PREV change `index` and reset `level` to 1.
- `menu`, `status`: as named. Keep `status.text` within about 60 characters per line and 10 lines.

**Time.** All `*Ms` fields are on the `ModeContext.now()` clock. Modes use `now()`, never `Date.now()`, so tests control time.

**SttService.** `start`/`stop` open and close the mic for the rolling transcript (Steps 2-3). `transcribeUtterance` is Step 1's one-shot call; it opens the mic itself if needed and **never rejects**: on failure it resolves with `text: ''` and `error` set. `onTranscript` emits partials (`isFinal: false`) and finals; consumers that only want finals filter on `isFinal`.

**PredictorService.** `predict` **never rejects**. On timeout (1.2 s), network failure or invalid model output it returns bank-only suggestions. An aborted `signal` resolves with `[]`. Details in `docs/PREDICTOR_PROMPT.md`.

**Store.** On-device only. `getBank` returns built-in words plus personal words. `addWord` upserts by `id`. `getSessions` returns most recent first. The production Store persists through a `KeyValueStore` and debounces writes (they share the BLE link).

**Mode.** `enter` resolves once the mode is running (not when it ends). `exit` must clear every timer and subscription the mode created; the registry calls it before entering another mode and on app exit.

**Flags.** All default `false` (T-003 reads them from the URL, for example `?svc=mock&step2=1`). Unfinished work stays behind a flag that is off.

## Ownership (`OWNERS.json`)

`OWNERS.json` maps each lane (`orch`, `glass`, `ai`, `ui`, `logic`) to the path globs it may edit. A PR from branch `<lane>/<slug>` may change only files that match its lane's `paths`, plus `branchGrants["<lane>/<slug>"]` when that exact branch has one. `branchGrants` covers the two Phase 0 tasks that create files owned by someone else afterwards (`glass/scaffold`, `logic/foundation`).

Glob syntax for `scripts/check-ownership` (T-003): `**` matches any number of path segments, `*` matches within one segment. Branches whose prefix is not a lane (for example `copilot/...`) fail the check.

Lanes may overlap only where ORCH is one side (`docs/**` contains `docs/design/**` and `docs/BETA_RESULTS.md`). No two builder lanes share a path.
