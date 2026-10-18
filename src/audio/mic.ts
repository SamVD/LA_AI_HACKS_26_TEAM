// What the STT service needs from a microphone. capture.ts adapts the Even SDK
// to this; tests use a synthetic source. No SDK import here.

export interface MicSource {
  /** Opens the mic. Resolves false when the host refuses (permission denied or not ready). */
  open(): Promise<boolean>
  close(): Promise<void>
  /** Raw PCM s16le 16 kHz mono chunks. Returns an unsubscribe function. */
  onChunk(cb: (pcm: Uint8Array) => void): () => void
}
