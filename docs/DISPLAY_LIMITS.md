# G2 Display Limits

Reference numbers for laying out Nudge screens on the Even G2. Sources: the vendored Even skills in `docs/vendor/even-skills/` (`glasses-ui`, `font-measurement`, `design-guidelines`) and measurements taken with `@evenrealities/pretext@0.1.4`, Even's glyph-width library for the firmware font. Target SDK: `@evenrealities/even_hub_sdk@0.0.12`.

**Status:** all numbers below come from the docs or from `pretext`. Not yet re-checked against the real G2 (T-002 step 3 / S-3).

## Canvas

| Property | Value |
|---|---|
| Resolution | 576 x 288 px per eye, origin top-left |
| Colour | 4-bit greyscale, values 0-15 (shown as 16 shades of green). 0 = off/transparent, 15 = brightest |
| Background | None. Unpainted pixels are transparent |
| Font | One LVGL font in firmware. No size, weight, italic or alignment control (always left-aligned). Glyphs missing from the font are silently skipped |

## Per-page container limits

| Limit | Value |
|---|---|
| Containers total | 12 max |
| Text + list containers | 8 max |
| Image containers | 4 max |
| Event-capture containers | **exactly 1** (`isEventCapture: 1`). Image containers cannot capture events |
| `containerID` | unique per page |
| `containerName` | unique per page, **16 chars max** |
| `zOrderIndex` (SDK 0.0.12+) | all containers set a unique value, or none do |

## Text containers

| Property | Range |
|---|---|
| x / y | 0-576 / 0-288 |
| width / height | 0-576 / 0-288 |
| `borderWidth` | 0-5 (drawn inside the container) |
| `borderColor` | 0-15 |
| `borderRadius` | 0-10 |
| `paddingLength` | 0-32, all four sides |
| `content` on `createStartUpPageContainer` | 1000 chars max |
| `content` on `rebuildPageContainer` | 1000 chars max |
| `content` on `textContainerUpgrade` | 2000 chars max |
| Empty content | not allowed: use a single space `' '` for a blank event layer |

Inner text area = container size minus `2 * (paddingLength + borderWidth)` on each axis. Measure text against the inner width, or a scrollbar appears.

## Font metrics (measured with pretext)

| Metric | Value |
|---|---|
| Line height | **27 px** (fixed) |
| Lines on a full-height screen | **10** (288 / 27, also 10 with padding 4) |
| Average advance, English sentence | ~8.8 px/char |

Characters per line (full-width 576 container):

| Inset (padding + border) | Inner width | Wide (`m`/`W`) | Typical sentence | Narrow (`i`) |
|---|---|---|---|---|
| 0 | 576 | 36 | ~65 | 115 |
| 4 (template default) | 568 | 35 | ~64 | 113 |
| 9 (pad 8 + border 1) | 558 | 34 | ~63 | 111 |

Budget **~60 characters per line** for sentence text and **~34** if a line may be all capitals. Use `measureTextWrap(text, innerWidth)` for anything that matters; do not trust character counts. Reference widths: `"Hello Nudge"` = 104 px, `"c _ p"` = 42 px, `"____"` = 36 px. A typical Step 1 frame (`"When my head hurts I take a ____ from the cabinet."`) = 442 px, one line.

`pretext` is not a project dependency yet. T-101 should request it (it is what the `text-heavy` template uses).

## List containers

| Property | Value |
|---|---|
| Items | 1-20 |
| Item label | 64 chars max |
| Item height | 40 px fixed |
| Item horizontal padding | 12 px per side |
| Update in place | not possible: rebuild the page to change items |
| Scrolling | handled by firmware |

## Image containers

| Property | Value |
|---|---|
| Width | **20-288 px** |
| Height | **20-144 px** |
| Format | 4-bit greyscale; SDK accepts `number[]`, `Uint8Array`, `ArrayBuffer` or base64 and converts common formats itself |
| Border / padding / event capture | not supported |
| On create | shows nothing until `updateImageRawData` is called |
| Transfer cost | ~0.5-2 s per frame over BLE (LZ4-compressed in 0.0.12+, no delta encoding) |
| Concurrency | one image update at a time; await each |

So the largest single picture is 288 x 144 (half the screen width, half the height). Up to 4 images per page. For T-106: line art at or below 288 x 144; mouth shapes can be smaller.

## Behaviour that affects layout

- `createStartUpPageContainer` is called **once**. After that use `rebuildPageContainer` (layout change, brief flicker) or `textContainerUpgrade` (text only, no flicker).
- `textContainerUpgrade` needs the exact `containerID` and `containerName`, or it silently does nothing.
- Serialize every bridge call and add a timeout of a few seconds; a bad BLE hop can hang ~30 s.
- Text updates are far faster than image updates, so anything that must feel instant (cue letters, the full word) should be text.

## Symbol glyphs (checked with `getAdvW`)

| In the font | Not in the font (advance 0, would be skipped) |
|---|---|
| `√` (13 px), `×` (10 px), `●` `○` `━` `─` (20 px), `>` | `✓` `✔` `✗` `✘` |

**For the `feedback` Screen, do not use ✓ / ✗.** Use `√` / `×`, or words ("Yes!" / "Try again"). Confirm on the device.

## Not given by the docs

- Whether a blank screen with a single-space event layer stays fully dark on the real G2 (S-3 item 3).
