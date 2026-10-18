# Synthetic conversation and predictor fixtures

Personal entries and dialogue are fictional. The bank's `sample` tags identify
example personal data; that word and artificial spelling hints do not belong
in natural conversation transcripts. These fixtures contain no recorded audio.

## Time and stall annotations

Every event's `tMs` is milliseconds from conversation start. Transcript
`tStartMs` marks the start of that utterance; the transcript's `tEndMs` is the
event's `tMs`, as interpreted by MockStt. Partial and final transcripts can
share an utterance start. Speaker/turn information lives in `description`.

**`stalls[].tMs` is the onset of the stall silence**: exactly the preceding
`speech` event with `speaking: false`, after the incomplete final transcript.
It is not a precomputed hint time. A stall detector adds its own timeout to
this annotation. `stalledAfter` is a suffix of that final transcript.

The fixture schema is unchanged: `stalls` may be empty, and may contain more
than one stall. `clean-stall` and `known-name` each contain two stalls.
`no-stall` and `appointment-pause` contain only negative examples.
`breakfast-stalls` adds two more word-finding pauses in a breakfast exchange.

The eleven conversations range from about 21 to 83 seconds and vary in turn
counts, partials, and timing. Annotated stall silences range from 2.2 to 4
seconds. Some normal pauses are longer than these stalls, including pauses
before the caregiver answers, so silence duration alone cannot separate the
classes. Do not tune a detector against one shared timing skeleton.

## Predictor evaluation

`predictor-eval.json` has 25 cases. The harness supplies `bank` from
`src/content/words.json` to construct each PredictRequest. Cases cover the
eight original shapes, including five out-of-bank targets and three synthetic
locations. Shape labels describe the retrieval clue: descriptions of an
object's function/location are circumlocution; a clean stall simply stops in
otherwise ordinary speech.

Run `npm test` for word-bank, timing, annotation and evaluation validators.
