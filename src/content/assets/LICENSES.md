# Nudge cue artwork

All SVGs in `pictures/` (30 files, named for the non-sample word-bank ids) and
`mouth/` (10 files, named for their first-sound groups) are original line
art drawn for Nudge in this task. Source: the SVG path data in this directory.
No third-party art, font, image, external reference, or traced reference was used.

These assets are dedicated to the public domain under CC0 1.0 Universal:
https://creativecommons.org/publicdomain/zero/1.0/
To the extent possible under law, the contributors waive all copyright and
related rights in these SVG assets. They are provided without warranty.

Mouth drawings are visual speech cues, not clinical or anatomical diagrams.
The renderer fits each vector inside its requested G2 image container with
8 px padding, then exports white-on-black PNG bytes. There is no build-time
rasterization dependency or `make-assets` script.
