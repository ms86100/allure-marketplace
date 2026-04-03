

# Festival Banner Module — UX Overhaul

## The Problem (What the screenshot reveals)

Looking at the current UI with a senior architect's eye:

1. **Dead visual weight** — The gradient header is tall but the section chips area below is a flat, dark void with tiny chips lost in space. The ratio is wrong: 40% decoration, 60% emptiness.
2. **No visual hierarchy in chips** — All 3 chips look identical. "Home Cooked Meals" has 2 items with thumbnails; "Snacks & Bites" and "Fresh Beverages" have nothing — yet they take equal space and look equally important. Empty chips destroy trust.
3. **Chips are too small and clinical** — 112px wide boxes with tiny 11px text, 24px emojis, and a lonely chevron. No warmth, no invite to tap.
4. **No transition between header and content** — Hard color cut from orange gradient to dark card. Feels like two unrelated UI blocks glued together.
5. **No product tease** — The header says "New Arrivals" but shows zero products. Buyer has no incentive to tap anything — the "reward" is hidden behind a click.
6. **Badge feels disconnected** — "Just Landed" pill floats in the top-right with low contrast white-on-orange.
7. **Empty sections visible** — "Snacks & Bites" and "Fresh Beverages" show with just an emoji and chevron — no count, no thumbnails. This looks broken, not "coming soon."

## The Fix — 7 Targeted Changes (No new backend features)

### 1. Gradient bleeds into chips area
Instead of a hard `bg-card` cut, extend a faded version of the banner gradient as a subtle top background on the chips container — `linear-gradient(to bottom, ${gradient[gradient.length-1]}15, transparent)`. Creates visual continuity.

### 2. Hide truly empty sections by default
If a section resolves to 0 products AND fallback also returns 0, hide the chip entirely regardless of `fallback_mode`. No buyer should ever see an empty chip — it signals a broken UI. Currently it only hides when `fallback_mode === 'hide'`; change to always hide 0-product chips.

### 3. Larger, warmer chip design
- Increase chip width from `w-28` (112px) → `w-36` (144px)
- Emoji size from `text-2xl` → `text-3xl`
- Title from `text-[11px]` → `text-xs` (12px)
- Add subtle gradient tint background matching banner theme (5% opacity of accent color)
- Round thumbnails to circles instead of squares for personality
- Remove the lonely `ChevronRight` icon at bottom — the whole chip is a button, the arrow adds noise

### 4. Product peek row in header
Show 3-4 circular product thumbnails in the header area itself (below subtitle). This gives the buyer an immediate "taste" of what's inside before they even look at the chips. Fetch from the first section's resolved products.

### 5. Item count as a confidence signal
Move item count from tiny `text-[9px]` below the title to a bolder pill: `"12 items →"` at the bottom of the chip in the accent color. Makes it look tappable and valuable.

### 6. Entrance animation
Chips should stagger-animate in with `animate-fade-in` (already exists in tailwind config). Each chip gets `animation-delay: ${index * 80}ms`. The header gets a subtle `animate-scale-in`. Zero new CSS needed — reuse existing animation utilities.

### 7. Compact "no products" state
When ALL sections are empty (entire banner is a ghost), hide the entire `FestivalBannerModule` — not just individual chips. Currently it renders the gradient header with an empty chips area.

---

## Files Changed

### `src/components/home/FestivalBannerModule.tsx`
- Gradient bleed: add `style` to chips container with faded gradient from banner theme
- Product peek: query first section's products, render 3-4 circular thumbnails in header
- Always-hide empty chips: remove `fallbackMode === 'hide'` condition, just hide if 0 products
- Hide entire module if all sections resolve to 0
- Chip redesign: wider, larger emoji, themed tint background, circular thumbnails, pill-style count, remove chevron
- Staggered fade-in animation on chips using existing `animate-fade-in` + delay

### `src/index.css`
- No changes needed — existing animations sufficient

### No database changes. No admin changes. No new tables.

---

## What This Achieves

- **Before**: A flat, clinical module that looks like a skeleton loader with data missing
- **After**: A warm, animated, product-forward discovery surface that rewards exploration
- **Time to implement**: ~30 minutes (single component rewrite)
- **Risk**: Zero — purely cosmetic, no data model or API changes

