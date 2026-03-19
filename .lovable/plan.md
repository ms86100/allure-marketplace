

# Phase 2: Perception Layer — Behavioral UX Enhancements

## What Already Exists
- Floating Cart Bar with thumbnails, bounce, visibility engine ✓
- ActiveOrderETA header strip with live countdown ✓
- ActiveOrderStrip on home with transit pulse ✓
- ETA Engine (`computeETA`, `compactETA`) ✓
- Feedback Engine centralized ✓
- Order placed celebration banner (🎉 on OrderDetailPage) ✓
- DeliveryArrivalOverlay with proximity detection ✓
- OrderProgressOverlay with multi-step stages ✓
- Undo on cart item removal ✓

---

## 1. ETA Emotional States

**Current**: `computeETA` returns static text like "Estimated arrival in 12 min". No emotional variation.

**Target**: Add emotional emoji + color tiers to ETAResult, used by both `DeliveryETABanner` and `ActiveOrderETA`.

**Changes**:
- **`src/lib/etaEngine.ts`**: Add `emoji` and `mood` ('calm' | 'eager' | 'imminent' | 'late') fields to `ETAResult`. Map: >30min → 😊 calm, 10-30min → 🚀 eager, ≤10min → ⚡ imminent, late → 🕐 late.
- **`src/components/order/DeliveryETABanner.tsx`**: Show emoji, use mood-based gradient backgrounds (green for imminent, amber for late).
- **`src/components/header/ActiveOrderETA.tsx`**: Show emoji inline with status label. Pulse animation intensifies for 'imminent' mood.

---

## 2. Cart Momentum — Post-Add Directionality

**Current**: After adding item, floating cart bar bounces. No directional nudge.

**Target**: When cart hits a "momentum threshold" (e.g., 3+ items), the floating cart bar CTA text changes from "View Cart" to "Checkout →" and links to `/cart` (same destination, but psychological push).

**Changes**:
- **`src/components/cart/FloatingCartBar.tsx`**: When `itemCount >= 3`, change CTA text to "Checkout →". Add a subtle shimmer animation on the CTA when transitioning from 2→3 items.

---

## 3. Mini Cart Preview

**Current**: Floating cart shows thumbnails + count + total. Tapping goes to full cart page.

**Target**: Long-press or swipe-up on floating cart shows a compact preview sheet (last 3 items with names + prices) without navigating away. No new backend — uses existing `items` from `useCart`.

**Changes**:
- **`src/components/cart/FloatingCartBar.tsx`**: Add a `Sheet` (bottom drawer) triggered by a small "expand" tap target. Shows last 3 items with thumbnail, name, price. "View Full Cart" button at bottom. Uses existing `items` data from `useCart()`.

---

## 4. Delivery Completion Celebration

**Current**: When order reaches 'delivered'/'completed', OrderDetailPage shows a static reorder card and feedback prompt. No celebratory moment.

**Target**: Show a brief animated celebration banner when buyer first views a delivered order — "Delivered in X min!" with a success animation. Uses existing `order.created_at` and `order.updated_at` to compute actual delivery time.

**Changes**:
- **`src/pages/OrderDetailPage.tsx`**: Add a celebration banner for `delivered`/`completed` status similar to the existing `placed` celebration. Show actual delivery duration computed from `created_at` to `updated_at`. Gate with `persistent-kv` to show only once per order.

---

## 5. Intelligent Empty States

**Current**: Empty states on OrdersPage, FavoritesPage, SearchPage are generic with static icons and text.

**Target**: Make empty states contextual and actionable — suggest next steps based on user state.

**Changes**:
- **`src/pages/OrdersPage.tsx`**: Buyer empty state: Show "Place your first order" with link to marketplace. Include a subtle animation.
- **`src/pages/FavoritesPage.tsx`**: Empty state already good ("Tap the heart icon..."). Add a pulsing heart animation for delight.
- **`src/pages/SearchPage.tsx`**: `EmptyState` already has "Search nearby societies" option. No change needed.

---

## 6. Session Continuity — Restore Scroll Position

**Current**: Navigating back to HomePage or SearchPage resets scroll to top. User loses browsing context.

**Target**: Preserve scroll position on HomePage when navigating to product detail and back.

**Changes**:
- **`src/pages/HomePage.tsx`**: Save `window.scrollY` to `sessionStorage` on unmount. Restore on mount if navigating back (check `navigation.type` or use a ref).

---

## 7. Checkout Commitment Reinforcement

**Current**: Cart page shows "Place Order" button with total. No psychological reinforcement.

**Target**: Add micro-copy reinforcements in the checkout footer that adapt to cart state.

**Changes**:
- **`src/pages/CartPage.tsx`**: Below the community support text, add contextual micro-copy:
  - Free delivery achieved → "🎉 Free delivery unlocked!"
  - Close to free delivery → "Add ₹X more for free delivery"
  - These are already partially handled by `FulfillmentSelector` — verify and enhance in the sticky footer only if not redundant.

---

## 8. Delivery Identity Visibility

**Current**: Delivery partner name/phone shown only in `DeliveryArrivalOverlay` (proximity-triggered) and `LiveDeliveryTracker`. Not visible in the main order view until rider is close.

**Target**: Show delivery partner identity card (name + phone + avatar placeholder) on OrderDetailPage as soon as assignment exists, regardless of proximity.

**Changes**:
- **`src/pages/OrderDetailPage.tsx`**: When `deliveryAssignmentId` exists and order is in transit, show a compact "Your delivery partner" card with name and call button. Uses existing `deliveryTracking.riderName` and `deliveryTracking.riderPhone`.

---

## 9. Action Confirmation Signals

**Current**: `OrderProgressOverlay` uses a spinner (`Loader2`) as primary visual. Steps show check marks when done.

**Target**: Replace the top spinner with a progress ring that fills based on current step (33% → 66% → 100%). More perceived progress.

**Changes**:
- **`src/components/checkout/OrderProgressOverlay.tsx`**: Replace the top `Loader2` with an SVG circular progress indicator. `currentIdx / STEPS.length * 100` = fill percentage. Animate the stroke-dashoffset with CSS transition.

---

## Implementation Phases

| Phase | Items | Risk |
|-------|-------|------|
| **1: Core Perception** | #1 (ETA emotions), #2 (Cart momentum), #4 (Delivery celebration) | None |
| **2: Context** | #5 (Empty states), #6 (Scroll restore), #8 (Delivery identity) | Low |
| **3: Polish** | #3 (Mini cart preview), #7 (Checkout reinforcement), #9 (Progress ring) | Low |

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/etaEngine.ts` | Add emoji + mood fields |
| `src/components/order/DeliveryETABanner.tsx` | Mood-based styling |
| `src/components/header/ActiveOrderETA.tsx` | Emoji + mood pulse |
| `src/components/cart/FloatingCartBar.tsx` | Momentum CTA + mini preview sheet |
| `src/pages/OrderDetailPage.tsx` | Delivery celebration + rider identity card |
| `src/pages/OrdersPage.tsx` | Enhanced empty state |
| `src/pages/FavoritesPage.tsx` | Animated empty state |
| `src/pages/HomePage.tsx` | Scroll position restore |
| `src/pages/CartPage.tsx` | Checkout reinforcement micro-copy |
| `src/components/checkout/OrderProgressOverlay.tsx` | Progress ring |

## Guarantees
- Zero backend changes
- Zero hardcoded/dummy data
- All data from existing DB state or client state
- No flow breakage — all changes are additive
- Celebration timing gated by `persistent-kv` (no repeat)

