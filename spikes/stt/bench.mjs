// S-1 bench. Usage (key in shell env or .env.local at repo root, never printed):
//   node spikes/stt/bench.mjs latency    # Q4 batch: wav vs pcm_s16le_16, two hosts
//   node spikes/stt/bench.mjs partial    # Q5/Q6: slurred clips, with and without keyterms
//   node spikes/stt/bench.mjs realtime   # Q1/Q4: realtime WS via single-use token
//   node spikes/stt/bench.mjs token      # Q2: batch with a single-use token, no key header
//   node spikes/stt/bench.mjs keyterm-encoding
// Results are written to spikes/stt/results/<name>.json (transcripts + timings, no audio).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { HERE, loadKey, wavToPcm, batchTranscribe, mintToken, realtimeTranscribe, realtimeRolling, summary, durationMs } from './lib.mjs'

const RESULTS = join(HERE, 'results')
mkdirSync(RESULTS, { recursive: true })
const manifest = JSON.parse(readFileSync(join(HERE, 'clips', 'manifest.json'), 'utf8'))
const pcmOf = (id) => wavToPcm(readFileSync(join(HERE, 'clips', `${id}.wav`)))
const key = loadKey()
const save = (name, data) => writeFileSync(join(RESULTS, `${name}.json`), JSON.stringify(data, null, 2))
const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()

async function latency() {
  const clean = manifest.filter((c) => c.kind === 'clean')
  const rows = []
  for (const host of ['api.elevenlabs.io', 'api.us.elevenlabs.io']) {
    for (const format of ['pcm', 'wav']) {
      // one warm-up call per config so TLS setup is not counted (keep-alive like a live app)
      await batchTranscribe(pcmOf('cup'), { key, host, format })
      for (const c of clean) {
        const r = await batchTranscribe(pcmOf(c.id), { key, host, format })
        rows.push({ host, format, id: c.id, audioMs: c.ms, ms: Math.round(r.ms), status: r.status, text: r.text, error: r.error })
        process.stdout.write(`${host} ${format} ${c.id}: ${Math.round(r.ms)} ms -> ${JSON.stringify(r.text)}${r.error ? ' ERR ' + r.error : ''}\n`)
      }
    }
  }
  const table = {}
  for (const host of ['api.elevenlabs.io', 'api.us.elevenlabs.io'])
    for (const format of ['pcm', 'wav']) {
      const sel = rows.filter((r) => r.host === host && r.format === format && r.status === 200)
      table[`${host} ${format}`] = { ...summary(sel.map((r) => r.ms)), correct: sel.filter((r) => norm(r.text) === norm(manifest.find((c) => c.id === r.id).target)).length }
    }
  console.table(table)
  save('latency', { at: new Date().toISOString(), table, rows })
}

async function partial() {
  const set = manifest.filter((c) => c.kind === 'partial' || ['cup', 'medicine', 'metformin'].includes(c.id))
  const rows = []
  for (const c of set) {
    const pcm = pcmOf(c.id)
    const base = await batchTranscribe(pcm, { key })
    const kt = await batchTranscribe(pcm, { key, keyterms: [c.target] })
    const noLang = await batchTranscribe(pcm, { key, language: null })
    const noVerb = await batchTranscribe(pcm, { key, extra: { no_verbatim: true } })
    const row = {
      id: c.id,
      said: c.say,
      target: c.target,
      plain: base.text ?? `ERR ${base.status}`,
      keyterm: kt.text ?? `ERR ${kt.status} ${kt.error}`,
      autoLang: `${noLang.text ?? 'ERR'} [${noLang.language}]`,
      noVerbatim: noVerb.text ?? `ERR ${noVerb.status}`,
      words: base.words,
    }
    rows.push(row)
    console.log(JSON.stringify({ id: row.id, said: row.said, plain: row.plain, keyterm: row.keyterm, autoLang: row.autoLang, noVerbatim: row.noVerbatim }))
  }
  save('partial', { at: new Date().toISOString(), rows })
}

async function keytermEncoding() {
  // Which multipart encoding does the batch endpoint accept for `keyterms`?
  const pcm = pcmOf('cop')
  const out = {}
  for (const mode of ['repeat', 'json']) {
    const r = await batchTranscribe(pcm, { key, keyterms: ['cup', 'spoon'], keytermsMode: mode })
    out[mode] = { status: r.status, text: r.text, error: r.error }
  }
  console.log(out)
  save('keyterm-encoding', out)
}

async function token() {
  // Q2: can the browser call batch with only a single-use token (no key header)?
  const rows = []
  for (const c of manifest.filter((c) => c.kind === 'clean').slice(0, 6)) {
    const t = await mintToken(key, 'batch_scribe')
    const r = await batchTranscribe(pcmOf(c.id), { token: t.token })
    const reuse = await batchTranscribe(pcmOf(c.id), { token: t.token })
    rows.push({ id: c.id, mintMs: Math.round(t.ms), callMs: Math.round(r.ms), status: r.status, text: r.text, reuseStatus: reuse.status, reuseError: reuse.error })
    console.log(rows.at(-1))
  }
  console.table({ mint: summary(rows.map((r) => r.mintMs)), call: summary(rows.map((r) => r.callMs)) })
  save('token', { at: new Date().toISOString(), rows })
}

async function realtime() {
  const clean = manifest.filter((c) => c.kind === 'clean')
  const rows = []
  const configs = [
    { name: 'manual', commitStrategy: 'manual' },
    { name: 'vad-0.5s', commitStrategy: 'vad', vadSilenceSecs: 0.5, trailSilenceMs: 1500 },
  ]
  for (const cfg of configs) {
    for (const c of clean) {
      const t = await mintToken(key, 'realtime_scribe')
      const pcm = pcmOf(c.id)
      const r = await realtimeTranscribe(pcm, { token: t.token, ...cfg })
      rows.push({
        cfg: cfg.name,
        id: c.id,
        audioMs: durationMs(pcm),
        mintMs: Math.round(t.ms),
        openMs: r.tOpen,
        sessionMs: r.tSession,
        firstPartialMs: r.tFirstPartial ?? null,
        finalAfterEndMs: r.tCommit ?? null,
        text: r.text ?? null,
        partials: r.partials.filter(Boolean),
        why: r.why,
        error: r.error,
        close: r.close,
      })
      console.log(JSON.stringify(rows.at(-1)))
      if (!r.ok && cfg.name === 'manual' && rows.filter((x) => !x.text).length > 3) break
    }
  }
  const table = {}
  for (const cfg of configs) {
    const sel = rows.filter((r) => r.cfg === cfg.name && r.text != null)
    if (!sel.length) continue
    table[cfg.name] = {
      n: sel.length,
      sessionP50: summary(sel.map((r) => r.sessionMs)).p50,
      firstPartial: summary(sel.filter((r) => r.firstPartialMs != null).map((r) => r.firstPartialMs)),
      finalAfterEnd: summary(sel.map((r) => r.finalAfterEndMs)),
      correct: sel.filter((r) => norm(r.text) === norm(manifest.find((c) => c.id === r.id).target)).length,
    }
  }
  console.dir(table, { depth: 4 })
  save('realtime', { at: new Date().toISOString(), configs, table, rows })
}

async function rolling() {
  const rows = []
  for (const c of manifest.filter((c) => c.kind === 'sentence')) {
    const pcm = pcmOf(c.id)
    for (const vad of [0.5, 1.0]) {
      const t = await mintToken(key, 'realtime_scribe')
      const r = await realtimeRolling(pcm, { token: t.token, vadSilenceSecs: vad })
      const partials = r.events.filter((e) => e.type === 'partial_transcript' && e.text)
      const commits = r.events.filter((e) => e.type === 'committed_transcript_with_timestamps')
      // word lag: first partial that already contains word i (by position) vs the word's end time in audio
      const lags = []
      let base = 0
      for (const cm of commits) {
        for (const [i, w] of (cm.words ?? []).entries()) {
          const p = partials.find((p) => p.t >= (cm.words[0].s * 1000 - 200) && norm(p.text).split(' ')[i] === norm(w.t))
          if (p) lags.push(p.t - w.e * 1000)
        }
        base += cm.words?.length ?? 0
      }
      const commitLag = commits.map((cm) => cm.t - (cm.words?.at(-1)?.e ?? 0) * 1000)
      const batch = await batchTranscribe(pcm, { key })
      rows.push({
        id: c.id,
        vad,
        audioMs: durationMs(pcm),
        said: c.say,
        realtime: commits.map((e) => e.text).join(' | '),
        batch: batch.text,
        firstPartialMs: partials[0]?.t ?? null,
        partials: partials.length,
        wordLag: lags.length ? summary(lags) : null,
        commitAfterLastWordMs: commitLag.map(Math.round),
        error: r.error,
        why: r.why,
      })
      console.log(JSON.stringify(rows.at(-1)))
    }
  }
  save('rolling', { at: new Date().toISOString(), rows })
}

async function realtimeKeyterms() {
  // Q6 for realtime: do keyterms (query params) bias the realtime model the same way?
  const rows = []
  for (const c of manifest.filter((c) => ['cop', 'cuh', 'spoo', 'spun', 'wa-er', 'cup', 'fork'].includes(c.id))) {
    const res = {}
    for (const kts of [[], [c.target]]) {
      const t = await mintToken(key, 'realtime_scribe')
      const r = await realtimeTranscribe(pcmOf(c.id), { token: t.token, keyterms: kts })
      res[kts.length ? 'keyterm' : 'plain'] = r.text ?? `ERR ${r.error}`
    }
    rows.push({ id: c.id, said: c.say, target: c.target, ...res })
    console.log(JSON.stringify(rows.at(-1)))
  }
  save('realtime-keyterms', { at: new Date().toISOString(), rows })
}

async function soak() {
  // One realtime session for SOAK_MIN minutes (default 8): a sentence every 60 s,
  // background-noise-level silence in between, like Step 2's idle blank screen.
  // Records commits, warnings, errors and the close code to find session limits.
  const minutes = Number(process.env.SOAK_MIN ?? 8)
  const t = await mintToken(key, 'realtime_scribe')
  const speech = pcmOf('conv-park')
  const qs = new URLSearchParams({ model_id: 'scribe_v2_realtime', token: t.token, audio_format: 'pcm_16000', commit_strategy: 'vad', vad_silence_threshold_secs: '0.8', language_code: 'en' })
  const ws = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${qs}`)
  const t0 = performance.now()
  const sec = () => Math.round((performance.now() - t0) / 1000)
  const events = []
  let closed = null
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.message_type === 'partial_transcript') return
    events.push({ s: sec(), type: m.message_type, text: m.text?.slice(0, 60), error: m.error })
    console.log(sec(), m.message_type, m.text?.slice(0, 60) ?? m.error ?? '')
  }
  ws.onclose = (e) => ((closed = { s: sec(), code: e.code, reason: e.reason }), console.log('CLOSE', closed))
  await new Promise((r) => (ws.onopen = r))
  const chunk = 3200
  const quiet = Buffer.alloc(chunk)
  for (let i = 0; i < quiet.length; i += 2) quiet.writeInt16LE(Math.round((Math.random() * 2 - 1) * 65), i)
  let nextSpeech = 0
  while (!closed && performance.now() - t0 < minutes * 60000) {
    const elapsed = performance.now() - t0
    if (elapsed >= nextSpeech) {
      for (let off = 0; off < speech.length && !closed; off += chunk) {
        ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: speech.subarray(off, off + chunk).toString('base64'), commit: false, sample_rate: 16000 }))
        await new Promise((r) => setTimeout(r, 100))
      }
      nextSpeech += 60000
    } else {
      if (ws.readyState === 1) ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: quiet.toString('base64'), commit: false, sample_rate: 16000 }))
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  if (!closed) ws.close()
  save('soak', { at: new Date().toISOString(), minutes, events, closed, commits: events.filter((e) => e.type === 'committed_transcript').length })
  console.log('SOAK DONE', { closed, commits: events.filter((e) => e.type === 'committed_transcript').length })
}

const cmds = { latency, partial, realtime, rolling, soak, 'realtime-keyterms': realtimeKeyterms, token, 'keyterm-encoding': keytermEncoding }
const which = process.argv[2]
if (!cmds[which]) {
  console.error(`usage: node spikes/stt/bench.mjs ${Object.keys(cmds).join('|')}`)
  process.exit(2)
}
await cmds[which]()
