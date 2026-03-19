

# Nature Theme — Immersive Background Redesign

## Current State
The nature theme has a flat `hsl(90 20% 97%)` background with a single `::before` pseudo-element adding 3 faint radial gradients at 35% opacity. This is barely visible and feels like plain white.

## What Changes

### 1. Multi-Layer Nature Background System (`index.css`)

Replace the single `#root::before` with a **3-layer composited background** directly on `#root` (no extra pseudo-elements needed):

**Layer 1 — Base canvas**: Warm parchment-green (`hsl(90 20% 96%)`) instead of near-white

**Layer 2 — Ambient color fields** (on `#root` background-image):
- Top-left: soft forest-green mist (`radial-gradient` at 10% 15%, primary/0.06)
- Center-right: warm golden sunlight patch (accent/0.04)
- Bottom: cool blue-green water wash (195 50% 60%/0.03)
- Top-right: faint lavender floral hint (280 40% 70%/0.025)

**Layer 3 — Organic texture** (`#root::before`):
- Ultra-subtle leaf-vein SVG pattern at 2-3% opacity, tiled
- This gives the "paper with natural fiber" feel without weight

### 2. Section-Aware Gradient Bands (`index.css`)

Add nature-mode utility classes that sections can opt into:
- `.nature-section-forest` — faint green tint strip
- `.nature-section-water` — cool blue-teal undertone
- `.nature-section-earth` — warm amber ground tone

These are just `background-image` gradients at 3-5% opacity, applied via existing section wrappers.

### 3. Token Adjustments (`.nature` block in `index.css`)

- `--background`: shift from `90 20% 97%` → `85 18% 95%` (warmer, more visible green tint)
- `--card`: `78 14% 93%` (slightly greener, distinct from bg)
- `--card-elevated`: `72 12% 90%` (layered depth)
- `--gradient-hero`: deeper green-to-background sweep
- `--gradient-glass`: warmer, more golden glass tint

### 4. Remove Current `::before` Hack, Use Proper Background

The current `::before` with `position: fixed` and z-index juggling is fragile. Replace with:
- Multi-gradient `background-image` directly on `.nature #root`
- SVG texture as a separate `::before` at very low opacity
- Remove the `z-index: 1` on all children (unnecessary complexity)

## Files to Modify

| File | Change |
|------|--------|
| `src/index.css` | Rework `.nature` tokens, replace `#root::before` with proper multi-layer background, add section utility classes |

No component files need changes — this is purely CSS token + background work.

