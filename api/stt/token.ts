// Vercel function: POST /api/stt/token (Web-standard handler signature).
// Env (set in the Vercel project, never in the repo):
//   ELEVENLABS_API_KEY         required
//   STT_ALLOWED_ORIGINS        comma-separated exact origins; include `null` if the packaged WebView sends that
//   STT_ALLOW_MISSING_ORIGIN   "1" to accept requests with no Origin header (check the device log first)
import { createTokenHandler, parseOrigins } from './handler'

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}

const handle = createTokenHandler({
  apiKey: env.ELEVENLABS_API_KEY,
  allowedOrigins: parseOrigins(env.STT_ALLOWED_ORIGINS ?? 'http://localhost:5173'),
  allowMissingOrigin: env.STT_ALLOW_MISSING_ORIGIN === '1',
  log: line => console.log(line),
})

export const POST = handle
export const OPTIONS = handle
export const GET = handle
