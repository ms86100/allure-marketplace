

# UI, Animation & Smoothness Audit — Sociva Marketplace

## Current State Assessment

**Already Strong:**
- Framer Motion used across 69 files with a well-structured `motion-variants.ts` preset system
- BottomNav has polished `layoutId` pill animation with haptic feedback
- FloatingCartBar has spring-based entrance/exit and "Added ✓" micro-feedback
- LazySection uses IntersectionObserver for deferred rendering with fade-slide entrance
- Design token system is comprehensive (light/dark, glassmorphism, shadows)
- shadcn/ui components are consistently styled

**Stack Context:** This is a **Vite + React** project (not Next.js). GSAP, Lottie, and React Aria are NOT installed. Recharts IS installed.

---

## Gap Analysis (Prioritized)

### P0 — Perceptual Performance (Biggest UX Impact)

| # | Gap | Current | Impact |
|---|-----|---------|--------|
| 1 | **No page transitions** | Route changes are instant hard cuts — no AnimatePresence wrapper around Routes | Feels jarring, breaks flow continuity |
| 2 | **ProductListingCard has zero motion** | Pure CSS `transition-all` only. No stagger entrance, no add-to-cart scale pop | Product grid feels static/lifeless compared to Blinkit/Zepto |
| 3 | **Skeleton → content has no crossfade** | Loading states use basic `animate-pulse`, content pops in abruptly | Perceived load time feels longer |
| 4 | **Cart item removal has no exit animation** | Items disappear instantly from cart list | Feels broken, no confirmation of action |

### P1 — Delight & Polish

| # | Gap | Current | Impact |
|---|-----|---------|--------|
| 5 | **Empty states are plain emoji circles** | Static `<div>` with emoji, no motion | Missed emotional moment — Lottie-style animations here add perceived quality |
| 6 | **No add-to-cart celebration** | Only toast notification + FloatingCartBar bounce | No on-card feedback (Zepto does a checkmark pop on the button itself) |
| 7 | **Header has no entrance polish** | Renders statically on mount | Minor but contributes to "flat" initial load feel |
| 8 | **Product image has no loading placeholder** | Raw `<img>` tag, flash of empty space | Should shimmer then crossfade |

### P2 — Advanced (Blinkit/Swiggy Parity)

| # | Gap | Current | Impact |
|---|-----|---------|--------|
| 9 | **No gesture interactions** | Cart items can't be swiped to delete | Mobile UX expectation from top-tier apps |
| 10 | **Category grid tabs have no indicator animation** | ParentGroupTabs uses static styling for active state | Should have sliding underline/pill like Swiggy |
| 11 | **Order timeline has no progressive reveal** | Renders all visible steps at once | Should animate each step sequentially |

---

## Implementation Plan

### Phase 1: Page Transitions (P0 #1)
- Create a `PageTransitionWrapper` component using `AnimatePresence` + `motion.div` with `pageTransition` variants from `motion-variants.ts`
- Wrap the router outlet in `App.tsx` with this component
- Use `useLocation().key` as the animation key
- Keep transitions fast (150ms fade) to not feel sluggish

**Files:** New `src/components/layout/PageTransitionWrapper.tsx`, modify `src/App.tsx` (router setup)

### Phase 2: Product Card Motion (P0 #2 + P1 #6)
- Wrap `ProductListingCard` in `motion.div` using `cardEntrance` variant
- Add stagger via parent `staggerContainer` in `MarketplaceSection.tsx` discovery rows
- Add-to-cart button: `whileTap={{ scale: 0.9 }}` + brief checkmark icon swap (200ms)
- Quantity stepper (+/-): `whileTap={{ scale: 0.85 }}` for tactile feel

**Files:** Modify `src/components/product/ProductListingCard.tsx`, `src/components/home/MarketplaceSection.tsx`

### Phase 3: Skeleton Shimmer Crossfade (P0 #3 + P1 #8)
- Add CSS shimmer keyframe to `index.css` (already defined in tailwind config but not applied)
- Create a `ShimmerCard` component matching ProductListingCard dimensions
- Use `AnimatePresence mode="wait"` to crossfade skeleton → real content
- Apply to product images: use `onLoad` callback + opacity transition

**Files:** Modify `src/components/ui/skeleton.tsx`, new `src/components/product/ProductCardSkeleton.tsx`, modify `src/components/home/MarketplaceSection.tsx`

### Phase 4: Cart Item Exit Animation (P0 #4)
- Wrap cart item list in `AnimatePresence`
- Each item gets `motion.div` with `exit={{ opacity: 0, x: -60, height: 0 }}` and `layout` prop for smooth reflow
- Add `layoutId` per cart item for smooth transitions

**Files:** Modify `src/pages/CartPage.tsx`

### Phase 5: Lottie Empty States (P1 #5)
- Install `lottie-react`
- Replace emoji circles in CartPage, OrdersPage, SearchPage, and FavoritesPage empty states with lightweight Lottie JSON animations (use free LottieFiles assets — empty cart, no results, etc.)
- Wrap in `motion.div` with `emptyState` variant from motion-variants.ts

**Files:** `package.json` (add lottie-react), new `src/components/ui/LottieEmptyState.tsx`, modify empty state sections in CartPage, OrdersPage, SearchPage, FavoritesPage

### Phase 6: Micro-Interactions Polish (P1 #7, P2 #10)
- **Header**: Add subtle `initial={{ opacity: 0, y: -8 }}` entrance on mount
- **ParentGroupTabs**: Add `layoutId="tab-indicator"` sliding pill/underline on the active tab
- **Category cards**: Add `whileHover={{ y: -2 }}` and `whileTap={{ scale: 0.97 }}` for tactile feel

**Files:** Modify `src/components/layout/Header.tsx`, `src/components/home/ParentGroupTabs.tsx`, `src/components/home/CategoryImageGrid.tsx`

---

## What NOT to Add (Engineering Discipline)

| Tool | Decision | Reason |
|------|----------|--------|
| **GSAP** | Skip | Framer Motion covers all current needs. GSAP adds 45KB+ for marginal benefit. Only justified if adding delivery map tracking animations later. |
| **React Aria** | Skip | Radix UI (already installed via shadcn) provides equivalent accessibility primitives. Redundant. |
| **Next.js** | N/A | Project is Vite-based with Capacitor native app support. Migration would break mobile builds. |

**Lottie** is the only new dependency — lightweight (8KB gzipped) with high visual payoff for empty/success states.

---

## Files Summary

| File | Change |
|------|--------|
| `src/components/layout/PageTransitionWrapper.tsx` | New — AnimatePresence route wrapper |
| `src/App.tsx` | Wrap router outlet with PageTransitionWrapper |
| `src/components/product/ProductListingCard.tsx` | Add motion wrapper, add-to-cart micro-animation |
| `src/components/product/ProductCardSkeleton.tsx` | New — shimmer skeleton matching card layout |
| `src/components/home/MarketplaceSection.tsx` | Add stagger container to product grids |
| `src/pages/CartPage.tsx` | AnimatePresence for item removal, layout animations |
| `src/components/ui/LottieEmptyState.tsx` | New — reusable Lottie empty state component |
| `src/components/ui/skeleton.tsx` | Enhanced shimmer effect |
| `src/components/layout/Header.tsx` | Subtle entrance animation |
| `src/components/home/ParentGroupTabs.tsx` | Sliding active tab indicator |
| `src/components/home/CategoryImageGrid.tsx` | Tap/hover micro-interactions |
| `src/index.css` | Shimmer keyframe refinement |
| `package.json` | Add `lottie-react` |

---

## Safety
- All animations use existing `motion-variants.ts` presets where possible
- No structural changes to routing or state management
- Backward compatible — components render identically if animations fail to load
- Performance: all animations use `transform`/`opacity` only (GPU-composited, no layout thrash)
- Lottie JSONs are static assets, no runtime network dependency

