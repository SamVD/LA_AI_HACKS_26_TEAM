// Vercel function: POST /api/predict (T-203). Web-standard handler signature.
// Files starting with "_" next to this one are helpers/tests; Vercel does not deploy them as functions.
// Relative imports need the .js extension (package.json is "type": "module"; see PR #50).
// Env (set in the Vercel project, never in the repo):
//   GEMINI_API_KEY               required
//   PREDICT_ALLOWED_ORIGINS      comma-separated exact origins (falls back to STT_ALLOWED_ORIGINS, so one
//                                setting can cover both api/ functions); include `null` if the WebView sends it
//   PREDICT_ALLOW_MISSING_ORIGIN "1" to accept requests with no Origin header (falls back to STT_ALLOW_MISSING_ORIGIN)
import { createPredictHandler, parseOrigins } from './_handler.js'

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}

const handle = createPredictHandler({
  apiKey: env.GEMINI_API_KEY,
  allowedOrigins: parseOrigins(env.PREDICT_ALLOWED_ORIGINS ?? env.STT_ALLOWED_ORIGINS ?? 'http://localhost:5173'),
  allowMissingOrigin: (env.PREDICT_ALLOW_MISSING_ORIGIN ?? env.STT_ALLOW_MISSING_ORIGIN) === '1',
  log: line => console.log(line),
})

export const POST = handle
export const OPTIONS = handle
export const GET = handle
