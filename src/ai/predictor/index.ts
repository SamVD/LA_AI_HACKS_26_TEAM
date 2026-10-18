import type { PredictorService } from '../../core/types'
import { resolveAssets } from '../../content'
import { createPredictor as createBare, type PredictorOptions } from './service'

export { buildModelInput, toWireRequest, trimTail, type ModelInput, type PredictWireRequest } from './input'
export { validateModelOutput, type Validation } from './validate'
export { rankFallback } from './fallback'
export type { FallbackReason, PredictorOptions } from './service'

/** The app's predictor: api/predict + Section 6 validation + Section 7 fallback, with assets from src/content. */
export function createPredictor(options: PredictorOptions = {}): PredictorService {
  return createBare({ resolveAssets, ...options })
}
