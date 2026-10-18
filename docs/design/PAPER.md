# Paper — Best Designed Hack ($1,500)

_Source: [LA AI Hackathon 2026 Devpost](https://la-ai-hackathon-2026.devpost.com/) prize list (Oct 2026). The public page lists prize tiers but does not expose a separate “View Additional Information” body for Paper; confirm any extra criteria on-site with sponsors._

## What Devpost states

- **Prize:** 1st / 2nd / 3rd place for “Paper - Best Designed Hack” ($1,500 / undisclosed / undisclosed on the listing we saw).
- **General submission bar (all projects):** description, public repo, 2–3 min demo video, complete Devpost page; optional resources such as **Figma designs** are encouraged.
- **Hackathon judging criteria (overall):** Technical Depth, **Product Thinking & Impact**, **Execution & Polish**, Originality & Insight.

## How Nudge should compete (T-006 → T-403)

| Theme | Nudge angle |
| --- | --- |
| Product thinking | Built for **stroke survivors and caregivers** — quiet assist, not a chatty dashboard. |
| Execution & polish | Companion UI uses shared tokens (`src/phone/theme/`); G2 layouts respect `docs/DISPLAY_LIMITS.md`. |
| Ease of use | 56px touch targets, high contrast, minimal chrome, `prefers-reduced-motion` honored. |
| Personal craft | Consistent **green phosphor** metaphor on glasses preview; warm grey-green phone palette (not generic teal SaaS). |

### T-403 polish (companion + story)

- **Calm phone UI** — Tabbed companion (Home / Demo / Preview / Word Bank): large type, 56px targets, build-capability strip; Home lists **Practice** and **Conversation** only when hints ship (Assist hidden). Preview lead: “Mirrors the glasses.”
- **Caregiver Conversation** — When the pack includes Step 3, hint sensitivity and pause live under the **Conversation** card on Home (not a separate Step 3 panel); controls stay hidden in Assist-only builds.
- **Letters-first assist** — Step 2–3 help on the G2 (T-209) and the phone preview (T-210, PR #93) show progressive letter masks instead of mouth shapes or word-bank pictures, matching the “quiet until you need a word” thesis.

## Deliverables for Paper (T-403)

1. **One cohesive visual system** — tokens + typography scale + spacing (done in T-006; polish pass in T-403).
2. **Documented glasses layouts** — `GLASSES_LAYOUTS.md` + `sketches/*.svg` (T-006); implemented in `src/glasses/` (T-101).
3. **Devpost extras** — link to `docs/design/`; PNG gallery in [`DEVPOST_ASSETS.md`](./DEVPOST_ASSETS.md) (`src/glasses/screenshots/`).
4. **Demo story** — judge puts on G2; phone page stays calm; glasses stay blank until help is needed (Quiet Tech thesis). **Judge demo:** companion **Demo** tab (cancellable replay) or `/src/phone/demo/index.html` (T-401).

## Open question for sponsor table

- Is use of the **Paper design tool** required, or is “best designed hack” judged on outcome only? **Default:** ship strong in-repo design docs + working UI; add Paper/Figma exports if sponsors confirm.
