// S-3 device probe. A throwaway app for answering the five on-device questions in
// TASKS.md S-3. Never imported by src/. Results show on the glasses and, in full,
// on the phone page (#results), and the event log persists through the SDK's
// local storage so it survives the phone locking or the WebView being swapped.
import {
  waitForEvenAppBridge,
  AudioInputSource,
  CreateStartUpPageContainer,
  ImuReportPace,
  ListContainerProperty,
  ListItemContainerProperty,
  OsEventTypeList,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import { clipStats, concatPcm, formatStats, toWav, type Chunk } from './audio'

const LOG_KEY = 'nudge.s3.log'
const MENU = ['1 Glasses mic 10s', '2 Phone mic 10s', '3 IMU head moves', '4 Blank screen taps', '5 Lock test (mic on)', '6 Results']

const bridge = await waitForEvenAppBridge()
const t0 = Date.now()
const since = () => ((Date.now() - t0) / 1000).toFixed(1)

// ---- Phone page -------------------------------------------------------------

const $ = (id: string) => document.getElementById(id)!
const results: string[] = []
function note(line: string) {
  results.push(line)
  const li = document.createElement('li')
  li.textContent = line
  $('results').appendChild(li)
  console.log('[s3]', line)
}
function phoneStatus(text: string) { $('status').textContent = text }
setInterval(() => { $('clock').textContent = `page alive ${since()} s, visible=${document.visibilityState}` }, 500)

// ---- Persistent event log (survives lock / WebView swap) ----------------------

interface LogEntry { at: string; ev: string }
let log: LogEntry[] = []
let logDirty = false
function logEvent(ev: string) {
  log.push({ at: new Date().toISOString().slice(11, 23), ev })
  logDirty = true
  const li = document.createElement('li')
  li.textContent = `${log.at(-1)!.at} ${ev}`
  $('log').appendChild(li)
}

// ---- Serialized bridge calls ---------------------------------------------------
// The docs warn that concurrent bridge calls can drop the connection, and one bad
// BLE hop can hang ~30 s, so every call goes through one queue with a timeout.

let queue: Promise<unknown> = Promise.resolve()
function call<T>(name: string, fn: () => Promise<T>, ms = 5000): Promise<T | undefined> {
  const run = () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const started = Date.now()
    return Promise.race([
      fn().then(value => {
        const took = Date.now() - started
        if (took > 1000) logEvent(`slow: ${name} took ${took} ms`)
        return value
      }),
      new Promise<undefined>(resolve => { timer = setTimeout(() => { logEvent(`timeout: ${name} > ${ms} ms`); resolve(undefined) }, ms) }),
    ]).finally(() => clearTimeout(timer))
  }
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next.catch(err => { logEvent(`error: ${name}: ${String(err)}`); return undefined })
}

// Storage timings go to their own line on the phone page, not the log: logging them
// would mark the log dirty and trigger another write forever.
const storage = { writes: 0, ok: 0, failed: 0, maxMs: 0 }
setInterval(() => {
  if (!logDirty) return
  logDirty = false
  const started = Date.now()
  storage.writes++
  void bridge.setLocalStorage(LOG_KEY, JSON.stringify(log.slice(-200))).then(
    ok => { if (ok) storage.ok++; else storage.failed++ },
    () => { storage.failed++ },
  ).finally(() => {
    storage.maxMs = Math.max(storage.maxMs, Date.now() - started)
    $('storage').textContent = `SDK setLocalStorage: ${storage.writes} writes, ${storage.ok} ok, ${storage.failed} failed, slowest ${storage.maxMs} ms`
  })
}, 3000)

// ---- Glasses pages -------------------------------------------------------------

const text = (content: string) => new TextContainerProperty({
  xPosition: 0, yPosition: 0, width: 576, height: 288,
  borderWidth: 0, borderColor: 5, paddingLength: 4,
  containerID: 1, containerName: 'probe', content, isEventCapture: 1,
})
const menuList = () => new ListContainerProperty({
  xPosition: 0, yPosition: 0, width: 576, height: 288,
  borderWidth: 0, borderColor: 5, paddingLength: 4,
  containerID: 2, containerName: 'menu', isEventCapture: 1,
  itemContainer: new ListItemContainerProperty({ itemCount: MENU.length, itemWidth: 0, isItemSelectBorderEn: 1, itemName: MENU }),
})

type Page = 'menu' | 'text'
let page: Page = 'menu'
async function showMenu() {
  page = 'menu'
  await call('rebuild menu', () => bridge.rebuildPageContainer(new RebuildPageContainer({ containerTotalNum: 1, listObject: [menuList()] })))
  phoneStatus('Menu on glasses. Swipe to pick a test, tap to run.')
}
async function showText(content: string) {
  page = 'text'
  await call('rebuild text', () => bridge.rebuildPageContainer(new RebuildPageContainer({ containerTotalNum: 1, textObject: [text(content)] })))
}
async function updateText(content: string) {
  if (page !== 'text') return
  await call('upgrade text', () => bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: 1, containerName: 'probe', contentOffset: 0, contentLength: 0, content,
  })))
}

// ---- Input -----------------------------------------------------------------------

type Handler = { tap?: () => void; swipe?: (dir: 'up' | 'down') => void; imu?: (x: number, y: number, z: number) => void; audio?: (pcm: Uint8Array, source: string) => void }
let handler: Handler = {}
let tapWaiter: (() => void) | null = null
const waitTap = () => new Promise<void>(resolve => { tapWaiter = resolve })
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Keep in sync with the template's routing notes: clicks arrive as sysEvent with
// eventType undefined (protobuf drops the 0); swipes arrive as textEvent.
bridge.onEvenHubEvent((event: EvenHubEvent) => {
  if (event.audioEvent) { handler.audio?.(event.audioEvent.audioPcm, String(event.audioEvent.source)); return }

  const sys = event.sysEvent
  if (sys?.imuData && sys.eventType === OsEventTypeList.IMU_DATA_REPORT) {
    handler.imu?.(sys.imuData.x ?? 0, sys.imuData.y ?? 0, sys.imuData.z ?? 0)
    return
  }
  if (event.listEvent) {
    const i = event.listEvent.currentSelectItemIndex ?? 0
    if (page === 'menu') void runTest(i)
    return
  }
  if (event.textEvent) {
    const t = event.textEvent.eventType
    if (t === OsEventTypeList.SCROLL_TOP_EVENT) handler.swipe?.('up')
    if (t === OsEventTypeList.SCROLL_BOTTOM_EVENT) handler.swipe?.('down')
    return
  }
  if (!sys) return
  const type = sys.eventType ?? OsEventTypeList.CLICK_EVENT
  switch (type) {
    case OsEventTypeList.CLICK_EVENT:
      handler.tap?.()
      if (tapWaiter) { const w = tapWaiter; tapWaiter = null; w() }
      break
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      logEvent('double tap -> exit dialog')
      void stopHardware().then(() => bridge.shutDownPageContainer(1))
      break
    case OsEventTypeList.FOREGROUND_EXIT_EVENT: logEvent('FOREGROUND_EXIT (phone app backgrounded / locked)'); break
    case OsEventTypeList.FOREGROUND_ENTER_EVENT: logEvent('FOREGROUND_ENTER'); break
    case OsEventTypeList.ABNORMAL_EXIT_EVENT: logEvent('ABNORMAL_EXIT'); break
    case OsEventTypeList.SYSTEM_EXIT_EVENT: logEvent('SYSTEM_EXIT'); void stopHardware(); break
  }
})
document.addEventListener('visibilitychange', () => logEvent(`page visibility: ${document.visibilityState}`))
window.addEventListener('pagehide', () => logEvent('pagehide'))
window.addEventListener('beforeunload', () => { void stopHardware() })

let micOn = false
let imuOn = false
async function stopHardware() {
  if (micOn) { micOn = false; await call('audio off', () => bridge.audioControl(false)) }
  if (imuOn) { imuOn = false; await call('imu off', () => bridge.imuControl(false)) }
  handler = {}
}

// ---- Tests -------------------------------------------------------------------------

let busy = false
async function runTest(i: number) {
  if (busy) return
  busy = true
  try {
    if (i === 0) await micTest(AudioInputSource.Glasses, 'glasses')
    else if (i === 1) await micTest(AudioInputSource.Phone, 'phone')
    else if (i === 2) await imuTest()
    else if (i === 3) await blankTest()
    else if (i === 4) await lockTest()
    else await showResults()
  } catch (err) {
    logEvent(`test ${i + 1} failed: ${String(err)}`)
    await stopHardware()
  } finally {
    busy = false
    await showMenu()
  }
}

async function micTest(source: AudioInputSource, label: string) {
  logEvent(`mic test start: ${label}`)
  await showText(`${label.toUpperCase()} MIC, 10 s\n\nStay SILENT for the first 3 s.\nThen have someone ~1 m away talk normally.\n\nStarting...`)
  const parts: Uint8Array[] = []
  const chunks: Chunk[] = []
  const sources = new Set<string>()
  handler = { audio: (pcm, src) => { parts.push(pcm.slice()); chunks.push({ tMs: Date.now(), bytes: pcm.byteLength }); sources.add(src) } }
  let ok = await call(`audio on ${label}`, () => bridge.audioControl(true, source))
  logEvent(`audioControl(true, ${label}) -> ${String(ok)}`)
  if (!ok) {
    // On the G2 the phone mic failed right after a glasses-mic session; check whether a pause fixes it.
    await sleep(1500)
    ok = await call(`audio on ${label} retry`, () => bridge.audioControl(true, source))
    logEvent(`retry after 1.5 s: audioControl(true, ${label}) -> ${String(ok)}`)
  }
  micOn = true
  for (let s = 10; s > 0; s--) {
    await updateText(`${label.toUpperCase()} MIC  ${s} s left\n${s > 7 ? 'Stay silent...' : 'Talk now (someone ~1 m away)'}\nchunks so far: ${chunks.length}`)
    await sleep(1000)
  }
  await stopHardware()
  const samples = concatPcm(parts)
  if (samples.length === 0) {
    note(`${label} mic: NO AUDIO received (audioControl returned ${String(ok)}). Permission missing or source unsupported?`)
  } else {
    const stats = clipStats(samples, chunks)
    note(`${formatStats(`${label} mic`, stats)}; event source(s): ${[...sources].join(',')}`)
    addClip(label, toWav(samples))
  }
  await showText(`${results.at(-1)}\n\nTap to return.`)
  await waitTap()
}

function addClip(label: string, wav: Uint8Array) {
  const url = URL.createObjectURL(new Blob([wav as BlobPart], { type: 'audio/wav' }))
  const row = document.createElement('div')
  row.innerHTML = `<strong>${label} mic</strong> <audio controls src="${url}"></audio> <a href="${url}" download="s3-${label}.wav">download</a>`
  $('clips').appendChild(row)
}

async function imuTest() {
  const phases = ['HOLD STILL, look straight', 'NOD LEFT (tilt head to left shoulder)', 'NOD RIGHT (tilt to right shoulder)', 'LOOK UP', 'LOOK DOWN']
  const rows: string[] = ['phase,t_ms,x,y,z']
  let phase = 0
  let last = { x: 0, y: 0, z: 0 }
  const per = phases.map(() => ({ n: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], sum: [0, 0, 0] }))
  handler = {
    imu: (x, y, z) => {
      last = { x, y, z }
      rows.push(`${phase},${Date.now() - t0},${x},${y},${z}`)
      const p = per[phase]
      p.n++
      ;[x, y, z].forEach((v, k) => { p.min[k] = Math.min(p.min[k], v); p.max[k] = Math.max(p.max[k], v); p.sum[k] += v })
    },
  }
  await showText('IMU test\n\nFollow the prompts. Hold each pose until the next one.\n\nStarting...')
  const ok = await call('imu on', () => bridge.imuControl(true, ImuReportPace.P100))
  imuOn = true
  logEvent(`imuControl(true, P100) -> ${String(ok)}`)
  for (phase = 0; phase < phases.length; phase++) {
    for (let s = 4; s > 0; s--) {
      await updateText(`${phases[phase]}\n${s} s\n\nx ${last.x.toFixed(2)}  y ${last.y.toFixed(2)}  z ${last.z.toFixed(2)}\nsamples: ${rows.length - 1}`)
      await sleep(1000)
    }
  }
  phase = phases.length - 1
  await stopHardware()
  const f = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '-')
  const summary = per.map((p, i) => {
    const mean = p.sum.map(v => (p.n ? v / p.n : NaN))
    return `${['still', 'left', 'right', 'up', 'down'][i]}: n=${p.n} mean ${mean.map(f).join('/')} range x ${f(p.min[0])}..${f(p.max[0])} y ${f(p.min[1])}..${f(p.max[1])} z ${f(p.min[2])}..${f(p.max[2])}`
  })
  summary.forEach(line => note(`IMU ${line}`))
  ;($('imu') as HTMLTextAreaElement).value = rows.join('\n')
  await showText(`IMU (mean x/y/z per pose)\n${summary.map(s => s.split(' range')[0]).join('\n')}\n\nTap to return.`)
  await waitTap()
}

async function blankTest() {
  await showText('BLANK TEST\n\nThe screen goes empty for 15 s.\nSingle-tap and swipe a few times during it.\nDo NOT double-tap.\n\nTap to start.')
  await waitTap()
  let taps = 0
  let swipes = 0
  handler = { tap: () => { taps++ }, swipe: () => { swipes++ } }
  await showText(' ')
  logEvent('blank screen shown')
  await sleep(15000)
  handler = {}
  note(`Blank screen (single-space text container, isEventCapture=1): ${taps} taps, ${swipes} swipes received in 15 s`)
  await showText(`${results.at(-1)}\n\nDid the display look fully empty? Note it on the phone.\nTap to return.`)
  await waitTap()
}

async function lockTest() {
  const chunks: number[] = []
  handler = { audio: () => { chunks.push(Date.now()) } }
  const ok = await call('audio on lock', () => bridge.audioControl(true, AudioInputSource.Glasses))
  micOn = true
  logEvent(`lock test start; audioControl -> ${String(ok)}`)
  const started = Date.now()
  await showText('LOCK TEST (glasses mic on)\n\n1. Lock the phone now.\n2. Wait 1 min, then 5 min next time.\n3. Unlock, reopen the Even app.\n4. Tap the glasses to finish.')
  let gapsOver1s = 0
  let maxGap = 0
  let lastLogged = 0
  const ticker = setInterval(() => {
    const now = Date.now()
    const lastChunk = chunks.at(-1) ?? started
    if (now - lastLogged > 5000) {
      lastLogged = now
      logEvent(`heartbeat: chunks=${chunks.length}, last chunk ${((now - lastChunk) / 1000).toFixed(1)} s ago`)
    }
    void updateText(`LOCK TEST  ${Math.round((now - started) / 1000)} s\nchunks: ${chunks.length}\nlast chunk ${((now - lastChunk) / 1000).toFixed(1)} s ago\n\nTap to finish.`)
  }, 1000)
  await waitTap()
  clearInterval(ticker)
  await stopHardware()
  for (let i = 1; i < chunks.length; i++) {
    const gap = chunks[i] - chunks[i - 1]
    maxGap = Math.max(maxGap, gap)
    if (gap > 1000) gapsOver1s++
  }
  note(`Lock test: ${Math.round((Date.now() - started) / 1000)} s, ${chunks.length} chunks, ${gapsOver1s} gaps > 1 s, max gap ${(maxGap / 1000).toFixed(1)} s. Lifecycle events are in the log.`)
  await showText(`${results.at(-1)}\n\nTap to return.`)
  await waitTap()
}

async function showResults() {
  const body = results.length ? results.join('\n') : 'No results yet.'
  await showText(`${body.slice(0, 900)}\n\nFull text on the phone page. Tap to return.`)
  await waitTap()
}

// ---- Boot --------------------------------------------------------------------------

const created = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({ containerTotalNum: 1, listObject: [menuList()] }))
logEvent(`boot; createStartUpPageContainer -> ${String(created)}`)
phoneStatus('Menu on glasses. Swipe to pick a test, tap to run.')

// A previous run's log is still in SDK storage if the WebView was swapped or reloaded.
const previous = await call('getLocalStorage', () => bridge.getLocalStorage(LOG_KEY))
if (previous) {
  try {
    const old = JSON.parse(previous) as LogEntry[]
    $('previous').textContent = old.map(e => `${e.at} ${e.ev}`).join('\n')
  } catch { /* ignore a corrupt log */ }
}

for (const [i, label] of MENU.entries()) {
  const b = document.createElement('button')
  b.textContent = label
  b.onclick = () => void runTest(i)
  $('buttons').appendChild(b)
}
$('copy').addEventListener('click', () => {
  ;($('dump') as HTMLTextAreaElement).value = [
    '# Results', ...results, '', $('storage').textContent ?? '', '', '# Log', ...log.map(e => `${e.at} ${e.ev}`), '', '# Previous run log', $('previous').textContent ?? '',
  ].join('\n')
})
