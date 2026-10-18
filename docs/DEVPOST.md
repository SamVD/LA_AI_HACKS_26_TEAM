# Nudge: Devpost writeup

_Draft by ORCH for T-404, Sun Oct 18 2026. Facts come from `PLAN.md`, `docs/ORCH_STATE.md`, `docs/BETA_RESULTS.md` and `spikes/*/FINDINGS.md`. Lines marked **[FILL]** depend on the G3 re-run (decision point B), the final build, or links that don't exist yet. Resolve every **[FILL]** before pasting into Devpost._

---

## Tagline

A quiet word-finding aid for people with aphasia. The glasses stay blank until you're stuck on a word.

## Inspiration / the problem

Aphasia is a language disorder, most often caused by stroke. People with it know what they want to say but can't retrieve the word. Conversation is where it hurts most: the pause gets awkward, the other person guesses or finishes the sentence, and many people stop speaking up.

Existing aids are apps the person has to pick up and type into. That breaks the flow of the conversation, which is exactly what they're trying to protect.

Nudge puts the help where it's needed without taking the person out of the moment: a few letters on the glasses, visible only to the wearer, only when asked for or (optionally) after a stall.

## What it does

Nudge is an Even Hub app for the **Even G2**. Three steps, the first two being the core product:

| Step | Name in the app | What happens |
|---|---|---|
| 1 | **Practice** | A sentence with a blank ("You drink from a ____."). The wearer says the word. √ or ×. If they're stuck, the cue ladder climbs: picture, then `c_p`, then the full word. |
| 2 | **Assist** | In a real conversation the wearer taps the temple touchpad. Nudge reads the last few seconds of the conversation, predicts the word they're looking for, and shows it letters-first: `s _ _ _ _`, then `s u n _ _`, then `sunny`. Swipe for the next suggestion. |
| 3 | **Conversation** | Same hints, but Nudge notices a stall ("…it was really warm and um…") and offers help on its own. Tap still works anytime. **[FILL: ships ON / ships OFF per G3, decision point B]** |

The display is blank the rest of the time. That is the product: **Quiet Tech**.

Every hint is letters-first on purpose. The wearer often knows the word once they see its first letter; showing the whole word is the last step, not the first. This is the same cueing hierarchy speech therapists use.

A caregiver or clinician can use the **phone companion** (the web page shown on the phone beside the glasses): add personal words (names, medications, places), set hint sensitivity, pause hints, see which hints fired, and review Practice sessions.

## How the G2 is used

The judges will ask, so plainly:

- **Display (576×288, monochrome green):** the only output. All visuals are text, plus small greyscale line-art pictures in Step 1. There is a blank, event-capturing screen so the glasses show nothing when idle.
- **Glasses microphone (`g2-microphone`):** the only audio input. We tested both mics on the real G2 (S-3): the glasses mic is cleaner (floor −38 to −42 dBFS) and reliable; the phone mic started 1 time in 3, so we dropped it.
- **Touchpad:** tap = ask for help / reveal more, swipe = next suggestion or skip, double-tap = back out. Root double-tap hits the Even exit dialog as the platform requires. We don't use long-press.
- **Lifecycle:** keeps running while the phone is locked (S-3: the glasses mic streamed with no gap over 1 s through lock tests, and the page's timers kept firing for 15+ minutes hidden; the lock check passed again at gate G1), and shows "Microphone is off" with a tap-to-retry if the mic can't start.
- **Not used:** camera (the G2 has none), speaker (none), IMU/head tilt (measured in S-3: up/down separates, left/right does not, so we cut it rather than ship something flaky).

## How we built it

```
G2 mic ─(16 kHz PCM)→ audio capture + local VAD ──→ ElevenLabs Scribe (STT)
                                                          │ transcript
                                      stall detector ←────┤
                                           │              ▼
                                           └──────→ Gemini predictor (via our proxy)
                                                          │ candidates
                          mode logic (Practice / Assist / Conversation)
                                                          │ Screen (plain data)
                              ┌───────────────────────────┴──────────────┐
                              ▼                                          ▼
                  glasses renderer (Even SDK)                phone companion + live preview
```

- **One web app**: Vite + TypeScript, running in the Even phone app's WebView. No native code.
- **Modes never touch the SDK.** A mode gets interfaces (STT, predictor, store, clock) and emits plain `Screen` data. Only `src/glasses/` turns a Screen into SDK containers. This let four people build in parallel with one pair of glasses, and means every mode is tested in plain Node and mirrored live on the phone.
- **Every service has a mock**, so the whole product runs in the desktop simulator with scripted conversations and no network.
- **Small serverless proxy** (Vercel): `api/stt` only mints single-use ElevenLabs tokens (no audio ever passes through our servers); `api/predict` holds the Gemini key. Neither key is in the app bundle.
- **Privacy by default:** audio is never stored. Transcripts live in memory. The personal word bank stays on the device.
- **Degrade, never die:** if Gemini is slow, rate-limited or down, the predictor falls back to a bank-only ranking that returns nothing rather than noise.

### Sponsor tech

**Google Gemini (MLH Best Use of Gemini API).** `gemini-3.5-flash-lite` with minimal thinking and few-shot examples picks the word the wearer is looking for from the last few seconds of conversation plus their personal word bank, with a JSON schema on the output and validation before anything reaches the glasses. On our 25-case evaluation set, top-3 accuracy was **0.98** (zero-shot 0.94) against **0.60** for the bank-only fallback, with 100% valid JSON (`spikes/predictor/FINDINGS.md`). Measured latency through our proxy is about 1.0 s (0.94–1.27 s).

**ElevenLabs (MLH Best Use of ElevenLabs).** Scribe (`scribe_v2`) transcribes the wearer's speech. Step 1 grades each spoken answer; Steps 2–3 keep a rolling transcript of the conversation. We pass personal names, medications and places as keyterms to bias recognition toward the wearer's own vocabulary, and deliberately **never** pass Step 1's target word, because that makes the grader say "correct" for near-misses (D1). Batch transcription returns text about 300 ms (p50) after the speaker stops (S-1).

**Paper (Best Designed Hack).** Quiet Tech as a design constraint: nothing on screen until needed. One token system (`src/phone/theme/`) shared by the phone UI and the glasses preview; 56 px touch targets, high contrast, reduced-motion respected; green-phosphor palette on the preview that matches the real display, warm grey-green on the phone instead of generic SaaS teal. Documented glasses layouts checked against the display limits (`docs/DISPLAY_LIMITS.md`, `docs/design/GLASSES_LAYOUTS.md`). Gallery and notes: `docs/design/`.

## What's real and what's mocked

Honest table. A judge should be able to trust every "real".

| Piece | Status |
|---|---|
| Glasses mic capture, local voice-activity detection | **Real**, on the G2 |
| Speech-to-text (ElevenLabs Scribe, batch) | **Real**, on the G2 over the hosted token proxy |
| Gemini word prediction | **Real**, live through `api/predict` (free tier, throttled) |
| Step 1 Practice, graded with real speech | **Real**: passed on the G2 (gate G1) |
| Step 2 Assist in a two-person conversation | **Real**: passed on function on the G2 (gate G2); "warm and um um" + tap → "sunny" |
| Step 3 automatic hints | **[FILL: G3 result]** Works on the G2 (run 1: ~3–4 s per hint, before the latency fix). Re-run on 0.4.4 with the early-prediction fix: **[FILL numbers or "held, off in this build"]** |
| Practice words and pictures | **Real but small**: a 38-word starter bank with 55 line-art pictures and 10 mouth-shape drawings, rendered to greyscale on the device; the wearer adds their own words |
| **Judge demo** (phone **Demo** tab, `src/phone/demo/`) | **Scripted.** Replays a recorded conversation fixture and shows the hint screens in the G2 preview so a judge can see the flow without a second person. It does not use the mic or Gemini, and the page says so. |
| Phone preview of the glasses | Real rendering of the same Screen data the glasses get, drawn as SVG at 576×288 |
| Head-tilt yes/no | **Not built** (measured and cut, D9) |
| Steps 4–5 (mumble detection, sentence completion) | **Not built.** Backlog |

## Challenges we ran into

- **Only one pair of glasses for four developers**, and QR dev mode is broken on Even's side, so every device test is a packaged build upload (a few minutes each). We built mocks and a simulator-first workflow, and batched device checks into three gates.
- **A "No connection" bug that only the real device showed.** The packaged app's WebView origin is `http://127.0.0.1:<port>`, which our token server's CORS allow-list rejected. The simulator never hit it.
- **Realtime speech-to-text over WebSocket works in the simulator and not from a packaged build** (we believe the Even app blocks `wss://`; unconfirmed). We fell back to chunked batch transcription over HTTPS, which costs about a second of latency.
- **Latency is the product.** A hint that arrives 4 seconds after the stall isn't help. We measured where the time goes (1.5 s of deliberate silence to tell a stall from a pause, ~1 s for Gemini, transcription and render on top), then cut it: flush the transcript on a tap, start the prediction as soon as a transcript ends like a stall, and show letters first.
- **Speech-to-text "corrects" what it hears.** For grading someone with aphasia, an STT that silently turns a near-miss into a real word is the wrong default. We found it in the first spike and made Step 1 never bias toward the target.
- **An outage we caused.** A production deploy from an unmerged branch put old code live and `api/stt` returned 500 for about 9 minutes. We wrote a deploy rule and script the same hour (production only from merged commits, via `api/_deploy-prod.sh`).

## Accomplishments

- Practice and Assist both **passed on the real G2** with real speech, not just in a simulator.
- Gemini top-3 of **0.98** on our evaluation set, with schema validation and a fallback that is honest about being worse (0.60).
- A hint ladder built from how clinicians actually cue: first letter before the whole word.
- A strict architecture (modes never import the SDK) that held up across four people and four tools, enforced by a CI ownership check on every PR.
- **About 800 automated tests** (797 on `integration` at the time of writing) **[FILL: final count]**.

## Honest limitations

- **Not clinically validated.** We have not tested Nudge with people who have aphasia. The design follows speech-therapy cueing practice; it is not a medical device and makes no outcome claims.
- **Latency is not yet where we want it.** On the G2 the tester described Assist as slow; the simulator median from tap to candidates is about 1.5 s (T-208), not yet confirmed on the glasses. **[FILL: add the G3 re-run numbers for Assist and auto-hints]**
- **It can't tell who is talking.** The glasses mic hears the conversation partner too. Step 3 can mistake the partner's pause for the wearer's stall. A loudness-based speaker tag (T-314) is designed (an optional `speaker` field is already in the contract) but **not built**.
- **Free-tier Gemini** is capped at 15 requests/minute. We throttle (prefetch ≤12/min, 3/min reserved for taps) and fall back to bank-only suggestions under load. Billing would remove the cap.
- **English only**, and the word bank is a 38-word starter set.
- **Speech-to-text can still mishear** short or unclear words; Step 1 may show × for a word that was said.
- **One device tested.** One pair of G2 glasses, a small number of testers, venue Wi-Fi.

## What's next

1. Test with speech-language pathologists and people with aphasia, and tune cue timing to the person.
2. Real speaker separation (wearer vs partner) so auto-hints only fire on the wearer's stalls.
3. Realtime STT once packaged apps can open `wss://`; that removes about a second.
4. Steps 4–5 from the original sheet: flag mumbled words and show the corrected one; suggest missing filler words and sentence completions from the person's own recorded speech.
5. Caregiver and clinician export of session logs (test builds already export a raw pipeline log from a Debug tab).

## Built with

TypeScript, Vite, Even Hub SDK (`@evenrealities/even_hub_sdk`, SDK 0.0.12), Even G2, ElevenLabs Scribe, Google Gemini (`gemini-3.5-flash-lite`), Vercel serverless functions, Vitest, GitHub Actions.

## Try it out

- **Repo:** https://github.com/SamVD/LA_AI_HACKS_26_TEAM (confirm this is public before submitting)
- **Beta build:** Even Hub Beta group **[FILL: group name / how a judge installs]**, `nudge.ehpk` version **[FILL: final version, 0.4.4 or later]**
- **Judge demo without glasses:** the phone page → **Demo** tab, or `/src/phone/demo/index.html` **[FILL: hosted URL if there is one]**
- **Demo video (2–3 min):** **[FILL: link]**; shot list in [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md)
- **Screens and design notes:** [`docs/design/DEVPOST_ASSETS.md`](./design/DEVPOST_ASSETS.md), [`docs/design/PAPER.md`](./design/PAPER.md)

## Gallery images (from `src/glasses/screenshots/`)

Suggested order: `15-phone-companion.png` (refresh first, see ORCH_STATE), `00-launcher.png`, `01-prompt.png`, `03b-cue-L1-picture.png`, `04-cue-L2.png`, `06-feedback-ok.png`, `16-candidates-v3-L1.png` (`s _ _ _ _`), `17-candidates-v3-L2.png` (`s u n _ _`), `18-candidates-v3-L3.png` (`sunny`). Don't use `08`-`10`/`08b`: they show the old picture and mouth-shape hints that Steps 2-3 no longer use. Add a photo of the real G2 in use if one exists; it is worth more than any screenshot.

## Team

Aarav (ORCH / architecture and audits), Sam (AI lane: speech-to-text hosting, Gemini predictor, stall detection), Sarah (glasses lane: renderer, mic, device testing), juannli (UI and logic lanes: phone companion, Practice mode, matcher, assets). **[FILL: full names and Devpost handles]**
