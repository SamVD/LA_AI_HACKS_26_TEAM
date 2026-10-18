# Nudge design (phone + G2)

| Asset | Purpose |
| --- | --- |
| [`PAPER.md`](./PAPER.md) | Paper sponsor challenge notes |
| [`DEVPOST_ASSETS.md`](./DEVPOST_ASSETS.md) | PNG + SVG index for Devpost / slides |
| [`GLASSES_LAYOUTS.md`](./GLASSES_LAYOUTS.md) | Container specs + event capture (T-101) |
| [`screens/`](./screens/) | 576×288 SVG wireframes |
| `src/phone/theme/` | Tokens, CSS, demos |

**Preview (dev)**

- Slim launcher: http://localhost:5173/src/phone/theme/demo.html (375px-wide shell)
- Full gallery: import `mountTokenDemo` from `src/phone/theme`

**Regenerate SVGs**

```bash
npx tsx -e "
import { writeFileSync, mkdirSync } from 'fs'
import { LAYOUT_SKETCH_IDS, renderLayoutSketch } from './src/phone/theme/renderGlassesSketch.ts'
mkdirSync('docs/design/screens', { recursive: true })
for (const id of LAYOUT_SKETCH_IDS) writeFileSync(\`docs/design/screens/\${id}.svg\`, renderLayoutSketch(id))
"
```
