# G2 layout sketches (576 × 288)

Reference for **T-101** (`GlassesUI`). Numbers come from [`DISPLAY_LIMITS.md`](../DISPLAY_LIMITS.md).

**Global rules**

- Exactly **one** event-capture container per page (`blank` uses a space character in a full-screen text container).
- Max **12** containers, **8** text/list, **4** images. Images **20–288** wide, **20–144** tall.
- Line height **27 px** (~10 lines max). Sentence prompts: budget **~60 characters** per line at full width.
- Feedback: use **`√` / `×`** or words — not `✓` / `✗` (missing from firmware font).
- Prefer **text** for fast cue updates; images for level-1 cues only.

SVG wireframes: [`sketches/`](./sketches/).

---

## 1. `blank`

| Element | x | y | w | h | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Event text layer | 0 | 0 | 576 | 288 | `content: ' '`, `isEventCapture: 1` |

Nothing visible; touchpad/swipes still route to intents.

---

## 2. `prompt` (Step 1)

| Element | x | y | w | h | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Sentence | 8 | 96 | 560 | 96 | Single line typical; wrap if frame &gt; inner width |

Vertically center if one line; leave bottom clear for future hint text.

---

## 3. `cue` (Step 1 ladder)

| Level | Layout |
| --- | --- |
| **1** | Image **200×120** (max 288×144) left; optional frame text top |
| **2** | Large masked word (`c_p`) in text container, centered |
| **3** | Full word, centered |

| Element | x | y | w | h | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Picture (L1) | 16 | 72 | 200 | 120 | `imageKey` |
| Text block | 240 | 72 | 320 | 144 | masked or full word |
| Frame (optional) | 8 | 24 | 560 | 40 | `sentence` one line |

---

## 4. `feedback`

| Element | x | y | w | h | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Result | 8 | 80 | 560 | 128 | `√ cup` or `× cup` + short subtitle |

Auto-advance after pause (mode logic); no extra images.

---

## 5. `candidates` (Steps 2–3)

| Element | x | y | w | h | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Visual (L1) | 16 | 64 | 180 | 108 | mouth or picture |
| Word + meta | 210 | 64 | 350 | 120 | word, level, index |
| Hint line | 8 | 200 | 560 | 24 | swipe / tap legend (optional, short) |

**L2:** first letter large. **L3:** full word. `NEXT`/`PREV` change `index`; `SELECT` bumps `level`.

---

## 6. `menu`

| Element | x | y | w | h | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Title | 8 | 40 | 560 | 40 | `title` |
| Items | 8 | 88 + 44×i | 560 | 40 | list container or stacked text; highlight `index` |

List item height **40 px** fixed per SDK; max **20** items.

---

## 7. `status`

| Element | x | y | w | h | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Message | 8 | 72 | 560 | 144 | Wrap errors: mic, network, timeout |

Used for STT errors and short system messages; keep copy plain language.
