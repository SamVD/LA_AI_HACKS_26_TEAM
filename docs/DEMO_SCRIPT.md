# Nudge: Demo script

_T-404, ORCH. Two uses: (1) the **2–3 minute Devpost video**, (2) the **live judge walk-up** at the table. Timings are targets; rehearse with a stopwatch (T-405 calls for two full rehearsals). **[FILL]** marks anything that depends on the final build._

## Before anyone walks up (5-minute setup)

- [ ] G2 charged, paired, **final Beta build installed** (version **[FILL]**; check Me → Beta tester). Launcher shows **Practice / Conversation** (**[FILL: or Practice / Assist if G3 failed, decision B]**).
- [ ] Phone on a **hotspot you control**, not venue Wi-Fi. Phone brightness up, do-not-disturb on, auto-lock off.
- [ ] Phone companion open on **Home**; Demo tab one tap away. The Home build strip should read the flags you expect.
- [ ] Production API alive: `curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS https://nudge-seven-psi.vercel.app/api/stt/token -H "Origin: http://127.0.0.1:61976" -H "Access-Control-Request-Method: POST"` returns **204**.
- [ ] Gemini free tier not exhausted: open AI Studio → rate limits. If unsure, do the Assist beat with the tap only and skip Conversation auto-hints.
- [ ] Simulator (`npm run dev` + `npm run simulate`) running on a laptop as backup **and** the phone Demo tab loaded, so a failure costs one gesture, not a restart.
- [ ] Two people for the conversation beat. Agree the stall phrase ahead: **"The weather is really warm and, um, um…"** (target word "sunny").
- [ ] Do **not** run `vercel --prod` or redeploy anything during the event (PLAN D15).

## Video (target 2:30)

| Time | Shot | Say |
|---|---|---|
| 0:00–0:15 | Close-up, someone mid-sentence, stopping, searching for a word. | "People with aphasia know what they want to say. The word just won't come. And the pause gets awkward fast." |
| 0:15–0:30 | G2 on, glasses display **blank** (screen recording from the glasses view or a photo through the lens). | "Nudge is for the Even G2. The display stays blank until you need it. That's the whole idea." |
| 0:30–1:05 | **Practice (Step 1).** Prompt with the blank → wearer says the word → √. Then a stuck one: tap → picture → `c_p` → word. | "Practice: fill in the blank out loud. If you're stuck, help climbs the way a speech therapist would cue: a picture, the first letters, then the word." |
| 1:05–1:55 | **Conversation.** Two people talking; wearer stalls on "um um"; wearer taps; glasses show `s _ _ _ _`; tap → `s u n _ _`; tap → `sunny`; wearer says it and the display clears. Cut to the phone preview mirroring the same screens. | "In a real conversation, Nudge listens through the glasses mic, reads the last few seconds, and predicts the word. It shows the first letter before the whole word, so you get to find it yourself." |
| 1:55–2:10 | **[FILL, only if Step 3 ships ON]** Stall with no tap; hint appears by itself. Otherwise cut this beat. | "It can also notice the stall and offer help on its own." |
| 2:10–2:30 | Phone companion Home: personal words, sensitivity, hint log. End on the blank glasses. | "A caregiver sets it up on the phone, with the person's own names, medications and places. Speech-to-text by ElevenLabs, word prediction by Gemini. Quiet until it matters. This is Nudge." |

Video rules: **say once on screen or in voice that the phone Demo tab is a scripted replay**, if it appears. Don't show the API keys, `.env.local`, or the Vercel dashboard. Record at least two takes of the conversation beat; the first is usually the stiffest.

## Live walk-up (3 minutes, judge wears the G2)

1. **(0:00) Frame it, 15 s.** "This helps people with aphasia find words. The glasses show nothing until you need a word. Want to try it?"
2. **(0:15) Put the G2 on, 15 s.** Hand over the glasses. Open **Practice**.
3. **(0:30) Practice, 60 s.** The judge sees "You drink from a ____." They say "cup" → √. For the next, have them stay quiet and tap: picture, then `c_p`, then the word. Point out: "Letters before the word, so you do some of the work."
4. **(1:30) Conversation, 75 s.** Switch to **Conversation**. You talk with the judge: "Tell me about your weekend… it was really warm and, um…" **Judge taps.** They see `s _ _ _ _`, tap again `s u n _ _`. "The glasses heard our conversation, and Gemini guessed the word from what we were talking about."
5. **(2:45) Close, 15 s.** Show the phone: "The caregiver adds this person's own words here." Leave a one-line takeaway.

**Expect the questions:**

| Question | Answer |
|---|---|
| "How does it use the G2?" | Display for hints, glasses mic for speech, touchpad for help and next. No camera or speaker on the G2. Details in `DEVPOST.md` → *How the G2 is used*. |
| "Is this real or scripted?" | The glasses flow is real, with live speech-to-text and a live Gemini call. The phone **Demo tab** is a scripted replay and says so. |
| "Why so slow?" | Honest answer: about 1.5–2.5 s today. A pause has to last ~1.5 s before we call it a stall; Gemini is ~1 s; packaged builds can't use realtime STT, which would save ~1 s. **[FILL: add the G3 numbers]** |
| "Does it work for real patients?" | Not clinically validated. Cueing order follows speech-therapy practice. We want SLP partners next. |
| "What if the other person talks?" | It can't tell wearer from partner yet. Loudness-based speaker tagging is designed but not built (next step). Step 1 already ignores short non-matching noise. |
| "What about privacy?" | Audio is never stored; transcripts stay in memory; the word bank stays on the device; no audio passes through our servers. |

## Backup plan (use the first one that works; don't apologize, just continue)

| Failure | Fallback | Cost |
|---|---|---|
| Glasses won't connect or app won't start | Switch to the **simulator** on the laptop (`npm run dev`, `npm run simulate`): same app, same screens. Say it's the simulator. | 20 s |
| Simulator also down | Phone companion → **Preview** tab mirrors every glasses screen; walk the flow there. | 10 s |
| "No connection" / "Could not hear you" in Practice | Venue network. Switch the phone to the hotspot, retry. If still failing, go to the **Demo** tab. | 20 s |
| Step 2/3 gives no hint or odd hints (Gemini throttled or down) | The predictor falls back to word-bank suggestions on its own. Say so. If it returns nothing, use the **Demo** tab's scripted stall and be explicit that it's scripted. | 10 s |
| Hints too slow for the room | Tap instead of waiting; set Sensitivity to **Eager** on the phone Home card. | 5 s |
| Mic is picking up the crowd | Step close, speak up, or move to the quiet edge. Practice grading ignores short non-matching noise (T-313). | 10 s |
| Total device failure | Play the **recorded video** and talk over the phone Demo tab. | 30 s |

**Standing rules at the table:** one person drives, one watches the phone for status text; don't change settings, rebuild, or redeploy during judging; if a screen shows "Microphone is off", the glasses mic didn't start (glasses off, asleep or out of Bluetooth range; the Even app has no per-app mic switch, D16): check the glasses are on and connected, then tap to retry.

## After the demo

- Remind the judge of the Devpost and the Beta install path (**[FILL]**).
- If the G2 is on loan, hand it back per the return arrangement confirmed in T-405.
