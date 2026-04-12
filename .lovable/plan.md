

# UI Animation Audit — Remaining Items

## Status Summary

| Phase | Item | Status |
|-------|------|--------|
| 1 | Page transitions (`PageTransitionWrapper`) | ✅ Done — wraps Routes in App.tsx |
| 2 | Product card stagger in `MarketplaceSection` | ✅ Done — `staggerChildren: 0.05` |
| 2 | **ProductListingCard motion wrapper + add-to-cart micro-animation** | ❌ NOT done — no `motion` import, no `whileTap`, no checkmark pop |
| 3 | Skeleton shimmer | ✅ Done — CSS shimmer in `skeleton.tsx` |
| 3 | **ProductCardSkeleton component** | ❌ NOT done — file doesn't exist |
| 3 | **Skeleton → content crossfade (`AnimatePresence mode="wait"`)** | ❌ NOT done — MarketplaceSection has no crossfade logic |
| 4 | Cart item exit animation | ✅ Done — `AnimatePresence` + `motion.div` in CartPage |
| 5 | `LottieEmptyState` component | ✅ Done — component created |
| 5 | **LottieEmptyState used in pages** | ❌ NOT done — not imported in CartPage, OrdersPage, SearchPage, or FavoritesPage |
| 6 | Header entrance animation | ✅ Done |
| 6 | ParentGroupTabs sliding pill | ✅ Done |
| 6 | CategoryImageGrid tap/hover micro-interactions | ✅ Done (entrance animation present) |

## What's Still Remaining (4 items)

### 1. ProductListingCard — motion wrapper + add-to-cart feedback
The card has zero Framer Motion. Need to:
- Wrap outer element in `motion.div` with `cardEntrance` variant
- Add `whileTap={{ scale: 0.9 }}` on the add-to-cart button
- Add brief checkmark icon swap on add (200ms)
- Add `whileTap={{ scale: 0.85 }}` on quantity stepper buttons

**File:** `src/components/product/ProductListingCard.tsx`

### 2. ProductCardSkeleton + crossfade
Create a skeleton matching the card layout, and use `AnimatePresence mode="wait"` in MarketplaceSection to crossfade from skeleton → real content.

**Files:** New `src/components/product/ProductCardSkeleton.tsx`, modify `src/components/home/MarketplaceSection.tsx`

### 3. LottieEmptyState integration into pages
The component exists but is unused. Replace static empty states in:
- `CartPage.tsx`
- `OrdersPage.tsx`
- `SearchPage.tsx`
- `FavoritesPage.tsx`

### 4. Product image shimmer + crossfade
In `ProductListingCard`, replace raw `<img>` with an `onLoad` opacity transition so images fade in instead of flashing.

**File:** `src/components/product/ProductListingCard.tsx`

---

## How to Feel the Changes Already Done

The animations already implemented are subtle by design. Here's how to experience each one:

1. **Page transitions** — Navigate between any two pages (e.g., Home → Cart → back). You'll see a quick 150ms fade instead of a hard cut.
2. **Product grid stagger** — Scroll to any product section on the home page. Cards appear with a slight stagger delay (50ms between each).
3. **Cart item removal** — Add items to cart, then remove one. It slides out with an opacity + height animation instead of vanishing.
4. **Header entrance** — Reload the page. The header slides down 8px with a fade on first load.
5. **Category tab pill** — Tap between category tabs on the home page. The active indicator slides smoothly between tabs with a spring animation.
6. **Shimmer skeleton** — While content loads, skeleton placeholders show a moving shimmer gradient instead of a static pulse.

---

## Technical Details

**ProductListingCard changes:**
- Import `motion` from framer-motion and `cardEntrance` from motion-variants
- Wrap root `<div>` → `<motion.div variants={cardEntrance}>`
- Add-to-cart button: `<motion.button whileTap={{ scale: 0.9 }}>`
- Image: add `useState` for loaded state, render with `opacity` transition on load

**ProductCardSkeleton:** A simple component with `Skeleton` blocks matching card dimensions (image area + 3 text lines + button area).

**MarketplaceSection crossfade:** Wrap the loading/loaded state in `<AnimatePresence mode="wait">` with keyed children.

**LottieEmptyState integration:** Replace patterns like:
```tsx
<div className="flex flex-col items-center">
  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
    <span className="text-2xl">🛒</span>
  </div>
  <h2>Your cart is empty</h2>
</div>
```
With:
```tsx
<LottieEmptyState emoji="🛒" title="Your cart is empty" description="Browse products to add items" />
```

