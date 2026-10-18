// Generates synthetic test clips with macOS `say` into spikes/stt/clips/ (gitignored).
// Each clip: 16 kHz mono s16le WAV, 300 ms lead + 600 ms trail padding, with a
// low noise floor (~-54 dBFS) so it is not digital silence like a real mic.
// These are TTS voices, not aphasic speech: they test whether Scribe keeps or
// "corrects" non-words, not how it handles a real stroke survivor's voice.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { HERE, wavToPcm, pcmToWav, SAMPLE_RATE, durationMs } from './lib.mjs'

const OUT = join(HERE, 'clips')
mkdirSync(OUT, { recursive: true })

// kind: clean = intended word said correctly (latency set)
//       partial = slurred / partial / paraphasia / filler (accuracy + keyterm set)
export const CLIPS = [
  // clean single words, two voices, 1-3 s with padding
  { id: 'cup', say: 'cup', target: 'cup', kind: 'clean' },
  { id: 'spoon', say: 'spoon', target: 'spoon', kind: 'clean' },
  { id: 'fork', say: 'fork', target: 'fork', kind: 'clean' },
  { id: 'keys', say: 'keys', target: 'keys', kind: 'clean' },
  { id: 'water', say: 'water', target: 'water', kind: 'clean' },
  { id: 'coffee', say: 'coffee', target: 'coffee', kind: 'clean' },
  { id: 'toothbrush', say: 'toothbrush', target: 'toothbrush', kind: 'clean' },
  { id: 'medicine', say: 'medicine', target: 'medicine', kind: 'clean' },
  { id: 'metformin', say: 'metformin', target: 'metformin', kind: 'clean' },
  { id: 'cup-daniel', say: 'cup', target: 'cup', kind: 'clean', voice: 'Daniel' },
  { id: 'fork-daniel', say: 'fork', target: 'fork', kind: 'clean', voice: 'Daniel' },
  { id: 'banana-daniel', say: 'banana', target: 'banana', kind: 'clean', voice: 'Daniel' },
  // partial / slurred / non-words
  { id: 'cop', say: 'cop', target: 'cup', kind: 'partial' },
  { id: 'tup', say: 'tup', target: 'cup', kind: 'partial' },
  { id: 'cuh', say: 'cuh', target: 'cup', kind: 'partial' },
  { id: 'fo-fork', say: 'fo... fork', target: 'fork', kind: 'partial' },
  { id: 'fock', say: 'fock', target: 'fork', kind: 'partial' },
  { id: 'spoo', say: 'spoo', target: 'spoon', kind: 'partial' },
  { id: 'spun', say: 'spun', target: 'spoon', kind: 'partial' },
  { id: 'medsin', say: 'medsin', target: 'medicine', kind: 'partial' },
  { id: 'medicine-slow', say: 'medicine', target: 'medicine', kind: 'partial', rate: 70 },
  { id: 'wa-er', say: 'wa er', target: 'water', kind: 'partial' },
  { id: 'kee', say: 'kee', target: 'keys', kind: 'partial' },
  { id: 'met-fommin', say: 'met fommin', target: 'metformin', kind: 'partial' },
  { id: 'lie-sin-pril', say: 'lie sin oh pill', target: 'lisinopril', kind: 'partial' },
  { id: 'um-cup', say: 'um... cup', target: 'cup', kind: 'partial' },
  { id: 'uh-the-fork', say: 'uh, the... the fork', target: 'fork', kind: 'partial' },
  { id: 'cop-daniel', say: 'cop', target: 'cup', kind: 'partial', voice: 'Daniel' },
  { id: 'spoo-daniel', say: 'spoo', target: 'spoon', kind: 'partial', voice: 'Daniel' },
  // conversation-length clips for the rolling (Steps 2-3) test
  { id: 'conv-park', say: 'Yesterday I went to the park with Maya. We sat by the... um... the water, and we had some coffee.', target: 'water', kind: 'sentence' },
  { id: 'conv-pharmacy', say: 'I need to call the pharmacy about my metformin. The doctor said I should take it with... uh... with food.', target: 'food', kind: 'sentence', voice: 'Daniel' },
  { id: 'conv-stall', say: 'Can you pass me the... the... you know. The thing. For soup.', target: 'spoon', kind: 'sentence' },
]

function noise(samples, amp) {
  const b = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) b.writeInt16LE(Math.round((Math.random() * 2 - 1) * amp), i * 2)
  return b
}

function addNoise(pcm, amp) {
  const b = Buffer.from(pcm)
  for (let i = 0; i < b.length; i += 2) {
    const v = b.readInt16LE(i) + Math.round((Math.random() * 2 - 1) * amp)
    b.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i)
  }
  return b
}

if (process.argv[1] && process.argv[1].endsWith('make-clips.mjs')) {
  const tmp = join(OUT, '_tmp.wav')
  const manifest = []
  for (const c of CLIPS) {
    const args = ['-v', c.voice ?? 'Samantha', '-o', tmp, '--file-format=WAVE', `--data-format=LEI16@${SAMPLE_RATE}`]
    if (c.rate) args.push('-r', String(c.rate))
    args.push(c.say)
    execFileSync('say', args)
    const speech = wavToPcm(readFileSync(tmp))
    const amp = 65 // ~-54 dBFS noise floor
    const pcm = Buffer.concat([noise(0.3 * SAMPLE_RATE, amp), addNoise(speech, amp), noise(0.6 * SAMPLE_RATE, amp)])
    writeFileSync(join(OUT, `${c.id}.wav`), pcmToWav(pcm))
    manifest.push({ ...c, ms: durationMs(pcm), speechMs: durationMs(speech) })
  }
  rmSync(tmp, { force: true })
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.table(manifest.map(({ id, say, target, kind, ms, speechMs }) => ({ id, say, target, kind, ms, speechMs })))
}
