import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { createPredictor } from './ai/predictor'
import { createRollingStt, personalKeyterms } from './audio/rolling'
import type { PredictorService, SttService } from './core/types'
import { readFlags } from './config'
import { builtinBank, getImage, resolveAssets } from './content'
import { createBridgeKeyValue, createHubBridge, startApp } from './glasses'
import { createGallery } from './glasses/gallery'
import { MockPredictor, MockStt } from './mocks'
import { modes } from './modes'
import { mountCompanion } from './phone'
import { createStore } from './store'
import { eventLog } from './debug/eventLog'

// Every log line also goes to the in-memory pipeline log (T-315), which the phone
// companion can export as JSON from a device session.
const log = (event: string, data?: unknown) => {
  console.log('[nudge]', event, data ?? '')
  eventLog.record(event, data)
}

const bridge = await waitForEvenAppBridge()
const hub = createHubBridge(bridge, log)
const flags = readFlags()
// On-device word bank and sessions, persisted through the SDK's local storage
// (debounced; the lifecycle flushes it when the phone page is hidden).
const store = createStore(createBridgeKeyValue(hub), builtinBank())

// `?gallery=1`, or VITE_GALLERY=1 at build time for a packaged device build:
// Step 1 becomes a walk through every Screen kind (dev check).
const gallery = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).has('gallery')
  || (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.VITE_GALLERY === '1'

// Real STT: the glasses mic with ElevenLabs batch STT for Step 1 (T-104) and the
// realtime rolling transcript for Steps 2-3 (T-202), using single-use tokens from
// api/stt (VITE_STT_TOKEN_URL, set for packaged builds in .env.production). Realtime
// keyterms are the personal bank's names, medications and places (D2). It is created
// on the first mode start, after the startup page exists (the glasses mic needs it),
// and shared across modes. `?svc=mock` keeps the scripted MockStt.
let realStt: SttService | undefined
const sttForMode = (): SttService =>
  flags.mockServices
    ? new MockStt()
    : (realStt ??= createRollingStt(bridge, {
      now: Date.now,
      log,
      keyterms: async () => personalKeyterms(await store.getBank()),
      // T-314: -20 dB splits wearer (-9..-15) from partner (-24..-30); off unless flagged on.
      speakerSplitDb: (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.VITE_SPEAKER_GATE === '1' ? -20 : undefined,
    }))

// Prediction (T-201 + T-203): the Gemini proxy at VITE_PREDICT_URL (set for packaged
// builds in .env.production). Without it, the predictor runs bank-only (fallback v2).
// Timeout 2 s (G3b, #134: model median ~1.0 s + network missed 1.5 s on 15% of calls);
// sample bank entries never reach the model (PREDICTOR_PROMPT §4: "Who's Maya?"). One
// shared instance, so suggestion history and the 429 cooldown span modes. Step 2 wraps
// it in the shared throttle (D11). `?svc=mock` keeps the canned MockPredictor.
const predictUrl = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.VITE_PREDICT_URL
let realPredictor: PredictorService | undefined
const predictorForMode = (): PredictorService =>
  flags.mockServices
    ? new MockPredictor()
    : (realPredictor ??= createPredictor({
        endpoint: typeof predictUrl === 'string' && predictUrl ? predictUrl : undefined,
        timeoutMs: 2000,
        dropSamples: true,
        now: Date.now,
        log,
        resolveAssets,
      }))

const { shell } = await startApp({
  hub,
  modes: gallery ? { ...modes, step1: createGallery() } : modes,
  flags,
  store,
  images: getImage,
  makeContext: ({ ui, leave }) => ({
    ui,
    leave,
    stt: sttForMode(),
    predictor: predictorForMode(),
    store,
    now: Date.now,
    log,
    flags,
  }),
  log,
})

const root = document.getElementById('app')
if (root) mountCompanion(root, shell)
