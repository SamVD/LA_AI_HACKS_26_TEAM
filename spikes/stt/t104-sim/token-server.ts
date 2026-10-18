// Serves the real api/stt handler locally (same code Vercel runs), for the simulator check.
//   npx esbuild spikes/stt/t104-sim/token-server.ts --bundle --platform=node --format=esm --outfile=/tmp/ts.mjs && node /tmp/ts.mjs
// Env: ELEVENLABS_API_KEY (or .env.local), STT_ALLOWED_ORIGINS (default http://localhost:5173), PORT (default 8788)
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createTokenHandler, parseOrigins } from '../../../api/stt/handler'

const key = process.env.ELEVENLABS_API_KEY
  ?? (existsSync('.env.local') ? readFileSync('.env.local', 'utf8').match(/^\s*ELEVENLABS_API_KEY\s*=\s*(\S+)/m)?.[1] : undefined)
const handle = createTokenHandler({
  apiKey: key,
  allowedOrigins: parseOrigins(process.env.STT_ALLOWED_ORIGINS ?? 'http://localhost:5173'),
  log: l => console.log(l),
})
const port = Number(process.env.PORT ?? 8788)
createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')) as Record<string, string>
  const out = await handle(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }))
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} origin=${req.headers.origin ?? '-'} -> ${out.status}`)
  res.writeHead(out.status, Object.fromEntries(out.headers)).end(Buffer.from(await out.arrayBuffer()))
}).listen(port, () => console.log(`api/stt token server on :${port}`))
