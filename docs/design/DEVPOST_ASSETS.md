# Devpost & Paper — visual assets

Use these paths in Devpost “Try it out”, Paper extras, or slides. All G2 frames are **576×288** green phosphor (matches `src/phone/preview/renderScreen.ts`).

## G2 screen gallery (PNG)

Captured from the glasses renderer / simulator (`src/glasses/screenshots/`).

| File | Screen |
| --- | --- |
| [`00-launcher.png`](../../src/glasses/screenshots/00-launcher.png) | Mode launcher |
| [`01-prompt.png`](../../src/glasses/screenshots/01-prompt.png) | Step 1 prompt |
| [`02-prompt-longest-frame.png`](../../src/glasses/screenshots/02-prompt-longest-frame.png) | Long practice sentence |
| [`03-cue-L1-text-only.png`](../../src/glasses/screenshots/03-cue-L1-text-only.png) | Cue L1 (text) |
| [`03b-cue-L1-picture.png`](../../src/glasses/screenshots/03b-cue-L1-picture.png) | Cue L1 (picture) |
| [`04-cue-L2.png`](../../src/glasses/screenshots/04-cue-L2.png) | Cue L2 (masked) |
| [`05-cue-L3.png`](../../src/glasses/screenshots/05-cue-L3.png) | Cue L3 (word) |
| [`06-feedback-ok.png`](../../src/glasses/screenshots/06-feedback-ok.png) | Feedback correct |
| [`07-feedback-try-again.png`](../../src/glasses/screenshots/07-feedback-try-again.png) | Feedback retry |
| [`08-candidates-L1.png`](../../src/glasses/screenshots/08-candidates-L1.png) | Step 2 help L1 (picture) |
| [`08b-candidates-L1-mouth.png`](../../src/glasses/screenshots/08b-candidates-L1-mouth.png) | Step 2 help L1 (mouth) |
| [`09-candidates-L2.png`](../../src/glasses/screenshots/09-candidates-L2.png) | Candidates L2 |
| [`10-candidates-L3.png`](../../src/glasses/screenshots/10-candidates-L3.png) | Candidates L3 |
| [`11-menu.png`](../../src/glasses/screenshots/11-menu.png) | Menu |
| [`12-status.png`](../../src/glasses/screenshots/12-status.png) | Status |
| [`13-blank.png`](../../src/glasses/screenshots/13-blank.png) | Blank (Step 2 idle) |
| [`14-stub-step2.png`](../../src/glasses/screenshots/14-stub-step2.png) | Step 2 (early stub) |
| [`15-phone-companion.png`](../../src/glasses/screenshots/15-phone-companion.png) | Phone companion (Home tab) |
| [`system-map-diagram.png`](./system-map-diagram.png) | **How it works**: system map of the final judge build 0.4.5 (glasses → phone → cloud). Full page: [`system-map.png`](./system-map.png); source: [`system-map.html`](./system-map.html) |

### Phone companion (Home)

The packaged phone page (`mountCompanion` in `src/phone/`) is the calm caregiver surface judges see beside the G2.

- **Build strip** — `This build: Practice · Assist · Hints` (or `Assist off` / `Hints off` when flags are off at pack time). One line at the top of Home; no dashboard chrome.
- **Step 3 card** — Sensitivity (Eager / Balanced / Gentle), pause/resume hints, and a short hint log. **Hidden when Step 3 is not in the build** (`step3` mode disabled); visible when the pack ships with `VITE_STEP3=1`.
- **Judge demo** — Inline **Demo** tab or standalone `/src/phone/demo/index.html` for scripted stall replay (T-401).
- **Preview** — Mirrors glasses screens; after T-210 / CONTRACT v3, Step 2–3 **candidates** are letters-first (`c _ _`, then half the word, then full word) with no picture or mouth slot.

Refresh [`15-phone-companion.png`](../../src/glasses/screenshots/15-phone-companion.png) after UI changes if Devpost still shows an older Home (build strip missing, Step 3 card wrong, or pre–letters-first preview).

## Wireframes (SVG)

Editable layouts: [`screens/`](./screens/) (regenerate via [`README.md`](./README.md)).

## Live demo (video backup)

- Packaged app: phone page + G2; judge **Demo** tab or [`/src/phone/demo/index.html`](../../src/phone/demo/index.html) for scripted stall (T-401).
- Design system: [`src/phone/theme/`](../../src/phone/theme/), [`PAPER.md`](./PAPER.md).
