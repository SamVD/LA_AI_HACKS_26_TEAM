import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { WordEntry } from './core/types'
import { readFlags } from './config'
import words from './content/words.json'
import { createHubBridge, startApp } from './glasses'
import { createGallery } from './glasses/gallery'
import { MemoryStore, MockPredictor, MockStt } from './mocks'
import { modes } from './modes'
import { mountCompanion } from './phone'

const log = (event: string, data?: unknown) => console.log('[nudge]', event, data ?? '')

const bridge = await waitForEvenAppBridge()
const hub = createHubBridge(bridge, log)
const flags = readFlags()
// Real STT (T-104), prediction (T-201) and the persistent Store (T-106, over
// createBridgeKeyValue) replace these mocks when they merge. Pictures arrive
// with T-106's getImage; until then the glasses render text-only.
const store = new MemoryStore(words as WordEntry[])

// `?gallery=1`, or VITE_GALLERY=1 at build time for a packaged device build:
// Step 1 becomes a walk through every Screen kind (dev check).
const gallery = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).has('gallery')
  || (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.VITE_GALLERY === '1'

const { shell } = await startApp({
  hub,
  modes: gallery ? { ...modes, step1: createGallery() } : modes,
  flags,
  store,
  makeContext: ({ ui, leave }) => ({
    ui,
    leave,
    stt: new MockStt(),
    predictor: new MockPredictor(),
    store,
    now: Date.now,
    log,
    flags,
  }),
  log,
})

// index.html's #app is the template's centered placeholder ("Companion app is
// running"), and its flex styles squash the companion UI, so mount on a fresh
// element that replaces it.
const placeholder = document.getElementById('app')
if (placeholder) {
  const root = document.createElement('div')
  placeholder.replaceWith(root)
  mountCompanion(root, shell)
}
