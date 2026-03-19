

# Sociva UX Transformation — Remaining Gaps & Fixes

## What Already Exists (No Work Needed)
- Feedback Engine centralized in `feedbackEngine.ts` ✓
- ETA Engine with single `computeETA()` ✓
- Visibility Engine with route rules ✓
- Floating Cart Bar with bounce animation ✓
- Active Order ETA in header with live countdown ✓
- Active Order Strip on home with transit pulse ✓
- Search Autocomplete with thumbnails ✓
- Recently Viewed section ✓
- Undo on cart item removal ✓
- Cart is single-scroll checkout ✓
- Optimistic cart updates with mutex ✓

---

## 20 UX Gaps Identified

### Gap 1: Double haptic on ProductCard
**Violated**: Consistency (H4). `ProductCard.tsx` lines 49-53 call `hapticImpact('medium')` before `addItem()` / `updateQuantity()`, which already fire haptics via `feedbackEngine`. Result: double haptic on every tap.
**Fix**: Remove manual `hapticImpact` calls from `ProductCard.tsx` handlers.
**Risk**: None.

### Gap 2: Double haptic on ProductDetailSheet
**Violated**: Consistency (H4). Lines 216-228 call `hapticImpact('medium')` before `d.handleAdd()` and `d.updateQuantity()`.
**Fix**: Remove manual `hapticImpact` calls from `ProductDetailSheet.tsx` add/quantity handlers.
**Risk**: None.

### Gap 3: Double haptic on CartPage quantity steppers
**Violated**: Consistency (H4). Lines 142-144 call `hapticImpact('medium')` before `c.updateQuantity()`.
**Fix**: Remove `hapticImpact` import and calls from `CartPage.tsx` stepper buttons.
**Risk**: None.

### Gap 4: Direct toast calls in CouponInput
**Violated**: Consistency (H4) — feedback should flow through engine. `CouponInput.tsx` uses `toast.success/error` directly for coupon actions.
**Fix**: Create `feedbackCouponApplied(savings)` and `feedbackCouponFailed(reason)` in `feedbackEngine.ts`. Update `CouponInput.tsx` to use them.
**Risk**: None.

### Gap 5: CartPage still imports `hapticImpact` and `toast` directly
**Violated**: Consistency enforcement. Even after fixing steppers, the `CartPage` file still has raw imports that violate the engine contract.
**Fix**: Remove unused `hapticImpact` and `toast` imports after fixing Gap 3.
**Risk**: None.

### Gap 6: ProductGridCard has no haptic on add-to-cart
**Violated**: Consistency (H4). `ProductGridCard.tsx` line 61 calls `addItem(product)` without any haptic — relying entirely on the engine, which is correct. But `handleIncrement`/`handleDecrement` (lines 62-63) call `updateQuantity` without haptic — also correct since engine handles it. **However**, the file still imports `hapticImpact` (line 4) which is unused for cart actions — only `hapticSelection` is used for card tap. Clean up the unused import.
**Fix**: Remove `hapticImpact` from import in `ProductGridCard.tsx` (only `hapticSelection` needed).
**Risk**: None.

### Gap 7: No feedback for wishlist/favorite toggle
**Violated**: Product Law #1 — every action needs consistent feedback. `FavoritesPage.tsx` and favorite toggle likely have no centralized feedback.
**Fix**: Add `feedbackFavoriteToggled(added: boolean, name: string)` to `feedbackEngine.ts`. Integrate where favorite toggle occurs.
**Risk**: Low.

### Gap 8: No "Add more items" shortcut from Cart page
**Violated**: Screen self-sufficiency (H7). Cart page has no quick way to add more items without navigating back.
**Fix**: Add a "Browse more" link/button below the last seller group in `CartPage.tsx` that links to `/search`.
**Risk**: None.

### Gap 9: Confirm dialog adds unnecessary step to checkout
**Violated**: Flow compression — the confirm dialog (lines 271-288) adds a full extra confirmation step. Blinkit doesn't have this.
**Fix**: Remove the confirm dialog for COD orders. Keep it only for UPI/Razorpay (since payment is irreversible). For COD, "Place Order" button directly places the order.
**Risk**: Low — reduces friction, preserves safety for payments.

### Gap 10: "Placing..." text on Place Order button uses spinner-like pattern
**Violated**: Zero spinner policy. Line 267 shows `'Placing...'` which is passive text.
**Fix**: Already has `OrderProgressOverlay` (line 290) which is good. The button text change is fine as a micro-interaction. No change needed — this is acceptable.

### Gap 11: No section breathing room on HomePage
**Violated**: Aesthetic/minimalist design (H8). All sections are stacked without visual separation.
**Fix**: Add subtle dividers or spacing between major sections (ActiveOrderStrip, SearchSuggestions, MarketplaceSection, etc.) using a `SectionDivider` component — a thin `<hr>` with margin.
**Risk**: None.

### Gap 12: Floating cart bar hidden on category pages
**Violated**: Cart omnipresence (Law #4). `CART_HIDDEN_ROUTES` only hides on `/cart` and `/checkout`, but need to verify it's actually visible on category and seller detail pages.
**Fix**: Audit and confirm FloatingCartBar renders on `/category/*`, `/seller/*`, `/search`. If not, fix `AppLayout` `showCart` prop.
**Risk**: None.

### Gap 13: No empty-state feedback when clearing cart
**Violated**: Feedback consistency. Clearing cart shows no toast/haptic.
**Fix**: Add `feedbackCartCleared()` to `feedbackEngine.ts` with light haptic + toast. Call from `useCart.clearCart()`.
**Risk**: None.

### Gap 14: Coupon haptic is duplicated
**Violated**: Consistency. `CouponInput.tsx` calls `hapticImpact('medium')` directly (line 101, 125). Should use feedback engine.
**Fix**: Covered by Gap 4 — the new `feedbackCouponApplied` function will include haptic.
**Risk**: None.

### Gap 15: ProductCard still calls haptic for non-cart actions
**Violated**: Consistency. `ProductCard.tsx` line 49 fires `hapticImpact('medium')` even for non-cart actions (enquiry, contact). These should use `hapticSelection` instead.
**Fix**: Change non-cart action path to `hapticSelection()` instead of `hapticImpact('medium')`.
**Risk**: None.

### Gap 16: Search page shows fallback seller name 'Seller'
**Violated**: No dummy data policy. `SearchPage.tsx` line 59 has `seller_name: product.seller_name || 'Seller'`.
**Fix**: Replace with empty string or hide seller name when missing.
**Risk**: None.

### Gap 17: ProductDetailSheet fallback 'Seller' text
**Violated**: No dummy data. Line 171 has `seller_name: sp.seller?.business_name || 'Seller'`.
**Fix**: Use empty string fallback.
**Risk**: None.

### Gap 18: CartPage fallback 'Seller' text
**Violated**: No dummy data. Line 202 has `c.sellerGroups[0]?.sellerName || 'Seller'`.
**Fix**: Use empty string or hide when missing.
**Risk**: None.

### Gap 19: No visual confirmation when quantity changes on CartPage
**Violated**: Instant feedback (H1). Quantity stepper changes are silent visually — no scale animation on the number.
**Fix**: Wrap the quantity `<span>` in a `motion.span` with a key-based scale pop animation on quantity change.
**Risk**: None.

### Gap 20: picsum.photos fallback in ProductGridCard
**Violated**: No dummy data policy. Line 72: `product.image_url || \`https://picsum.photos/seed/${product.id}/300/300\``. This loads random external images for products with no image.
**Fix**: Replace with a styled placeholder div showing a package icon or the category emoji.
**Risk**: None.

---

## Implementation Plan

### Phase 1 — Haptic Deduplication & Feedback Consistency (5 files)

1. **`ProductCard.tsx`**: Remove `hapticImpact('medium')` from `handleAdd`, `handleIncrement`, `handleDecrement`. Use `hapticSelection()` for non-cart tap path only.
2. **`ProductDetailSheet.tsx`**: Remove all `hapticImpact('medium')` calls before `d.handleAdd()` and `d.updateQuantity()`.
3. **`CartPage.tsx`**: Remove `hapticImpact('medium')` from stepper buttons. Remove unused `hapticImpact` import and `toast` import.
4. **`ProductGridCard.tsx`**: Remove `hapticImpact` from import (keep `hapticSelection` only).
5. **`feedbackEngine.ts`**: Add `feedbackCouponApplied(savings: string)`, `feedbackCouponFailed(reason: string)`, `feedbackCartCleared()`, `feedbackFavoriteToggled(added: boolean, name: string)`.

### Phase 2 — Dummy Data Elimination (3 files)

6. **`SearchPage.tsx`**: Replace `|| 'Seller'` with `|| ''`.
7. **`ProductDetailSheet.tsx`**: Replace `|| 'Seller'` with `|| ''`.
8. **`ProductGridCard.tsx`**: Replace picsum.photos fallback with a styled placeholder div.

### Phase 3 — Micro-interaction Polish (3 files)

9. **`CartPage.tsx`**: Add quantity pop animation on stepper number. Add "Browse more" link below cart items.
10. **`CouponInput.tsx`**: Replace direct `toast`/`haptic` calls with feedback engine functions.
11. **`HomePage.tsx`**: Add `SectionDivider` spacing between major sections.

### Phase 4 — Flow Optimization (1 file)

12. **`CartPage.tsx`**: Remove confirm dialog for COD orders — button directly places order. Keep confirm only for online payment methods.

---

## Technical Details

- **Feedback engine additions**: 4 new exported functions following existing pattern (haptic → toast → dispatch)
- **Haptic dedup**: ~12 lines removed across 4 components
- **Fallback cleanup**: ~5 string replacements
- **Animation**: 1 `motion.span` addition with `key={quantity}` for auto-animate
- **Section dividers**: Simple `<div className="h-px bg-border mx-4 my-3" />` between HomePage sections

## Guarantees

| Check | Status |
|-------|--------|
| Zero hardcoded data | Removing picsum + 'Seller' fallbacks |
| No broken flows | All changes are additive or removal of duplicates |
| No new backend | Zero DB/edge function changes |
| Cart globally accessible | Already done — verifying visibility |
| Feedback consistent | Centralizing remaining outliers into engine |
| No spinner blocking | Already handled via optimistic UI |

