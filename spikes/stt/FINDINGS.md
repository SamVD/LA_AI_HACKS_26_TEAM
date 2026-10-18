# S-1 Findings: ElevenLabs Scribe from the WebView

_Status: PARTIAL, Sat Oct 17 2026, AI lane. Doc-backed answers and the CORS measurement are done. Latency and accuracy numbers are pending a run of `bench.mjs` with an `ELEVENLABS_API_KEY`._

## How to finish this spike

```sh
ELEVENLABS_API_KEY=... node spikes/stt/bench.mjs            # tokens, CORS, TTS clips, batch, realtime -> results.json
ELEVENLABS_API_KEY=... node spikes/stt/bench.mjs --tokens   # fresh tokens for browser-check.html
python3 -m http.server -d spikes/stt 5173                   # then open /browser-check.html (desktop, then via `evenhub qr --url` in the Even app)
```

Optional real recordings (strongly recommended for Q5): 16 kHz mono 16-bit WAVs named `<spoken>__<target>.wav` (for example `cop__cup.wav`), passed as `--clip file.wav`. Do not commit them. `.gitignore` here excludes `*.wav`, `*.pcm`, `.out/`.

The synthetic clips are clean TTS. They test how Scribe handles **non-words**, not how it handles **aphasic acoustics**. Treat Q5 as provisional until someone records real attempts.

## Answers

### 1. Batch vs realtime: which works from a browser WebView?
**Both, on paper. Browser-level proof is pending.**
- Batch: `POST https://api.elevenlabs.io/v1/speech-to-text`, multipart, `model_id=scribe_v2`. Accepts `file_format=pcm_s16le_16`, so the G2's PCM (16 kHz mono s16le) can be sent **raw, with no WAV wrapping**. The docs say this gives lower latency. `bench.mjs` compares `pcm` and `wav`.
- Realtime: `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000&commit_strategy=manual|vad|turn_prediction`. The client sends `{message_type:"input_audio_chunk", audio_base_64, commit, sample_rate}`. The server sends `session_started`, `partial_transcript`, `committed_transcript`, and error types. Also available: `vad_silence_threshold_secs`, `min_silence_duration_ms`, and `include_timestamps`.
- Plain `WebSocket` and `fetch` are enough. No SDK is needed in the bundle.

### 2. Does it need a server-minted token?
**Yes. That makes `api/stt/token` the only server piece STT needs.**
`POST /v1/single-use-token/{realtime_scribe|batch_scribe}` with `xi-api-key` returns `{token}`. Each token lasts 15 minutes and works once. Batch and realtime both take it as `?token=`. The key must never ship in the bundle.
- Because tokens are single-use, **Step 1 needs one token per utterance**. To avoid a round trip on each prompt, `src/audio` should prefetch the next token while the user is still looking at the prompt.
- Audio does **not** need to go through our proxy. The proxy only mints tokens, so the audio path adds no extra hop.

### 3. CORS behaviour (measured, Oct 17)
**CORS will not block us.** Preflight from `Origin: http://localhost:5173`:

| Request | Status | `Access-Control-Allow-Origin` | `-Allow-Headers` |
|---|---|---|---|
| OPTIONS batch STT, `xi-api-key` header | 200 | `*` | `*` |
| OPTIONS batch STT, token in query | 200 | `*` | `*` |
| OPTIONS token mint | 200 | `*` | `*` |
| POST batch STT (bogus token, empty body) | 422 | `*` | |

The error response also carries `ACAO: *`, so the browser can read error bodies. The token endpoint is open too, which is exactly why minting must happen server-side: the API allows it, but calling it from the client would expose the key. **Still to confirm:** the Even app WebView may impose its own network policy, and `app.json` network permissions may need `api.elevenlabs.io`. `browser-check.html` loaded via QR answers this.

### 4. Latency for a 1-3 s single-word clip
**PENDING** (`results.json` → `summary`). Targets that matter for the plan:
- Step 1: end of speech → check/X within about 1.5 s total. That is 1.2 s `endSilenceMs` plus the STT round trip, so the batch p50 needs to be at most ~700 ms to feel responsive. If it isn't, cut `endSilenceMs` or use realtime with a manual commit.
- Steps 2-3: realtime commit latency after the last chunk.

| Variant | p50 ms | p95 ms |
|---|---|---|
| batch pcm | pending | pending |
| batch wav | pending | pending |
| batch pcm + keyterm | pending | pending |
| batch pcm + token (incl. mint) | pending | pending |
| realtime commit | pending | pending |

### 5. Slurred or partial words: does it autocorrect to a real word?
**PENDING.** The test set is `cop`, `tup`, `cuh`, `c... c... cup`, `um... cup`, `spoo`, `toofbrush`, `met for man`, `metformin`, `Maya`, plus one sentence. For each clip, `results.json` records the text heard, per-word logprob, and whether the target appeared, both with and without keyterms. What to look for:
- Autocorrecting "cop" to "cup" with no keyterm would be good for Step 1 leniency, but it would also hide real errors. The matcher's strictness setting (T-103) is the control for that.
- A low `logprob` on a word could serve as an "unsure" signal for Step 4 (backlog).

### 6. Biasing toward a target word
**Yes, documented.** `keyterms` exists on batch (up to 1000 terms, each under 50 characters and at most 5 words, at a **20% surcharge**) and on realtime (`keyterms` query parameter). `bench.mjs` runs every clip with and without `keyterms=[target]`.
- Risk: biasing could turn a wrong attempt ("tup") into the target ("cup") and give false checks in Step 1. **The pending data decides whether Step 1 sends `targetHint` as a keyterm.** For Steps 2-3, sending the personal bank's names and medications as keyterms is low-risk and likely helps.

## Recommendation (provisional, revisit after the run)

- **Step 1 (utterance):** use batch `scribe_v2` with raw `pcm_s16le_16`, a prefetched `batch_scribe` token, `language_code=en`, and `tag_audio_events=false`. Our own energy VAD ends the utterance. Keyterm use depends on Q5/Q6.
  - Fallback: realtime with `commit_strategy=manual`, committing at our own VAD end-of-speech. This may cut latency, because audio streams up while the user is still speaking.
- **Steps 2-3 (rolling):** use realtime `scribe_v2_realtime` over one WebSocket per session with `commit_strategy=vad` and personal-bank names/medications as keyterms. Committed transcripts feed `onTranscript(isFinal: true)` and partials feed `isFinal: false`. We keep our own energy VAD for `onSpeechState`, because stall timing must not wait on the network. Plan reconnects: one token per connection, and a new token each time.
- **`api/`:** one tiny endpoint, `POST /api/stt/token?type=batch|realtime`, that returns `{token}`. It holds `ELEVENLABS_API_KEY`, has an origin allow-list, and is rate-limited. No audio passes through it.
- **For PLAN.md (ORCH):** the "CORS needs a proxy" premise in Section 1 is false for ElevenLabs. The proxy exists for key secrecy only. It still needs to be hosted where the packaged Beta build can reach it.
