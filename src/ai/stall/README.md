# src/ai/stall (T-301)

The stall detector decides when Step 3 shows a hint without being asked. It is pure, with no timers and no SDK, and sits behind the `StallDetector.onEvent(event) → StallSignal | null` interface from the T-301 card.

```ts
import { attachStallDetector, createStallDetector } from '../../ai/stall'

const detector = createStallDetector()                 // DEFAULT_STALL_CONFIG
const detach = attachStallDetector(ctx.stt, detector, signal => {
  // signal.transcriptTail / signal.stalledAfter drop straight into a PredictRequest
  void throttle.onHelp({ transcriptTail: signal.transcriptTail, stalledAfter: signal.stalledAfter, bank, n: 3 })
}, { now: ctx.now, onError: () => fallBackToStep2() })   // detector threw → detached, Step 2 behavior
// on mode exit: detach(); detector.reset()
```

## How it decides

The T-007 fixtures make silence alone useless: some normal pauses (6.9 s) are longer than every annotated stall (2.2-4 s). So the detector combines two things:

1. **Silence after speech** of at least `minSilenceMs`, measured from local VAD's `speaking: false`.
2. **How the last utterance ended** (`ending.ts`): a function word ("pour my tea into **the**"), a filler ("take my, **um**"), a dangling comma, or a self-repair set off by commas ("a cop, **no,** for tea, a cuh"). "like" and "thing" count only in context ("I'd **like**", "give me the **thing**"), because they also end complete sentences ("the one I like", "one more thing").

Terminal punctuation only ever blocks a hint, and only when it's present: `.`/`!` count as complete, and `?` is a question, usually from the other speaker. **It can't be a positive signal: ElevenLabs Scribe drops the final period on complete statements.** That was measured in T-301: "The tea smells lovely this morning" came back without a period; only questions keep their `?`.

**Content-word endings** ("I need the door") are not hinted by default. Without a period they are word-for-word the same as complete sentences ("…packed in my bag"). With `contentWordEndings: true` and periods stripped, the fixtures produce **18 false hints**, and the extra hints also use up the rate limit, so recall drops too.

**Real-STT timing:**
- Finals arrive about 1 s after speech (D5), so the detector waits for a late final and a late final can revise the verdict.
- It falls back to the partial after `finalWaitMs`.
- Empty commits are ignored.
- It never fires twice in one silence.

**Rate limits:** a 10 s cooldown between hints and at most 3 hints per rolling minute.

## Results on fixtures/conversations

11 conversations, 12 stalls, 57 normal pauses. Run `npx vite-node src/ai/stall/report.ts`; `evaluate.test.ts` enforces the bar.

| Variant | False hints | Recall | Hint latency |
|---|---|---|---|
| as-is | **0** | 11/12 | 1.5 s |
| no final period (what Scribe returns) | **0** | 11/12 | 1.5 s |
| finals 1 s late | **0** | 11/12 | 1.5 s |
| both | **0** | 11/12 | 1.5 s |

The only miss is `clean-stall` "I need the door", a content-word ending, missed by design.

## Tuning (for G3)

- **`minSilenceMs` = 1500 is a judgment call, not a fixture result.** The sweep from 600 to 1500 ms gives identical scores, because no fixture has a normal pause after an unfinished phrase. Real speakers do pause briefly mid-phrase ("I'd like some… toast"), so 1.5 s keeps at least 0.7 s of margin under the shortest annotated stall (2.2 s). Re-tune it from the G3 soak.
- **`--content-words`** in the report shows the trade-off if a later STT reliably punctuates.
- **The model check is not built.** The card calls it optional, and the predictor's 15/min free-tier quota (D11) can't spare a second caller.
