import type { PredictorService } from '../../core/types'
import { resolveAssets } from '../../content'
import { createPredictor as createBare, type PredictorOptions } from './service'
import { createThrottledPredictor as createBareThrottle, type ThrottleOptions } from './throttle'

export { buildModelInput, toWireRequest, trimTail, type ModelInput, type PredictWireRequest } from './input'
export { validateModelOutput, type Validation } from './validate'
export { rankFallback } from './fallback'
export type { FallbackReason, PredictorOptions } from './service'
export type { ThrottleOptions, ThrottledPredictor } from './throttle'

/** Create on mode enter and stop on exit. Modes use onFinal/onHelp, never predict directly. */
export function createThrottledPredictor(predictor: PredictorService, options: ThrottleOptions) {
  return createBareThrottle(predictor, { resolveAssets, ...options })
}

/** The app's predictor: api/predict + Section 6 validation + Section 7 fallback, with assets from src/content. */
export function createPredictor(options: PredictorOptions = {}): PredictorService {
  return createBare({ resolveAssets, ...options })
}
