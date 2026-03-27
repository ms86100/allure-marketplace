

# Fix: Clean Up Category Card Outer Layer

## Problem
The outer card shell has a visible `border-white/20` outline and a heavy `boxShadow` with color-matched glow + inset highlight. On the dark teal cards, this creates a noticeable "frame" effect that looks unnatural.

## Fix — `src/components/home/CategoryImageGrid.tsx`

1. **Remove the visible border** — drop `border border-white/20` entirely
2. **Simplify the shadow** — replace the complex `boxShadow` with a subtle, simple shadow: `shadow-lg` or a minimal `0 2px 12px rgba(0,0,0,0.15)`
3. **Keep `backdrop-blur-2xl`** for the glass feel but let the card blend more naturally without an explicit border frame

The result: same teal frosted card, same floating thumbnails, but without the awkward outlined "frame" around each tile.

## File Changed

| File | Change |
|------|--------|
| `src/components/home/CategoryImageGrid.tsx` | Remove `border border-white/20`, simplify `boxShadow` to a subtle drop shadow |

