# S-3 Findings: on-device audio, IMU, blank screen, phone page, lock

Run on the real G2 on Sat Oct 17 (about 7:40-8:05 PM PT) with the probe in this folder, installed as a Beta build (`spike.ehpk`, version 0.1.1, SDK 0.0.12). Owner: GLASS.

**Caveat on the log.** Build 0.1.1 had a bug in its bridge-call timeout wrapper: it logged a "timeout" for *every* call, finished or not. All "timeout" lines from this run are ignored below. Build 0.1.2 fixes it (see "Open items").

## Summary for ORCH

| # | Question | Answer | Changes PLAN? |
|---|---|---|---|
| 1 | Glasses mic vs phone mic | **Glasses mic is cleaner and reliable.** Phone mic worked 1 of 3 times. | Yes: use `AudioInputSource.Glasses` for Steps 1-3. Drop phone mic as a default. |
| 2 | Raw IMU during head moves | Works, ~10 samples/s in g. **Up/down separable on x; left/right not separable** from this run. | Yes for T-305: tilt = look up / look down only. |
| 3 | Event capture while nothing is visible | **Input works:** a single-space text container with `isEventCapture: 1` received all taps and swipes. Visual darkness: *awaiting tester confirmation*. | No |
| 4 | Phone page visible while glasses render | **Yes.** | No |
| 5 | Lock/resume with mic open | **Mic and JS keep running while the phone page is hidden** (no gaps, no reload). SDK foreground/background events **never fired**. Full 5-minute lock with mic open still to confirm. | Yes: detect lifecycle with `document.visibilitychange`, not SDK events. |

## 1. Microphones

| Clip | Length | Chunks/s | Noise floor | Speech level | SNR | Clipping | Max gap |
|---|---|---|---|---|---|---|---|
| Glasses (run 1) | 9.6 s | ~20 | −38 dBFS | −11 dBFS | 27 dB | 0.01% | 90 ms |
| Glasses (run 2) | 9.7 s | ~20 | −42 dBFS | −21 dBFS | 21 dB | 0.00% | 95 ms |
| Phone | 8.5 s | ~10 | −30 dBFS | −9 dBFS | 21 dB | 0.03% | 117 ms |
| Phone (2 other attempts) | none | | | | | | |

Method: 3 s of silence, then a speaker about 1 m away talking normally. Floor is the 10th percentile of 100 ms window levels, speech the 90th.

- **The glasses mic has a lower floor (−38 to −42 vs −30 dBFS) and equal or better SNR.** It streams 50 ms chunks (about 20 per second); the phone mic sends 100 ms chunks.
- **The phone mic is unreliable.** `audioControl(true, Phone)` returned `false` twice (once 40 s after a glasses session ended, once after the lock tests). The one success took **more than 5 s** to resolve, which looks like a permission prompt. Both `g2-microphone` and `phone-microphone` were declared in the manifest.
- Neither mic arrived in under 10 s of wall time (9.6, 9.7, 8.5 s of audio per 10 s window), so expect a few hundred ms of start-up lag after `audioControl(true)`.

**Recommendation:** T-104 and T-202 use `AudioInputSource.Glasses` and declare only `g2-microphone`. The phone mic is at best a fallback, and it needs a retry and a timeout.

## 2. IMU

`imuControl(true, ImuReportPace.P100)` → `true`. About 10 samples per second (33-40 per 4 s pose). Values are in g; z ≈ 1.0 looking straight ahead.

| Pose (4 s each) | n | mean x / y / z | x range | y range | z range |
|---|---|---|---|---|---|
| Still, straight ahead | 33 | 0.03 / −0.16 / 1.00 | −0.01..0.06 | −0.23..−0.06 | 0.91..1.07 |
| Tilt left | 40 | −0.02 / −0.40 / 0.91 | −0.07..0.02 | −0.70..−0.17 | 0.74..1.01 |
| Tilt right | 35 | −0.08 / −0.64 / 0.79 | −0.24..0.06 | −0.71..−0.33 | 0.71..1.00 |
| Look up | 40 | **0.30** / −0.25 / 0.91 | −0.08..0.50 | −0.36..−0.20 | 0.85..1.00 |
| Look down | 40 | **−0.25** / −0.07 / 0.82 | −0.72..0.51 | −0.21..0.04 | 0.68..1.00 |

- **Look up / look down is clear on x**: about +0.3 g vs −0.25 g against ~0 at rest. A dead zone of ±0.15 g around a calibrated rest value would separate them.
- **Tilt left and tilt right both moved y negative** (−0.40 and −0.64), so one axis threshold cannot tell them apart. Either the poses weren't held cleanly, or roll needs y and z combined. Not resolvable from one run.
- At ~10 Hz, a deliberate gesture gives about 3-5 samples, enough for a debounced threshold.

**Recommendation for T-305 (stretch):** map look up / look down to PREV / NEXT, calibrated on mode entry. Leave left/right out unless a second run separates them.

## 3. Blank screen with event capture

A page with one full-screen text container, content `' '` (single space), no border, `isEventCapture: 1`. During 15 s: **4 taps and 3 swipes, all received.** In the simulator the display renders fully empty.

**Recommendation:** this is a valid `blank` Screen for T-101. *Open:* tester to confirm the real display looked completely dark.

## 4. Phone page while the glasses render

**Yes.** The phone page (buttons, live results, audio players) was visible and usable throughout while the glasses showed the probe's menu and test screens. The tester copied these results from it. The companion UI (T-105) has a place to render.

## 5. Lock / background with the mic open

From the event log (times are UTC on Oct 18):

- 02:47:42 `page visibility: hidden` (phone screen off / app in background)
- 02:48:17 lock test starts, glasses mic on
- 02:48:18-02:48:40 heartbeats every ~5 s: 10, 119, 220, 341, 461 chunks; last chunk always ≤ 0.1 s old
- 02:48:45 test finished (tap on glasses), mic off
- 02:49:54 `page visibility: visible`

So **the whole lock test ran with the phone page hidden**, and the glasses mic streamed with no gap over 1 s. The glasses display kept updating once a second during that time. A second 47 s lock test also had no gaps over 1 s.

Also:
- **The WebView was not reloaded or swapped.** Only one `boot` line. After 02:49:56 the page stayed hidden for 15+ minutes and its timers kept firing throughout.
- **SDK lifecycle events never arrived.** No `FOREGROUND_EXIT_EVENT` or `FOREGROUND_ENTER_EVENT` in the whole run; only the browser's `visibilitychange` fired.
- SDK 0.0.12 has no `setBackgroundState` / `onBackgroundRestore` (they're in the vendored `background-state` skill, but not in this SDK version).

**Recommendation:** lifecycle handling in `src/glasses/` (T-101) listens to `document.visibilitychange` and treats SDK foreground events as optional. Don't rely on state migration.

*Open:* the longest confirmed hidden span with the mic on is about 30 s. The Beta checklist asks for a 5-minute lock.

## Open items (build 0.1.2)

Build 0.1.2 is packed: it fixes the timeout logging, records SDK storage write timings on the phone page, and retries the phone mic once after 1.5 s. To close the remaining items, one more device run:

1. Lock the phone for a full 5 minutes during the lock test.
2. Glasses mic, then phone mic, to see whether the retry helps.
3. Read the `SDK setLocalStorage` line, which shows whether storage writes work and how fast. The 0.1.1 run can't answer that because of the logging bug, and it matters for T-106's `Store`.

Still needed from the tester: did the blank screen look completely dark? Which clip sounded clearer? Did a mic permission prompt appear, and how many times?

## How to rebuild the probe

```bash
npx vite build spikes/device --config vite.config.ts --outDir "$PWD/dist/spike" --emptyOutDir
npx evenhub pack spikes/device/app.json dist/spike --sdk-ver 0.0.12 -o spike.ehpk
```

`spikes/device/app.json` is a separate manifest with the two mic permissions, so the repo's `app.json` stays unchanged. It reuses `com.lahacks.nudge`, so uploading it replaces Nudge on the Beta; re-pack Nudge from `integration` afterwards. No audio is saved: clips exist only in memory for playback on the phone page.
