// Vercel function: POST /api/stt/token (Web-standard handler signature).
// Files starting with "_" next to this one are helpers/tests; Vercel does not deploy them as functions.
// Relative imports need the .js extension: package.json is "type": "module", so Node's ESM loader
// resolves the compiled output literally (an extensionless import crashed on Vercel with ERR_MODULE_NOT_FOUND).
// Env (set in the Vercel project, never in the repo):
//   ELEVENLABS_API_KEY         required
//   STT_ALLOWED_ORIGINS        comma-separated exact origins; include `null` if the packaged WebView sends that
//   STT_ALLOW_MISSING_ORIGIN   "1" to accept requests with no Origin header (check the device log first)
import { createTokenHandler, parseOrigins } from './_handler.js'

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
