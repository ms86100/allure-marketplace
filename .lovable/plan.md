

# WANGLOW Palette Extraction & Nature Theme Rebasing

## Colors Extracted from the Image (11 distinct tones)

| # | Color | HSL (approx) | Where in Image |
|---|-------|-------------|----------------|
| 1 | **Warm Studio Gray** | `0 0% 62%` | Background wall — calm, neutral, premium |
| 2 | **Light Limestone** | `40 15% 85%` | Pale pumice stones — warm off-white |
| 3 | **Dark Basalt** | `0 0% 25%` | Dark granite rocks — deep anchor |
| 4 | **Speckled Moss Stone** | `80 5% 65%` | Mid-gray stones with mineral texture |
| 5 | **Deep Forest Green** | `165 35% 25%` | Dark green bottle — the hero brand color |
| 6 | **Sage Teal** | `175 25% 55%` | Round soap puck + small cube — fresh, calming |
| 7 | **Warm Sand/Beige** | `30 20% 78%` | Light bottle body — organic, approachable |
| 8 | **Golden Amber** | `30 45% 50%` | Rough terracotta rock — earthy warmth |
| 9 | **Ivory/Pumice White** | `40 10% 90%` | Smooth stone paddle — soft surface |
| 10 | **Matte Black** | `0 0% 12%` | Pump tops, caps — sharp accents |
| 11 | **Light Table Surface** | `0 0% 82%` | Flat display surface — clean base |

## Color-to-Token Mapping

### Backgrounds
- **Page background**: Ivory/Pumice White (`40 10% 90%`) — the soft, warm canvas
- **Card surface**: Light Limestone (`40 15% 85%`) — distinct from bg, like the pale stones
- **Card elevated**: Light Table Surface (`0 0% 82%`) — slightly darker for layered depth
- **Header/Nav bg**: Warm Sand (`30 20% 78%` at low opacity) — organic, tinted glass

### Primary & Accent
- **Primary** (buttons, active states, links): Deep Forest Green (`165 35% 25%`) — the dark bottle
- **Accent** (badges, highlights, CTAs): Golden Amber (`30 45% 50%`) — the terracotta rock
- **Secondary**: Speckled Moss Stone (`80 5% 65%` lightened) — neutral but warm

### Text
- **Foreground**: Matte Black (`0 0% 12%`) — pump caps, highest contrast
- **Muted foreground**: Speckled Moss Stone (`80 5% 65%` darkened to ~45%) — secondary text
- **Primary foreground** (on green buttons): Ivory (`40 10% 90%`)

### Borders & Inputs
- **Border**: Light Table Surface (`0 0% 82%` lowered) — subtle, like the stone edges
- **Input border**: Warm Sand (`30 12% 76%`) — softer than generic gray
- **Ring/Focus**: Sage Teal (`175 25% 55%`) — the calming soap color for focus glow

### Semantic Colors
- **Success**: Deep Forest Green (same as primary)
- **Warning**: Golden Amber (`30 45% 50%`)
- **Info**: Sage Teal (`175 25% 55%`)
- **Destructive**: Muted terracotta-red (`8 40% 45%`) — kept warm, not harsh

### Section-Specific Usage
- **Category cards**: Alternate between Light Limestone and Warm Sand tinted backgrounds
- **Buy Again row**: Sage Teal tinted cards (`175 25% 55%` at 10% opacity)
- **Discovery sections**: Golden Amber accent badges
- **Store cards**: Dark Basalt text on Ivory backgrounds
- **Product image bg**: Ivory/Pumice White — clean product showcase

### Background System (replacing current green gradients)
- Replace all green-tinted radial gradients with WANGLOW-palette gradients:
  - Top: Warm Studio Gray mist (`0 0% 62% / 0.06`)
  - Center: Sage Teal hint (`175 25% 55% / 0.04`)
  - Bottom: Warm Sand wash (`30 20% 78% / 0.05`)
- SVG texture updated to use Stone Gray strokes instead of green
- Overall feel: warm mineral/stone texture, not leafy green

## File Changes

| File | Change |
|------|--------|
| `src/index.css` | Rewrite entire `.nature` token block with WANGLOW palette. Update `#root` background gradients, `::before`/`::after` textures, glass-card styles, button styles, scrollbar colors. Update section band utilities. |

No component files change — everything flows through CSS tokens.

## Design Intent

The current nature theme is too "forest green." The WANGLOW image communicates a different aesthetic: **mineral, stone, warm neutrals with deep green as an intentional accent, not a blanket.** The result should feel like a premium skincare brand — calm, tactile, sophisticated — not a plant nursery.

