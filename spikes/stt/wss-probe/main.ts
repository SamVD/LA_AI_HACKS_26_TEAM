// Blocker #2 probe: why does the realtime transcript (wss://) get nothing on the G2?
// A throwaway page, never imported by src/. It runs controlled tests inside the Even
// app's WebView and shows a summary on the glasses and full details on the phone page.
//
//   0 page policy    the Even app serves this page from its own local server, so read our
//                    own response headers: a Content-Security-Policy there is likely how the
//                    app.json whitelist is enforced (connect-src covers fetch AND WebSocket)
//   1 token          POST a realtime_scribe token from api/stt (whitelisted; batch works)
//   2 EL realtime    open Scribe realtime with T-202's exact realtimeUrl(), no keyterms
//   3 EL + keyterms  the same with the app's personal-bank keyterms (rules out the query)
//   4 echo, listed   wss://ws.postman-echo.com/raw (in this probe's whitelist)
//   5 echo, unlisted wss://echo.websocket.org (NOT whitelisted): is wss policed at all?
//   6 fetch unlisted https://httpbin.org/get (NOT whitelisted, sends CORS): control for fetch
//   7 live mic → RT  the real T-202 RealtimeTranscriber on the live glasses mic for 10 s while
//                    the tester speaks: Step 2's actual pipeline (connection, audio, transcripts)
//
// Every `securitypolicyviolation` the browser reports is captured with its policy text.
// Tap = run again. Double-tap = exit. Tokens are single-use and never shown or logged.
import {
  CreateStartUpPageContainer, OsEventTypeList, TextContainerProperty, TextContainerUpgrade, waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { createGlassesMic } from '../../../src/audio/capture'
import { personalKeyterms } from '../../../src/audio/rolling'
import { cleanKeyterms, RealtimeTranscriber, realtimeUrl } from '../../../src/audio/rolling/realtime'
import { TokenProvider } from '../../../src/audio/token'
import { builtinBank } from '../../../src/content'

const params = new URLSearchParams(location.search)
const TOKEN_URL = params.get('tokenUrl') ?? 'https://nudge-seven-psi.vercel.app/api/stt/token'
const ECHO_LISTED = 'wss://ws.postman-echo.com/raw'
const ECHO_UNLISTED = 'wss://echo.websocket.org'
const FETCH_UNLISTED = 'https://httpbin.org/get'
const TIMEOUT_MS = 8000
const LISTEN_MS = 10_000
const sleep = (n: number) => new Promise(r => setTimeout(r, n))

interface Result { id: string; label: string; ok: boolean | null; short: string; detail: Record<string, unknown> }

const violations: Array<Record<string, unknown>> = []
document.addEventListener('securitypolicyviolation', e => {
  violations.push({ blockedURI: e.blockedURI, directive: e.effectiveDirective || e.violatedDirective, disposition: e.disposition, policy: e.originalPolicy })
})

const ms = (t0: number) => Math.round(performance.now() - t0)
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))

async function pagePolicy(): Promise<Result> {
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy" i]')?.getAttribute('content') ?? null
  try {
    const res = await fetch(location.href, { cache: 'no-store' })
    const csp = res.headers.get('content-security-policy')
    const headers = Object.fromEntries([...res.headers])
    return { id: '0', label: 'page policy', ok: true, short: csp ? 'CSP header' : meta ? 'CSP meta tag' : 'no CSP seen', detail: { origin: location.origin, csp, meta, headers } }
  } catch (e) {
    return { id: '0', label: 'page policy', ok: null, short: 'unreadable', detail: { origin: location.origin, meta, error: errText(e) } }
  }
}

async function mintToken(): Promise<{ token?: string; result: Result }> {
  const t0 = performance.now()
  try {
    const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'realtime_scribe' }) })
    const body = await res.json().catch(() => null) as { token?: string } | null
    const ok = res.ok && typeof body?.token === 'string'
    return { token: ok ? body!.token : undefined, result: { id: '1', label: 'token', ok, short: ok ? `OK ${ms(t0)}ms` : `HTTP ${res.status}`, detail: { status: res.status, ms: ms(t0), url: TOKEN_URL } } }
  } catch (e) {
    return { result: { id: '1', label: 'token', ok: false, short: 'fetch failed', detail: { error: errText(e), ms: ms(t0), url: TOKEN_URL } } }
  }
}

interface SocketOutcome { threw?: string; openedMs?: number; firstMessage?: string; messageMs?: number; errorEvent: boolean; closeCode?: number; closeReason?: string; timeout: boolean }

/** Open a WebSocket, optionally send one text frame on open, and wait for the first message or the close. */
function socket(url: string, sendOnOpen?: string): Promise<SocketOutcome> {
  return new Promise(resolve => {
    const t0 = performance.now()
    const r: SocketOutcome = { errorEvent: false, timeout: false }
    let ws: WebSocket
    try { ws = new WebSocket(url) } catch (e) { r.threw = errText(e); resolve(r); return }
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      try { ws.close() } catch { /* already closed */ }
      resolve(r)
    }
    const timer = setTimeout(() => { r.timeout = true; finish() }, TIMEOUT_MS)
    ws.onopen = () => { r.openedMs = ms(t0); if (sendOnOpen) ws.send(sendOnOpen) }
    ws.onmessage = ev => {
      r.messageMs = ms(t0)
      const data = String(ev.data)
      try { r.firstMessage = (JSON.parse(data) as { message_type?: string }).message_type ?? data.slice(0, 60) } catch { r.firstMessage = data.slice(0, 60) }
      finish()
    }
    ws.onerror = () => { r.errorEvent = true }
    ws.onclose = ev => { r.closeCode = ev.code; r.closeReason = ev.reason; finish() }
  })
}

function socketResult(id: string, label: string, o: SocketOutcome, expect: (first: string) => boolean): Result {
  const ok = o.firstMessage !== undefined && expect(o.firstMessage)
  const short = o.threw ? 'THREW'
    : ok ? `OK ${o.messageMs}ms`
    : o.openedMs !== undefined ? `opened, then ${o.closeCode ?? (o.timeout ? 'timeout' : '?')}`
    : o.timeout ? 'TIMEOUT'
    : `BLOCKED ${o.closeCode ?? ''}`.trim()
  return { id, label, ok, short, detail: { ...o } }
}

async function elRealtime(id: string, label: string, keyterms: string[]): Promise<Result> {
  const { token, result } = await mintToken()
  if (!token) return { id, label, ok: null, short: 'no token', detail: { token: result.detail } }
  const url = realtimeUrl(token, keyterms)
  const o = await socket(url)
  const r = socketResult(id, label, o, first => first === 'session_started')
  r.detail.url = url.replace(/token=[^&]+/, 'token=<redacted>')
  r.detail.keyterms = keyterms.length
  return r
}

async function fetchUnlisted(): Promise<Result> {
  const t0 = performance.now()
  try {
    const res = await fetch(FETCH_UNLISTED, { cache: 'no-store' })
    return { id: '6', label: 'fetch unlisted', ok: res.ok, short: res.ok ? `ALLOWED ${res.status}` : `HTTP ${res.status}`, detail: { status: res.status, ms: ms(t0) } }
  } catch (e) {
    return { id: '6', label: 'fetch unlisted', ok: false, short: 'BLOCKED', detail: { error: errText(e), ms: ms(t0) } }
  }
}

/** Step 2's real pipeline: glasses mic → T-202 RealtimeTranscriber → Scribe realtime. */
async function liveRealtime(show: (text: string) => Promise<unknown>): Promise<Result> {
  const events: string[] = []
  const heard: Array<{ text: string; isFinal: boolean }> = []
  let chunks = 0
  let bytes = 0
  const mic = createGlassesMic(bridge)
  const offCount = mic.onChunk(pcm => { chunks++; bytes += pcm.byteLength })
  const rt = new RealtimeTranscriber({
    mic,
    tokens: new TokenProvider({ url: TOKEN_URL, type: 'realtime_scribe' }),
    emit: t => heard.push({ text: t.text, isFinal: t.isFinal }),
    log: (e, d) => events.push(`${e}${d === undefined ? '' : ` ${JSON.stringify(d)}`}`),
  })
  if (!(await mic.open())) {
    offCount()
    return { id: '7', label: 'live mic → RT', ok: null, short: 'mic refused', detail: { events } }
  }
  await show('7  Say ONE short sentence, then stay quiet:\n"Please pass me the cup of tea"')
  console.log('[wss-probe] test7 listening')
  await rt.start()
  await sleep(LISTEN_MS)
  await rt.stop()
  await mic.close()
  offCount()
  const finals = heard.filter(t => t.isFinal).length
  const ok = heard.length > 0
  return {
    id: '7', label: 'live mic → RT', ok,
    short: ok ? `${heard.length - finals} partial, ${finals} final` : `no text (${rt.stats.connects} conn)`,
    detail: { stats: { ...rt.stats }, audioChunks: chunks, audioMs: Math.round(bytes / 32), heard: heard.slice(-6), events: events.slice(0, 30) },
  }
}

function verdict(r: Result[]): string {
  const [, , el, , listed, unlisted, fetchU, live] = r
  if (el.ok && live?.ok) return 'Realtime works end to end here'
  if (el.ok && live?.ok === false) return 'wss OK; audio/transcripts fail (see 7)'
  if (el.ok) return 'wss OK; live test inconclusive (see 7)'
  if (listed.ok && unlisted.ok) return 'wss works, not policed: EL rejected us'
  if (listed.ok) return 'wss works when listed: fix the EL entry'
  if (violations.some(v => String(v.directive).includes('connect'))) return 'CSP blocks wss (see policy)'
  if (fetchU.ok === false && !listed.ok) return 'all wss fail: WebSocket blocked'
  return 'mixed: see phone page'
}

// ---- glasses + phone page ----------------------------------------------------------

const bridge = await waitForEvenAppBridge()
await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
  containerTotalNum: 1,
  textObject: [new TextContainerProperty({
    xPosition: 0, yPosition: 0, width: 576, height: 288, borderWidth: 0, borderColor: 5, paddingLength: 4,
    containerID: 1, containerName: 'main', content: 'wss probe\nRunning...', isEventCapture: 1,
  })],
}))
const glasses = (content: string) => bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 1, containerName: 'main', content }))
const $ = (id: string) => document.getElementById(id)!

let running = false
async function runAll() {
  if (running) return
  running = true
  violations.length = 0
  $('status').textContent = 'Running...'
  await glasses('wss probe\nRunning... (about 40 s)')
  const results: Result[] = []
  const step = async (p: Promise<Result>) => { const r = await p; results.push(r); await glasses(summary(results, 'running')) }
  const keyterms = cleanKeyterms(personalKeyterms(builtinBank()))
  await step(pagePolicy())
  await step(mintToken().then(x => x.result))
  await step(elRealtime('2', 'EL realtime', []))
  await step(elRealtime('3', 'EL + keyterms', keyterms))
  await step(socket(ECHO_LISTED, 'ping').then(o => socketResult('4', 'echo listed', o, first => first === 'ping')))
  await step(socket(ECHO_UNLISTED, 'ping').then(o => socketResult('5', 'echo unlisted', o, () => true)))
  await step(fetchUnlisted())
  await step(liveRealtime(glasses))
  const v = verdict(results)
  await glasses(summary(results, v))
  $('status').textContent = v
  const report = { at: new Date().toISOString(), userAgent: navigator.userAgent, origin: location.origin, secureContext: isSecureContext, verdict: v, results, violations }
  $('results').textContent = JSON.stringify(report, null, 2)
  console.log('[wss-probe]', JSON.stringify(report)) // readable from the simulator's automation console
  running = false
}

function summary(results: Result[], last: string): string {
  const lines = results.map(r => `${r.id} ${r.label.padEnd(14)} ${r.short}`)
  return ['wss probe  (tap = rerun)', ...lines, last === 'running' ? 'running...' : `> ${last}`].join('\n')
}

const typeOf = (e?: { eventType?: OsEventTypeList }) => (e ? e.eventType ?? OsEventTypeList.CLICK_EVENT : null)
bridge.onEvenHubEvent(event => {
  const t = typeOf(event.sysEvent) ?? typeOf(event.textEvent)
  if (t === OsEventTypeList.DOUBLE_CLICK_EVENT) { bridge.shutDownPageContainer(1); return }
  if (t === OsEventTypeList.CLICK_EVENT) void runAll()
})
$('copy').addEventListener('click', () => { void navigator.clipboard?.writeText($('results').textContent ?? '') })
void runAll()
