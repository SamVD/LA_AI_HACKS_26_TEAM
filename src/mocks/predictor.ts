import type { PredictRequest, PredictorService, Suggestion } from '../core/types'

export class MockPredictor implements PredictorService {
  private responses: Map<string, Suggestion[]>

  constructor(responses: Record<string, Suggestion[]> = {}) {
    this.responses = new Map(Object.entries(responses)
      .map(([key, value]) => [key.trim().toLowerCase(), structuredClone(value)]))
  }

  async predict(request: PredictRequest, signal?: AbortSignal): Promise<Suggestion[]> {
    if (signal?.aborted) return []
    const n = Number.isFinite(request.n) ? Math.max(0, Math.floor(request.n)) : 0
    const canned = this.responses.get(request.stalledAfter.trim().toLowerCase())
    if (canned) return structuredClone(canned.slice(0, n))
    return request.bank.slice(0, n).map(entry => ({
      word: entry.word,
      confidence: 0.1,
      source: 'bank',
      ...(entry.imageKey ? { imageKey: entry.imageKey } : {}),
    }))
  }
}
