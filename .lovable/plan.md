

## Fix: Category Image Tiles Too Tall on Desktop

### Problem
Each category tile uses `aspect-square` on `w-full` in a 4-column grid. On the user's 1336px viewport, each tile is ~300px × 300px — far too large for category navigation. The multi-product image grid inside (2×2 or 2-col) is fine conceptually, but the container is too big.

### Fix: Constrain tile height with a shorter aspect ratio + responsive columns

Keep the existing multi-image layout (2×2 product images per category) since the user explicitly wants that. Just fix the sizing:

1. **Replace `aspect-square` with `aspect-[4/3]`** — reduces tile height by 25% while keeping the product image collage readable.

2. **Add responsive column scaling**: Change grid from fixed `grid-cols-4` to `grid-cols-4 md:grid-cols-5 lg:grid-cols-6` so tiles shrink on wider screens instead of stretching to ~300px.

3. **Cap max tile width**: Add `max-w-[180px] mx-auto` on each tile so they never grow beyond a reasonable size regardless of viewport.

### Files Changed

| File | Change |
|---|---|
| `src/components/home/CategoryImageGrid.tsx` | Change `aspect-square` → `aspect-[4/3]`, add responsive cols `md:grid-cols-5 lg:grid-cols-6`, cap tile width at 180px |

