

# Restyle Category Cards: Square Images + Glassmorphism

## Problem
The category card images use `rounded-2xl` on both the outer card and inner image containers, making them look like rounded ovals/mirrors instead of clean squares like the Blinkit reference.

## Changes — `src/components/home/CategoryImageGrid.tsx`

1. **Reduce image rounding** — Change inner image containers from `rounded-2xl` to `rounded-xl` so product images appear more square/rectangular (matching the Blinkit reference)

2. **Add glassmorphism to the card** — Replace the solid `backgroundColor` with a semi-transparent version + `backdrop-blur`:
   - Card gets `backdrop-blur-xl` and `bg-white/10` (dark mode) or `bg-black/5` (light mode) layered with the teal tint
   - Add a subtle inner glow border: `border border-white/15`
   - The "+X more" badge keeps its current style

3. **Keep the teal tint** — The glassmorphism sits on top of the existing card background color but at reduced opacity (~70%), giving a frosted teal look that matches the brand

## Visual Result
```text
┌─────────────────────┐
│  ┌────┐  ┌────┐     │  ← Square-ish images (rounded-xl)
│  │ img│  │ img│     │
│  └────┘  └────┘     │  ← Frosted glass card bg
│      +14 more       │
│     Home Food       │
└─────────────────────┘
```

## Files Changed

| File | Change |
|------|--------|
| `src/components/home/CategoryImageGrid.tsx` | Reduce image rounding to `rounded-xl`, add glassmorphism (`backdrop-blur-xl`, semi-transparent bg, `border-white/15`) |

