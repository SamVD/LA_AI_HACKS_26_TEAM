// T-104 simulator / device harness: the real createElevenLabsStt over the SDK
// glasses-mic path. Tap = one utterance; double-tap = exit. Not imported by src/.
//   ?tokenUrl=<api/stt/token URL>   (default: http://<host>:8788/api/stt/token)
import {
  CreateStartUpPageContainer, OsEventTypeList, TextContainerProperty, TextContainerUpgrade, waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { createElevenLabsStt } from '../../../src/audio'

const params = new URLSearchParams(location.search)
const tokenUrl = params.get('tokenUrl') ?? `http://${location.hostname}:8788/api/stt/token`
const pageLog = document.getElementById('log')!
const log = (...a: unknown[]) => {
  const line = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
  console.log('[t104]', line)
  pageLog.textContent += line + '\n'
}

const bridge = await waitForEvenAppBridge()
await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
  containerTotalNum: 1,
  textObject: [new TextContainerProperty({
    xPosition: 0, yPosition: 0, width: 576, height: 288, borderWidth: 0, borderColor: 5, paddingLength: 4,
    containerID: 1, containerName: 'main', content: 'T-104 check\nTap, then say a word.', isEventCapture: 1,
  })],
}))
const show = (content: string) => bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 1, containerName: 'main', content }))

const stt = createElevenLabsStt(bridge, { tokenUrl, log: (e, d) => log(e, d ?? '') })
stt.onSpeechState(s => log('speech', s.speaking ? 'start' : 'end'))
log('ready', { tokenUrl })

// Debug meter (on by default; ?meter=0 to hide): audio bytes and peak level per second, to see chunk flow from the host.
if (params.get('meter') !== '0') {
  let bytes = 0, chunks = 0, peak = 0
  const firstFrames: number[] = []
  bridge.onEvenHubEvent(e => {
    const pcm = e.audioEvent?.audioPcm
    if (!pcm) return
    bytes += pcm.byteLength; chunks++
    if (firstFrames.length < 20) {
      const v2 = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength & ~1)
      for (let f = 0; f + 640 <= v2.byteLength && firstFrames.length < 20; f += 640) {
        let sum = 0
        for (let i = f; i < f + 640; i += 2) { const x = v2.getInt16(i, true); sum += x * x }
        const rms = Math.sqrt(sum / 320)
        firstFrames.push(rms ? Math.round(20 * Math.log10(rms / 32768)) : -120)
      }
      if (firstFrames.length >= 20) log('first 20 frame RMS dB', firstFrames)
    }
    const v = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength & ~1)
    for (let i = 0; i < v.byteLength; i += 2) peak = Math.max(peak, Math.abs(v.getInt16(i, true)))
  })
  setInterval(() => {
    log('meter', { chunks, ms: Math.round(bytes / 32), peakDb: peak ? Math.round(20 * Math.log10(peak / 32768)) : -120 })
    bytes = 0; chunks = 0; peak = 0
  }, 1000)
}

let busy = false
async function utterance() {
  busy = true
  await show('Listening...\nSay one word.')
  const t0 = performance.now()
  const t = await stt.transcribeUtterance({ maxMs: 8000, endSilenceMs: 1200 })
  log('result', { text: t.text, error: t.error ?? null, ms: Math.round(performance.now() - t0) })
  await show(t.error ? `Error: ${t.error}\nTap to retry.` : `Heard: ${t.text}\nTap for another.`)
  busy = false
}

const typeOf = (e?: { eventType?: OsEventTypeList }) => (e ? e.eventType ?? OsEventTypeList.CLICK_EVENT : null)
bridge.onEvenHubEvent(event => {
  const t = typeOf(event.sysEvent) ?? typeOf(event.textEvent)
  if (t === OsEventTypeList.DOUBLE_CLICK_EVENT) { void stt.stop(); bridge.shutDownPageContainer(1); return }
  if (t === OsEventTypeList.CLICK_EVENT && !busy) void utterance()
})
