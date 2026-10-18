import type { SttErrorCode } from '../core/types'

// ElevenLabs batch STT, per S-1 (spikes/stt/FINDINGS.md, "Integration notes"):
// raw PCM as `file` with file_format=pcm_s16le_16 (no WAV header), model scribe_v2,
// language_code=en always (D5: auto-detect returned other languages on short clips),
// a single-use token in ?token= (no key in the client), and no keyterms (D1).

export const SCRIBE_URL = 'https://api.elevenlabs.io/v1/speech-to-text'

export type ScribeResult = { ok: true; text: string } | { ok: false; error: SttErrorCode; detail: string }

export interface ScribeRequest {
  pcm: Uint8Array
  token: string
  fetch?: typeof fetch
  timeoutMs?: number
  url?: string
}

export async function transcribeBatch(r: ScribeRequest): Promise<ScribeResult> {
  const fetchFn = r.fetch ?? ((...a) => fetch(...a))
  const fd = new FormData()
  fd.append('model_id', 'scribe_v2')
  fd.append('language_code', 'en')
  fd.append('tag_audio_events', 'false')
  fd.append('file_format', 'pcm_s16le_16')
  fd.append('file', new Blob([r.pcm as BlobPart]), 'utterance.pcm')

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), r.timeoutMs ?? 4000)
  try {
    const res = await fetchFn(`${r.url ?? SCRIBE_URL}?token=${encodeURIComponent(r.token)}`, { method: 'POST', body: fd, signal: ac.signal })
    if (!res.ok) {
      // 401/403 = bad or reused token, 422 = bad request, 429 = quota: none of these is the user's fault.
      return { ok: false, error: 'unknown', detail: `scribe http ${res.status}` }
    }
    const body = await res.json().catch(() => null) as { text?: unknown } | null
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    return text ? { ok: true, text } : { ok: false, error: 'no-speech', detail: 'empty transcript' }
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError'
    return { ok: false, error: aborted ? 'timeout' : 'network', detail: aborted ? 'scribe timeout' : 'scribe fetch failed' }
  } finally {
    clearTimeout(timer)
  }
}
