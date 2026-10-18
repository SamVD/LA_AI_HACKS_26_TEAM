# Practice (T-102)

The default export implements the registered `step1` Mode. Tests can create
independent instances with `createPracticeMode({ random })`. It uses only the
shared ModeContext services, the matcher and content resolver; no SDK or DOM.

Each session uses up to ten distinct words, rotates categories, excludes
sample entries, and chooses a random sentence frame with one blank. Smaller
personal banks produce shorter sessions instead of repeating words. An empty
bank shows a status message; SELECT reloads it.

SELECT escalates the prompt to picture, masked letters, then the full word.
Targets with no picture skip the picture level. Spaces and hyphens stay
visible in the mask. SELECT preserves the current recording, so an answer is
graded at the cue level visible when its transcript arrives. NEXT skips and
PREV is ignored. A correct answer displays feedback for 1500 ms; an incorrect
answer displays feedback for 1200 ms before another attempt. Three incorrect
answers at the full-word cue end that item. Silence advances the cue ladder,
and silence at the full-word cue ends the item unsolved.

An item's `attempts` counts nonempty speech answers (including the successful
answer). Silence and service errors do not increase it. Results record target,
frame, solved cue, skip status, attempts and time on the ModeContext clock.
A completed session saves once and shows its summary. SELECT starts another;
BACK saves attempted partial progress and asks the shell to leave. An untouched
session is not saved. External `exit()` cancels activity without adding a save.

Utterances use maxMs 8000, endSilenceMs 1200 and targetHint as the contract
requires. Per the S-1 decision, the real STT adapter must not bias recognition
toward that answer. Microphone/network/service errors wait for SELECT to retry.
Storage-read or save failures also offer retry messages.

Item generations reject late transcripts and timers after skipping or exit.
Microphone stops are serialized before the next recording. Exit is idempotent,
removes the intent subscription, clears feedback timers and stops the service.
An in-flight summary save is shared with BACK to avoid duplicate records.
