# wss:// probe (blocker #2)

On the real G2, the realtime build gave Step 2 **no transcript** (ORCH_STATE blocker #2), so G2 runs on batch segments (0.4.2, `VITE_ROLLING_STT=batch`). This page finds out *why*, inside the Even app's own WebView, in one run of about 40 s.

**In the simulator every test passes**, including test 7 with real speech: T-202's realtime pipeline delivers partials and a final transcript ("Please pass me the cup of tea."). So the code is right, and something on the device differs. This probe shows which layer it is.

## Run it on the G2 (about 5 minutes)

It has **its own package ID** (`com.lahacks.nudge.wssprobe`), so it installs next to Nudge and **does not replace the G2 build**.

```bash
# from the repo root, on a clean checkout of integration
npx vite build spikes/stt/wss-probe --config vite.config.ts --outDir "$PWD/dist/wss-probe" --emptyOutDir
npx evenhub pack spikes/stt/wss-probe/app.json dist/wss-probe --sdk-ver 0.0.12 -o wss-probe.ehpk
```

1. Upload `wss-probe.ehpk` at hub.evenrealities.com as a **new project**. If the portal only accepts the existing Nudge package ID, wait until G2 is done, set `package_id` to `com.lahacks.nudge` and the version above the last upload (D10), then re-pack Nudge afterwards.
2. Install it from **Me → Beta tester**, open it, and wear the glasses.
3. When the glasses show **"7 Say ONE short sentence, then stay quiet"**, say "Please pass me the cup of tea" and wait.
4. On the phone page, tap **Copy results** and paste the JSON into the PR or issue. Tap the glasses to run again; double-tap to exit.

## What each line means

| # | Test | What it isolates |
|---|---|---|
| 0 | page policy | Reads our own page's response headers. A `content-security-policy` here is probably how the app enforces the `app.json` whitelist; its `connect-src` governs both `fetch` and WebSockets. |
| 1 | token | `api/stt` mints a `realtime_scribe` token. Expected OK: batch already works on the G2. |
| 2 | EL realtime | Scribe realtime opened with T-202's exact `realtimeUrl()`, no keyterms. OK = `session_started`. |
| 3 | EL + keyterms | The same with the app's personal-bank keyterms, which rules out the query string. |
| 4 | echo listed | `wss://ws.postman-echo.com/raw`, **whitelisted** in this probe. Do WebSockets work at all? |
| 5 | echo unlisted | `wss://echo.websocket.org`, **not** whitelisted. Is `wss://` policed by the whitelist? |
| 6 | fetch unlisted | `https://httpbin.org/get`, **not** whitelisted (it sends CORS). Control: is `https` policed? |
| 7 | live mic → RT | The real `RealtimeTranscriber` on the live glasses mic for 10 s: Step 2's actual pipeline. |

Every `securitypolicyviolation` the WebView reports is captured with its directive and full policy text (`violations` in the JSON).

## Reading the result

| Glasses verdict | Meaning | Likely fix |
|---|---|---|
| *Realtime works end to end here* | Nothing on the device blocks realtime | The earlier failure was transient or timing (for example, before the origin fix at 11:11 PM). Re-test the realtime build. |
| *wss OK; audio/transcripts fail (see 7)* | The socket connects, but the live pipeline yields nothing | Look at 7's `audioChunks` (is the mic streaming?) and `events` (server errors such as `insufficient_audio_activity`, `chunk_size_exceeded`). |
| *wss works when listed: fix the EL entry* | WebSockets pass for whitelisted hosts, but not ElevenLabs | Change the `app.json` entry format (for example `api.elevenlabs.io` without a scheme, or a path) and re-test. |
| *wss works, not policed: EL rejected us* | `wss://` isn't filtered at all, but Scribe closes the connection | Check 2's `closeCode` and `closeReason` (auth, region). |
| *CSP blocks wss (see policy)* | The page's `connect-src` omits `wss:` | Ask Even (Discord) how to whitelist WebSockets, or keep batch (D17). |
| *all wss fail: WebSocket blocked* | No WebSocket works, whitelisted or not | WebSockets aren't supported in the Even WebView; keep batch (D17). |

Tokens are single-use and never shown; the JSON redacts them. No audio is stored.
