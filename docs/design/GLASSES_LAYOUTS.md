# G2 layout sketches (576 × 288)

Reference for **T-101** (`GlassesUI`). Numbers come from [`DISPLAY_LIMITS.md`](../DISPLAY_LIMITS.md) and [`glasses-ui`](../vendor/even-skills/glasses-ui/SKILL.md).

**Firmware text (all layouts)**

- One font size only — **27 px line height**, always **left-aligned** (no bold, no centering API).
- Emphasis = spacing, borders, isolation in its own container, or letter spacing in content (`c _ p`).
- Approximate horizontal position for “centered” copy: `x = containerX + (innerWidth - measuredTextWidth) / 2` (use `pretext` in T-101).

**Global container rules**

- **Exactly one** `isEventCapture: 1` per page (dashed outline in SVGs). **Image containers cannot capture events.**
- Max **12** total, **8** text/list, **4** image. Images **20–288 × 20–144** px.
- Feedback symbols: **`√` / `×`** or words — not `✓` / `✗`.

**Cue ladder rule (ORCH):** the target word is hidden until level 3. Level 1 = visual only (picture in Step 1, mouth shape in Steps 2-3) plus context text. Level 2 = letters only (`c _ p` in Step 1, the first letter in Steps 2-3). Level 3 = the full word. No layout below may put `word` (or `items[index].word`) in a container at level 1 or 2.

SVG wireframes: [`screens/`](./screens/) (one file per row below).

---

## Summary table

| Layout | Text | List | Image | **Total** | Event capture |
| --- | ---: | ---: | ---: | ---: | --- |
| `blank` | 1 | 0 | 0 | **1** | full-screen text (`content: ' '`) |
| `prompt` | 1 | 0 | 0 | **1** | prompt text container |
| `cue` L1 | 1–2 | 0 | 1 | **2–3** | primary text block (not image) |
| `cue` L2 | 1 | 0 | 0 | **1** | masked-word text container |
| `cue` L3 | 1 | 0 | 0 | **1** | full-word text container |
| `feedback` | 1 | 0 | 0 | **1** | feedback text container |
| `candidates` L1 | 1–2 | 0 | 1 | **2–3** | candidate text container |
| `candidates` L3 | 1 | 0 | 0 | **1** | full-word text container |
| `menu` | 1 | 0 | 0 | **1** | single text container with `> ` marker (see §6) |
| `status` | 1 | 0 | 0 | **1** | status text container |

---

## 1. `blank`

| Container | x | y | w | h | evt | Notes |
| --- | ---: | ---: | ---: | ---: | :---: | --- |
| Text | 0 | 0 | 576 | 288 | **1** | `content: ' '` — invisible, captures touchpad |

**Counts:** 1 text · 0 list · 0 image · **1 total**

---

## 2. `prompt` (Step 1)

| Container | x | y | w | h | evt | Notes |
| --- | ---: | ---: | ---: | ---: | :---: | --- |
| Text | 8 | 99 | 560 | 81 | **1** | ~3 lines inner; one line typical (~60 chars) |

Example: `You drink from a ____.`

**Counts:** 1 · 0 · 0 · **1**

---

## 3. `cue` (Step 1 ladder)

Separate pages per level (rebuild page on level change).

### Level 1 — picture

| Container | x | y | w | h | evt | Notes |
| --- | ---: | ---: | ---: | ---: | :---: | --- |
| Image | 16 | 54 | 200 | 120 | 0 | `imageKey`, ≤288×144 |
| Text | 232 | 54 | 328 | 162 | **1** | `sentence` (the frame, wrapped to the box), or `' '` if none. **Never `word`** |

Optional frame text container: x=8, y=27, w=560, h=27 (not event capture).

**Counts:** 1–2 text · 0 list · 1 image · **2–3 total**

### Level 2 — masked letters

| Container | x | y | w | h | evt | Notes |
| --- | ---: | ---: | ---: | ---: | :---: | --- |
| Text | 8 | 108 | 560 | 81 | **1** | e.g. `c _ p` on one 27 px line |

**Counts:** 1 · 0 · 0 · **1**

### Level 3 — full word

| Container | x | y | w | h | evt | Notes |
| --- | ---: | ---: | ---: | ---: | :---: | --- |
| Text | 8 | 108 | 560 | 81 | **1** | e.g. `cup` |

**Counts:** 1 · 0 · 0 · **1**

---

## 4. `feedback`

| Container | x | y | w | h | evt | Notes |
| --- | ---: | ---: | ---: | ---: | :---: | --- |
| Text | 8 | 99 | 560 | 108 | **1** | Line 1: `√ cup` or `× cup`; line 2: `Yes` / `Try again` |

**Counts:** 1 · 0 · 0 · **1**

---

## 5. `candidates` (Steps 2–3)

### Level 1 — picture / mouth

| Container | x | y | w | h | evt | Notes |
| --- | ---: | ---: | ---: | ---: | :---: | --- |
| Image | 16 | 54 | 180 | 108 | 0 | mouth or picture |
| Text | 208 | 54 | 360 | 135 | **1** | position (`1/3`) and a short hint line. **Never the word.** Image box shows `mouthKey ?? imageKey`; with neither, show text only |

Optional hint line in same text container (third line).

**Counts:** 1–2 text · 0 · 1 image · **2–3 total**

### Level 3 — full word

| Container | x | y | w | h | evt | Notes |
| --- | ---: | ---: | ---: | ---: | :---: | --- |
| Text | 8 | 99 | 560 | 108 | **1** | full word + meta lines |

**Counts:** 1 · 0 · 0 · **1**

Level 2 (first letter only) uses one text container, same geometry as L3, content e.g. `c` + `· L2`.

---

## 6. `menu`

_ORCH correction (CONTRACT_VERSION 2): **not** a list container. A firmware list scrolls internally on swipes without firing events, and its click carries an item index that `Intent` cannot pass to the mode. Use one text container. The mode moves `index` on NEXT/PREV, and the renderer redraws it with `textContainerUpgrade`._

| Container | x | y | w | h | evt | Notes |
| --- | ---: | ---: | ---: | ---: | :---: | --- |
| Text | 8 | 27 | 560 | 243 | **1** | Line 1: `title`; then one item per 27 px line, `> ` before `items[index]`, two spaces before the others |

**Visible items:** 8 lines below the title. With more items, show a window of 8 around `index`.

Example:
```
Nudge
> Step 1  Practice
  Step 2  Assist
  Word bank
```

**Counts:** 1 text · 0 list · 0 image · **1 total**

---

## 7. `status`

| Container | x | y | w | h | evt | Notes |
| --- | ---: | ---: | ---: | ---: | :---: | --- |
| Text | 8 | 54 | 560 | 189 | **1** | Wrap at ~60 chars/line; mic/network errors |

**Counts:** 1 · 0 · 0 · **1**
