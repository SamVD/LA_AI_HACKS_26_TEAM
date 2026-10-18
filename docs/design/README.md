# Nudge design (phone + G2)

Design artifacts for the **phone companion** (large type, high contrast, calm) and **G2 layouts** (576×288 green monochrome).

| Asset | Purpose |
| --- | --- |
| [`PAPER.md`](./PAPER.md) | Paper sponsor challenge notes for T-403 polish |
| [`GLASSES_LAYOUTS.md`](./GLASSES_LAYOUTS.md) | Container budgets per `Screen` kind (T-101 implements) |
| [`sketches/`](./sketches/) | Static SVG wireframes for all seven `Screen` kinds |
| `src/phone/theme/` | Tokens, CSS, `mountTokenDemo()` gallery (T-006) |

**Preview locally (after T-105 wires the companion, or temporarily from dev console):**

```ts
import { mountTokenDemo } from './phone/theme'
mountTokenDemo(document.body)
```
