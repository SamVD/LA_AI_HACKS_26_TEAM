# S-1 Findings: ElevenLabs Scribe from the WebView

_AI lane, branch `ai/spike-stt`, Sat Oct 17 2026 (about H8). All numbers were measured on venue Wi-Fi from a MacBook. Raw results are in `results/*.json`._

_History: the first commit on this branch (SamVD) was a doc-backed partial with a CORS measurement and an ElevenLabs-TTS harness (`bench-tts.mjs`, renamed from `bench.mjs`, plus `browser-check.html`). The second commit adds the measured run that fills its "pending" sections. The two agree on every recommendation. `bench-tts.mjs` was re-run: tokens and CORS reproduced (both mint 200; preflights 200 with `*`). It couldn't generate clips because our STT-scoped key lacks `text_to_speech` (401 `missing_permissions`), so every clip below is macOS `say`._

## Recommendation

| | Step 1 (`transcribeUtterance`) | Steps 2-3 (`onTranscript`, rolling) |
|---|---|---|
| Endpoint | Batch `POST https://api.elevenlabs.io/v1/speech-to-text` | Realtime `wss://api.elevenlabs.io/v1/speech-to-text/realtime` |
| Model | `scribe_v2` | `scribe_v2_realtime` |
| Audio | **Raw PCM, no WAV wrapper.** Send the SDK's 16 kHz s16le mono bytes as `file`, with `file_format=pcm_s16le_16` | `audio_format=pcm_16000`, each SDK buffer base64-encoded in `input_audio_chunk` |
| Auth from the WebView | Single-use token `batch_scribe` in `?token=`. Pre-mint it when the prompt is shown | Single-use token `realtime_scribe` in `?token=`, one per session |
| Settings | `language_code=en` (required, see Q5). **No** keyterms for grading by default (see Q6) | `commit_strategy=vad`, `vad_silence_threshold_secs=0.8`, `language_code=en`, `include_timestamps=true`, `keyterms` = personal bank names, meds and places |
| Expected latency | **p50 ~290-320 ms, p95 ~430-500 ms** from the end of the recording to the text, plus our `endSilenceMs` | Words show **~0.85 s p50 (p95 ~1.6 s)** after they are spoken. A segment commits ~0.75 s after the last word at 0.5 s VAD |
| Speech state | Local energy VAD on the PCM, not the STT | Same. STT lags too much for `onSpeechState` |

**Is `api/stt` needed?** Yes, as a **token minter only**. No audio passes through our server. The browser talks to ElevenLabs directly, because CORS is `*` and the WebSocket accepts any origin. What `api/stt` must do is in the "api/stt spec" section below. `token-server.mjs` is a working 30-line reference.

**Why batch for Step 1:** on isolated single words, batch got 12/12 correct (both voices, both hosts, every run). Realtime got 9/12 (Node) and 10/12 (Chrome): cup→"Car.", fork→"Four.", Daniel's fork→"Talk.". Realtime finishes faster after commit (~90-130 ms vs ~300 ms), but the accuracy gap matters more for grading. On sentences, realtime matched or beat batch (see Q4c), so it fits Steps 2-3.

---

## Method

- **Harness** (all in `spikes/stt/`, Node built-ins plus `fetch`/`WebSocket`, nothing new installed):
  - `make-clips.mjs` writes test clips to `clips/` (gitignored).
  - `lib.mjs` holds the batch, token, realtime, and rolling clients.
  - `bench.mjs` runs each experiment and writes `results/<name>.json`.
  - `token-server.mjs` is the `api/stt` prototype.
  - `index.html` + `spike.ts` are the browser harness: clip playback, mic record, live realtime, and `?auto=1` for WebViews that can't be clicked.
- **Clips.** These are macOS TTS voices (Samantha en_US, Daniel en_GB): 16 kHz mono s16le, 300 ms lead and 600 ms trail padding, ~-54 dBFS noise floor. There are 12 clean single words (1.2-1.7 s each), 17 slurred/partial/non-word clips, and 3 conversation clips (4.9-6.8 s). **This is synthetic speech, not aphasic speech.** It shows whether Scribe keeps or "fixes" non-words, but it is not a substitute for a real user. The page's hold-to-record button exists for that (see "Not tested").
- **Environments:**
  - Node 26 (`fetch` + global `WebSocket`).
  - Chrome desktop at the LAN origin `http://172.22.201.33:5181`, which is what the QR flow uses.
  - **Even simulator WebView**: `evenhub-simulator ... --automation-port 9898`, with its `/api/console` read back. Its UA is `AppleWebKit/605.1.15`, so WebKit, the same engine as the iOS Even app.
  - Not run: the Even app on a real phone.

---

## Q1. Batch vs realtime: which works from a browser WebView?

Both work from every browser context we tested.

| Context | Batch (token) | Realtime WS (token) | Evidence |
|---|---|---|---|
| Node | ✅ 200 | ✅ `session_started`, commits | `results/latency.json`, `realtime.json` |
| Chrome, LAN origin `http://172.22.201.33:5181` | ✅ 12/12 HTTP 200 | ✅ 12/12 committed | `results/browser.json` → `chromeBatchViaToken`, `chromeRealtimeViaToken` |
| Even simulator WebView (WebKit), `http://localhost:5181` | ✅ cup 370 ms, medicine 306 ms | ✅ session 182/143 ms, final 87/93 ms | `results/browser.json` → `evenSimulatorWebView` |
| Even app on the G2 (packaged `.ehpk`) | not run: QR is broken (`docs/BETA_RESULTS.md`), and a packaged page can't reach a laptop token server | not run | see "Not tested" |

## Q2. Do we need a server-minted token, and so `api/`?

**Yes, a token endpoint, but not an audio proxy.**

- `POST https://api.elevenlabs.io/v1/single-use-token/{batch_scribe|realtime_scribe}` with header `xi-api-key` returns `{"token":"sutkn_..."}`. Tokens expire after 15 minutes and are consumed on use.
- Batch accepts the token as a `?token=` query parameter with **no key header**: 6/6 HTTP 200 (`results/token.json`).
- Reusing a batch token fails: `403 {"detail":{... "message":"Token not found or has expired.","status":"invalid_token"}}`. **One token per utterance.**
- Realtime accepts `?token=` in the WebSocket URL (all realtime runs above used tokens).
- Mint latency from Node: **p50 97 ms, p95 189 ms** (n=6). Through the local token server from Chrome: 98-201 ms. Pre-minting one token ahead removes this from the Step 1 critical path.
- The key we used is scoped. It lacks `user_read` (`/v1/user/subscription` → 401 `missing_permissions`) but still mints both token types. An STT-only key is enough for `api/stt`.
- Keys stay out of the bundle. Only `VITE_*` env vars reach client code, so `ELEVENLABS_API_KEY` in `.env.local` is never bundled. It must never get a `VITE_` prefix.

## Q3. CORS behavior

- **Preflight** (`OPTIONS`, `Origin: http://192.168.1.50:5173`, requesting `xi-api-key,content-type`) on `/v1/speech-to-text` and both token paths returns `HTTP 200` with:
  - `access-control-allow-origin: *`
  - `access-control-allow-headers: *`
  - `access-control-allow-methods: POST, PATCH, OPTIONS, DELETE, GET, PUT`
  - `access-control-max-age: 600`
- **Error responses carry the same headers.** A 401 without a key still has `access-control-allow-origin: *`, so the WebView can read error bodies and tell auth errors from network errors.
- **From Chrome at the LAN origin**, all four calls returned readable bodies (`results/browser.json` → `chromeNoKeyProbes`):
  - no auth: `401 "Neither authorization header nor xi-api-key received"`
  - fake key header: `401 "Invalid API key"` (the custom header passed preflight)
  - fake token: `403 "Token not found or has expired."`
  - token endpoint, no auth: `401`
- **WebSocket**: no Origin check. A fake token from the LAN origin opens the socket (117 ms), gets `{"message_type":"auth_error","error":"You must be authenticated to use this endpoint."}`, and closes with 1000.
- `*` also covers whatever origin the packaged `.ehpk` runs under, including `null`, because we send no credentials or cookies.
- Even's own whitelist is a separate gate (`build-and-deploy` skill). `app.json` needs a `network` permission listing ElevenLabs and our proxy host. **Open question:** does the whitelist match `wss://` by scheme, or by host only? I would list both `https://api.elevenlabs.io` and `wss://api.elevenlabs.io`. Verify on the device.

## Q4. Latency

### Q4a. Batch, single word (1.2-1.7 s clips, request start → JSON parsed, warm connection)

| Host / format | n | p50 | p95 | min | max | correct |
|---|---|---|---|---|---|---|
| `api.elevenlabs.io`, raw PCM (`pcm_s16le_16`) | 12 | **288** | **432** | 264 | 432 | 12/12 |
| `api.elevenlabs.io`, WAV | 12 | 313 | 504 | 290 | 504 | 12/12 |
| `api.us.elevenlabs.io`, raw PCM | 12 | **271** | **406** | 239 | 406 | 12/12 |
| `api.us.elevenlabs.io`, WAV | 12 | 338 | 650 | 295 | 650 | 12/12 |
| Chrome, LAN origin, token, raw PCM | 12 | 318 | 495 | 295 | 495 | 11/12 (Daniel's cup → "Huh?") |

Raw PCM is 25-65 ms faster at p50 than WAV and needs no wrapping. `api.us` is about 17 ms faster, which is within noise. Use the default host unless ORCH wants to pin US. Token mint, if not pre-minted, adds ~100 ms.

### Q4b. Realtime, single word (real-time-paced 100 ms chunks, commit on the last chunk)

| Run | n | session ready (p50) | final after commit p50 / p95 | correct |
|---|---|---|---|---|
| Node, `commit_strategy=manual` | 12 | 142 ms | **129 / 337** | 9/12 |
| Node, `commit_strategy=vad`, 0.5 s | 12 | 141 ms | 167 / 288 (after the clip's 600 ms trailing pad) | 9/12 |
| Chrome, LAN origin, manual | 12 | 140 ms | **92 / 185** | 10/12 |

No `partial_transcript` with text arrived for any single-word clip. Partials only showed up on longer speech.

### Q4c. Realtime, rolling conversation (Steps 2-3): 5-7 s sentences, VAD commits, word timestamps

| Clip | VAD | realtime text | batch text (same clip) | first partial | word lag p50 / p95 | commit after last word |
|---|---|---|---|---|---|---|
| conv-park | 0.5 s | "Yesterday, I went to the park with **Maya**. We sat by the, um, the water, and we had some coffee." | "...with **Mia**..." | 2226 ms | 817 / 1426 ms | 793 ms |
| conv-park | 1.0 s | same | | 2205 ms | 886 / 1407 ms | 1449 ms |
| conv-pharmacy | 0.5 s | "I need to call the pharmacy about my metformin. The doctor said I should take it with, uh, with food." | same | 2112 ms | 848 / 1632 ms | 751 ms |
| conv-pharmacy | 1.0 s | same | | 2271 ms | 853 / 1551 ms | 1334 ms |
| conv-stall | 0.5 s | "Can you pass me the, the, you know, the thing for soup?" | same | 2114 ms | 1030 / 1634 ms | 687 ms |
| conv-stall | 1.0 s | same | | 2216 ms | 1032 / 1736 ms | 1482 ms |

- **Word lag** is the time a partial containing the word arrives, minus the word's `end` timestamp.
- The first partial lands about 1.8-2.0 s after speech starts (speech starts at 0.3 s). After that, partials come roughly once a second.
- Commit time tracks the VAD setting: ~0.75 s at 0.5 s and ~1.4 s at 1.0 s. 0.8 s is a reasonable start. The SDK reference gives a 0.3-3.0 s range with a 1.5 s default.
- Fillers are kept ("um", "uh"). That is useful signal for T-301.

### Q4d. Session soak (Steps 2-3 idle screen)

Setup: one realtime session for **8 minutes** (`commit_strategy=vad`, 0.8 s). A 6.8 s sentence every 60 s, and the rest is -54 dBFS noise sent continuously in 100 ms chunks, like the idle `blank` screen with the mic open (`results/soak.json`).
- **No server close, no `warning`, no error messages.** The only close was our own at 480 s (code 1005, client-initiated). An 8-minute session is safe. The maximum session length isn't in the docs, so T-202 must still handle `session_time_limit_exceeded` and reconnect.
- **8/8 sentences committed**, each ~8 s after its speech started (≈1 s after it ended). The text was identical every time.
- **8 empty `committed_transcript` events** (`text: ""`), each ~35 s into the silence after a sentence: at 43, 103, 163, ... 463 s. **T-202 must drop empty commits** rather than emitting empty `Transcript`s.

## Q5. Slurred and partial words

Batch, `scribe_v2`, from `results/partial.json`. "Keyterm" means the target word was sent as the only keyterm. "Auto lang" means no `language_code` was sent.

| Clip | Said (TTS) | Target | Plain (`en`) | Keyterm = target | Auto lang | `no_verbatim` |
|---|---|---|---|---|---|---|
| cop | cop | cup | **Cough** | Cup | Cough [eng] | Cop |
| cop-daniel | cop | cup | **Hello.** (logprob -1.45) | Cup. | **好。 [zho]** | Cool. |
| tup | tup | cup | **Top** | Top | Top | Top |
| cuh | cuh | cup | **Car.** | Cup | Car. [**por**] | Car. |
| fo-fork | fo... fork | fork | **Faux fork** | Faux fork | Faux fork | Faux fork |
| fock | fock | fork | **Fog** | Fog | Fog | Fog |
| spoo | spoo | spoon | Spu | Spoon. | Spu | Spu |
| spoo-daniel | spoo | spoon | Spoo | Spoon | Spoo | Spoo |
| spun | spun | spoon | Spun | Spoon | Spun [**jav**] | Spun |
| medsin | medsin | medicine | **Medicine** | Medicine | Medicine | Medicine |
| medicine-slow | medicine (rate 70) | medicine | Medicine | Medicine | Medicine | Medicine |
| wa-er | wa er | water | **Why are** | Water | Wire. | Why are |
| kee | kee | keys | **Key** | Key. | Key | Key |
| met-fommin | met fommin | metformin | **Metformin** | Metformin | Metformin [**fra**] | Metformin |
| lie-sin-pril | lie sin oh pill | lisinopril | Lysino pill | Lisinopril | Lysino pill | Lysino Pill |
| um-cup | um... cup | cup | Um, cup | Um, cup | Um, cup | **Tom Cobb** |
| uh-the-fork | uh, the... the fork | fork | Ah, the, the fork | Ah, the, the fork | same | Ah, the fork |
| metformin (clean) | metformin | metformin | Metformin | Metformin | Metformin [**fra**] | Metformin |

What this shows:

1. **It often autocorrects to a real word.**
   - Mangled into a different word: cop→Cough, tup→Top, cuh→Car, fock→Fog, wa er→Why are.
   - "Fixed" into the target, which grades a mispronunciation as correct: medsin→Medicine, met fommin→Metformin, kee→Key.
   - It keeps some non-words: spoo→"Spu"/"Spoo", spun→"Spun". Both directions hurt Step 1: false negatives for near-misses and false positives for slurred attempts.
2. **A partial attempt survives as its own word, often respelled**: "fo... fork" → "Faux fork". T-103's "target contained in a multi-word transcript" rule handles this.
3. **Fillers are verbatim by default** ("Um, cup", "Ah, the, the fork"). `no_verbatim=true` strips them but garbled one clip ("um... cup" → "Tom Cobb"). Keep verbatim and strip fillers in the matcher.
4. **Auto language detection misfires on short clips**: French, Portuguese, Javanese, and Chinese "好。" for an English "cop". **Always send `language_code=en`.**
5. **Very short clips can hallucinate.** Daniel's 331 ms "cop" → "Hello.". Daniel's "cup" → "Cup" in 4/4 Node runs but "Huh?" once from Chrome on identical bytes. That is nondeterministic below ~400 ms of speech.
6. **Logprob can't flag autocorrection.** Wrong outputs scored ~0.00 (tup→Top, fock→Fog, medsin→Medicine), while a correct "Cup" scored -0.43. Only the hallucination stood out (-1.45). A cut at logprob < -1.0 could drop hallucinations, but it can't detect "fixed" words.
7. **Output has case and punctuation** ("Cup.", "Car.", "Spoon."). The matcher must normalize; T-103 already plans to.

## Q6. Does it accept biasing toward a target word?

**Yes, and it pulls hard.**

- **Batch:** `keyterms` as **repeated multipart fields** (`keyterms=cup`, `keyterms=spoon`) → 200. A JSON-array string is rejected: `400 {"detail":{... "message":"Some keyword contains invalid characters","status":"invalid_keyword","param":"keywords"}}` (`results/keyterm-encoding.json`).
  - Limits: 1000 terms, 50 chars each, at most 5 words; no `< > { } [ ] \`.
  - The API reference says keyterms add a **20% surcharge**.
- **Realtime:** repeated `keyterms=` query parameters. Limits: 50 terms, 20 chars each.
- **Effect, batch:** with the target as the keyterm, 7 of 17 off-target clips came back as the target: cop→Cup, cop-daniel→Cup, cuh→Cup, spoo→Spoon, spun→Spoon, wa er→Water, lie sin oh pill→Lisinopril. It did not move tup→Top, fock→Fog, or "fo... fork". With keyterms `[cup, spoon]`, "cop" → "Cup".
- **Effect, realtime** (`results/realtime-keyterms.json`):

  | Said | Plain | Keyterm |
  |---|---|---|
  | cup | Car. | Cup. |
  | cop | Car. | Cup. |
  | cuh | Car. | Cup. |
  | spoo | Spoo. | Spoon. |
  | spun | Spon. | Spoon. |
  | wa er | Water. | Water. |
  | fork | Fork. | Fork. |

  It also repaired a real miss (a correct "cup" heard as "Car.").

**What this means:**

- **Step 1 grading:** sending the target makes grading lenient. "spun", "cuh", and "cop" would be marked correct. Batch without keyterms already got every clean word right (12/12), so keyterms mostly add false positives there.
  - **Default:** T-104 ignores `targetHint`.
  - Optional lenient mode: send it only when matcher strictness is 0. **ORCH/clinical decision.**
  - Alternative: make two parallel calls, with and without the keyterm. Show "✓" if plain matches and "close" if only the keyterm call matches. That is about 2.2x the cost, and latency is still ~300 ms.
- **Steps 2-3:** send the personal bank (names, meds, places, ≤50 terms of ≤20 chars) as realtime keyterms. A false positive there is cheap, and it fixes names ("Maya", not "Mia"; "Lisinopril", not "Lysino pill").
  - Caution for T-204: "if STT hears the target, clear the display". Biasing toward candidate words would make that fire falsely. Don't put the current candidates in the keyterms.

---

## Integration notes for T-104 / T-202

**`transcribeUtterance` (T-104)**
- Record from the SDK `audioEvent` with local energy VAD until `endSilenceMs` after speech, or `maxMs`.
- Send the PCM as-is: a `Blob` of the concatenated `Uint8Array`s, `file_format=pcm_s16le_16`, `model_id=scribe_v2`, `language_code=en`.
- Pre-mint the next `batch_scribe` token while the prompt is on screen. Tokens are single-use and live 15 minutes.
- Use an `AbortController` with a ~4 s timeout → `error: 'timeout'`. A thrown `fetch` (TypeError) → `'network'`. HTTP 401/403 → `'unknown'`, logged. Empty text → `'no-speech'`.
- Expect end-of-recording → text p50 ~300 ms, p95 ~500 ms, so ~1.5 s from end of speech with `endSilenceMs=1200`.

**Rolling (T-202)**
- One WebSocket per mode session, opened on `start()`. Send every audio buffer as `{message_type:'input_audio_chunk', audio_base_64, commit:false, sample_rate:16000}`.
- Map `partial_transcript` → `Transcript{isFinal:false}`, and `committed_transcript_with_timestamps` → `isFinal:true` with word times. Drop commits with empty text: VAD sends one every ~35 s of silence (Q4d).
- Base `onSpeechState` on local VAD.
- On `close`, `error`, or any error `message_type` (`session_time_limit_exceeded`, `quota_exceeded`, `rate_limited`, ...): mint a new token, reopen, and send `previous_text` (the last ~200 chars) on the first chunk. Per the API reference, it's valid only there.
- Fallback per PLAN §9 if the Even whitelist blocks `wss`: VAD-segmented chunks to batch, ~300 ms after each segment.

**WebView mic**
- `getUserMedia` is unavailable on a plain-`http` LAN origin (`isSecureContext=false`, `navigator.mediaDevices` undefined in Chrome).
- The app must take audio from the SDK `audioEvent`, as planned. Don't plan on `getUserMedia` as a fallback.

## `api/stt` spec (derived)

- `POST /api/stt/token`, body `{"type":"batch_scribe"|"realtime_scribe"}` → `{"token":"sutkn_..."}`. It calls `POST https://api.elevenlabs.io/v1/single-use-token/<type>` with `xi-api-key: $ELEVENLABS_API_KEY` from the hosting provider's env.
- Origin allow-list (the app origin plus the LAN dev origins), and a small per-IP rate limit (for example 60/min). Never log the key or tokens. Return 502 `{error}` when minting fails.
- No audio handling, no request bodies over a few bytes.
- Reference implementation: `spikes/stt/token-server.mjs`.

## `app.json` (ORCH-owned), needed when T-104 lands

- `network` permission whitelist: `https://api.elevenlabs.io`, `wss://api.elevenlabs.io` (verify scheme matching on the device), and the `api/` host.
- `g2-microphone` or `phone-microphone`, whichever S-3 picks.

## Not tested / open

1. **The Even app on the real G2/phone.** QR prototype mode is broken on Even's side (`docs/BETA_RESULTS.md`), so the device only runs packaged builds. A packaged page's origin isn't the laptop, and packaged builds enforce `app.json` permissions. So the real on-device check is **the first packaged T-104 build**, with three pieces:
   - `api/stt` deployed (hosted, HTTPS).
   - The `network` whitelist below.
   - A batch call plus a realtime WebSocket from the phone.

   The biggest device risk this spike couldn't close: **does the Even whitelist allow `wss://api.elevenlabs.io`?** If not, Steps 2-3 use the chunked-batch fallback.

   To check earlier, pack this page with `?auto=1&tokenUrl=https://<hosted api/stt>` (README → "Packaging a spike page"). It renders `AUTO batch` / `AUTO realtime` lines on the phone page.
2. **Real human and aphasic speech.** TTS only so far. On desktop, open `http://localhost:5173/spikes/stt/index.html`, hold the record button, and say "cop", "fo... fork", "spoo", or a mumbled "medicine", with and without keyterms. The clinical-realism caveat stays until a real user tries it.
3. **Glasses-mic audio.** Gain and noise at conversation distance may change accuracy. That is S-3.
4. **Pricing.** Not measured. The 20% keyterm surcharge is from the API reference.

## Changes to PLAN.md

- §5 / `api/`: the STT side of `api/` only mints tokens. No audio proxy (smaller, cheaper, and keeps "audio is never stored" trivially true on our side).
- §3: "Streaming if the spike says it works from the WebView": **it works** in Chrome and in the Even simulator's WebKit WebView. Steps 2-3 use realtime. The packaged-build check (`wss` whitelist) is still open, so T-202 keeps the chunked-batch fallback ready.
- T-104: force `language_code=en`, and ignore `targetHint` by default (lenient mode is an ORCH decision). T-202: speech state from local VAD; reconnect with a fresh token and `previous_text`.
- `app.json` needs the network whitelist above. That's an ORCH edit when T-104 merges.

## Reproduce

```
# key: ELEVENLABS_API_KEY=sk_... in .env.local at the repo root (gitignored; the last non-empty line wins)
node spikes/stt/check-key.mjs                   # any OS, no audio: key, both tokens, batch, realtime (Node 22+)
node spikes/stt/make-clips.mjs                  # macOS only (`say`); writes clips/ (gitignored)
node spikes/stt/bench.mjs keyterm-encoding|latency|partial|token|realtime|realtime-keyterms|rolling|soak
node spikes/stt/token-server.mjs                # :8787, for the browser page
npm run dev                                     # then /spikes/stt/index.html
```

## Sources

- Batch API: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
- Realtime WebSocket API: https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
- Single-use tokens: https://elevenlabs.io/docs/api-reference/tokens/create
- Client-side streaming guide: https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming
- Keyterm prompting: https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/batch/keyterm-prompting
- STT overview (models, keyterm limits): https://elevenlabs.io/docs/capabilities/speech-to-text
- VAD silence range 0.3-3.0 s, default 1.5 s: https://elevenlabs.io/docs/eleven-api/resources/libraries/scribe-stt/react-scribe/llms.txt
- Even CORS and whitelist rules: `docs/vendor/even-skills/build-and-deploy/SKILL.md`. Audio format: `docs/vendor/even-skills/device-features/SKILL.md`
