import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import { createElevenLabsStt } from './audio'
import type { SttService } from './core/types'
import { readFlags } from './config'
import { builtinBank, getImage } from './content'
import { createBridgeKeyValue, createHubBridge, startApp } from './glasses'
import { createGallery } from './glasses/gallery'
import { MockPredictor, MockStt } from './mocks'
import { modes } from './modes'
import { mountCompanion } from './phone'
import { createStore } from './store'

const log = (event: string, data?: unknown) => console.log('[nudge]', event, data ?? '')

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

// Real STT (T-104): the glasses mic and ElevenLabs batch STT, with single-use tokens
// from api/stt (set VITE_STT_TOKEN_URL at pack time; see src/audio/index.ts). It is
// created on the first mode start, after the startup page exists (the glasses mic
// needs it), and shared across modes. `?svc=mock` keeps the scripted MockStt.
// Prediction (T-201) is wired with T-201 part 2 and T-203.
let realStt: SttService | undefined
const sttForMode = (): SttService =>
  flags.mockServices ? new MockStt() : (realStt ??= createElevenLabsStt(bridge, { now: Date.now, log }))

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
    predictor: new MockPredictor(),
    store,
    now: Date.now,
    log,
    flags,
  }),
  log,
})

const root = document.getElementById('app')
if (root) mountCompanion(root, shell)
