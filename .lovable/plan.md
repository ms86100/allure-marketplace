

# Engine-Level Transformation: Global Feedback + ETA + Visibility Systems

## What This Plan Addresses

The previous implementation added UI-level enhancements (toasts, animations, pulses). This plan upgrades them to **engine-level behavioral systems** with deterministic contracts, failure handling, and consistency enforcement.

---

## Change 1: Global Feedback Engine — `src/lib/feedbackEngine.ts`

Create a single module that defines feedback for ALL user actions, not just add-to-cart.

### Action Map

| Action | Haptic | Toast | Event | Failure Behavior |
|--------|--------|-------|-------|-------------------|
| Add item | medium | "{name} added" | `cart-item-added` | Undo toast on rollback |
| Remove item | light | "{name} removed" + Undo action | `cart-item-removed` | Silent re-add on rollback |
| Update quantity | light | None (too frequent) | `cart-item-updated` | Revert stepper on rollback |
| Place order | heavy | "Order placed!" | `order-placed` | Error toast with retry |
| Payment success | heavy + notification(success) | "Payment confirmed" | `payment-success` | N/A (server-driven) |
| Payment failure | notification(error) | "Payment failed — try again" | `payment-failed` | Show retry CTA |
| Delivery status change | light | None (push handles) | `order-status-changed` | N/A (server-driven) |

### Implementation

- Export typed functions: `feedbackAddItem(name)`, `feedbackRemoveItem(name, undoFn)`, `feedbackOrderPlaced()`, `feedbackPaymentResult(success, msg?)`, `feedbackStatusChange(status)`
- Each function encapsulates: haptic → toast → CustomEvent dispatch
- `triggerCartFeedback` in `cartFeedback.ts` becomes a thin wrapper calling `feedbackAddItem`

### Failure Contract

- `useCart.addItem()`: On rollback after optimistic update, call `feedbackAddItemFailed(name)` → shows error toast, no haptic
- `useCart.removeItem()`: Currently has no undo — add undo toast (already partially done in CartPage.tsx line 147, but not centralized)
- `useCart.updateQuantity()`: On rollback, stepper reverts automatically via state; no toast needed (too noisy)
- Duplicate taps: Already handled by `addItemLocksRef` mutex — feedback fires only on first successful lock acquisition

### Integration Points

- `useCart.tsx` `addItem()`: Replace `triggerCartFeedback` with `feedbackAddItem` (line ~204)
- `useCart.tsx` `removeItem()`: Add `feedbackRemoveItem` with undo callback after successful delete
- `useCart.tsx` `updateQuantity()`: Add `feedbackQuantityChanged` (haptic only, no toast)
- `useCartPage.ts` or checkout handler: Add `feedbackOrderPlaced` after successful order creation
- Payment callback: Add `feedbackPaymentResult`

---

## Change 2: ETA Single Source of Truth — `src/lib/etaEngine.ts`

### Problem

ETA is currently computed independently in 4 places:
1. `ActiveOrderETA.tsx` — `Math.ceil((eta - now) / 60000)`
2. `ActiveOrderStrip.tsx` — same formula, different component
3. `DeliveryETABanner.tsx` — same formula with late detection
4. Live Activity APNs — server-side in edge function

### Solution

Create `src/lib/etaEngine.ts` with a single pure function:

```typescript
interface ETAResult {
  minutes: number | null;
  isLate: boolean;
  isArriving: boolean;  // ≤ 1 min
  displayText: string;  // "Arriving now" | "12 min" | "Running late"
  displayTime: string;  // "2:30 PM"
}
export function computeETA(estimatedDeliveryAt: string | null): ETAResult
```

### Propagation

All ETA consumers use the same function:
- `ActiveOrderETA.tsx` → `computeETA(activeOrder.estimated_delivery_at)`
- `ActiveOrderStrip.tsx` → `computeETA(order.estimated_delivery_at)`
- `DeliveryETABanner.tsx` → `computeETA(estimatedDeliveryAt)`

The database column `orders.estimated_delivery_at` remains the single source of truth. The edge function updates it. All clients read and compute from it identically.

### Priority Rules (which surface shows what)

| Surface | Shows ETA When | Hides When |
|---------|---------------|------------|
| `ActiveOrderETA` (header) | Any non-terminal order exists | No active orders OR on order detail page |
| `ActiveOrderStrip` (home) | Any non-terminal order exists | No active orders |
| `DeliveryETABanner` (order detail) | Viewing specific order with ETA | Order is terminal OR live tracking ETA overrides |
| Live Activity | Transit status active | Order terminal (end activity) |

No conflict: header shows latest order, strip shows up to 3, detail shows specific order, Live Activity shows tracked order. They complement, not compete.

---

## Change 3: Visibility Engine — `src/lib/visibilityEngine.ts`

### Rules (Deterministic)

**FloatingCartBar**:
- Shows: `itemCount > 0 AND route NOT in [/cart, /checkout]`
- Hides: `itemCount === 0 OR route in [/cart, /checkout]`
- Already correctly implemented — no change needed, but document as contract

**ActiveOrderETA (header)**:
- Shows: `activeOrders.length > 0 AND route !== /orders/:id`
- Hides: `No active orders OR viewing specific order detail`
- Change needed: Add route check to hide on order detail page (prevents double-ETA with DeliveryETABanner)

**ActiveOrderStrip (home)**:
- Shows: `activeOrders.length > 0 AND route === /`
- Already correct — only renders on home page

**Conflict Resolution**:
- FloatingCartBar z-index: 40 (above content, below modals)
- ActiveOrderETA: Part of header (no z-index conflict)
- No overlapping elements — positioned in different DOM locations

### Implementation

Create a shared constants file `src/lib/visibilityEngine.ts` that exports:
- `CART_HIDDEN_ROUTES = ['/cart', '/checkout']`
- `ETA_HIDDEN_ROUTES = ['/orders/']` (prefix match)
- `isRouteHidden(pathname, hiddenRoutes)` utility

This is lightweight — the actual rendering logic stays in components, but the rules are centralized and importable.

---

## Change 4: Failure Behavior Audit

### Current State (Already Handled)

| Scenario | Current Handling | Adequate? |
|----------|-----------------|-----------|
| Add item fails | `rollback(snap)` + `handleApiError` toast | ✅ Yes |
| Remove item fails | `rollback(snap)` + `handleApiError` toast | ✅ Yes |
| Update quantity fails | `rollback(snap)` + `handleApiError` toast | ✅ Yes |
| Duplicate taps | `addItemLocksRef` mutex blocks | ✅ Yes |
| Network down during add | Optimistic shows, server fails → rollback | ✅ Yes |
| Optimistic + stale fetch race | `mutationSeqRef` prevents stale overwrites | ✅ Yes |

### Gap: Feedback on Failure

Current: `handleApiError` shows generic toast. User saw "added" toast optimistically, then generic error.

Fix: In `useCart.addItem()` catch block, after `rollback(snap)`, call `feedbackAddItemFailed(product.name)` which shows: `toast.error('{name} couldn't be added — please try again', { id: 'cart-add-fail' })`. This replaces the generic `handleApiError` for cart-specific failures (availability errors already have specific messages).

---

## Change 5: Consistency Enforcement

### Approach: Centralized Imports + Lint-Level Documentation

Rather than runtime enforcement (over-engineering), define **architectural rules** as a code contract:

1. **`src/lib/feedbackEngine.ts`** — All feedback flows through typed functions. Any direct `toast.success` in a cart/order context is a violation.

2. **`src/lib/etaEngine.ts`** — All ETA display logic uses `computeETA()`. Any direct `Math.ceil((eta - now) / 60000)` in a component is a violation.

3. **`src/lib/visibilityEngine.ts`** — Route-based visibility rules are imported, not hardcoded per component.

4. **`src/lib/cartFeedback.ts`** — Becomes a thin re-export from feedbackEngine for backward compatibility.

### Future-Proofing

- New dev adds a screen? They import `feedbackAddItem` from the engine, not write their own toast.
- New dev adds an ETA display? They import `computeETA`, not duplicate the formula.
- These are discoverable by name and co-located in `src/lib/`.

---

## Files to Create/Modify

| File | Action | Risk |
|------|--------|------|
| `src/lib/feedbackEngine.ts` | **Create** — global feedback functions | None |
| `src/lib/etaEngine.ts` | **Create** — single ETA computation | None |
| `src/lib/visibilityEngine.ts` | **Create** — route/visibility constants | None |
| `src/lib/cartFeedback.ts` | **Modify** — delegate to feedbackEngine | Low |
| `src/hooks/useCart.tsx` | **Modify** — use feedbackEngine for remove/update/failure | Low |
| `src/components/header/ActiveOrderETA.tsx` | **Modify** — use `computeETA`, hide on order detail | Low |
| `src/components/home/ActiveOrderStrip.tsx` | **Modify** — use `computeETA` | Low |
| `src/components/order/DeliveryETABanner.tsx` | **Modify** — use `computeETA` | Low |
| `src/components/cart/FloatingCartBar.tsx` | **Modify** — use visibilityEngine constants | Low |

---

## Guarantees

| Question | Answer |
|----------|--------|
| Will any existing flow break? | **No** — all changes are additive refactors |
| Can feedback lie to the user? | **No** — failure paths explicitly call failure feedback |
| Can ETAs conflict? | **No** — single `computeETA()` function used everywhere |
| Can future code drift? | **Reduced** — centralized modules are the obvious import path |
| Will perceived speed improve? | **Yes** — consistent haptic + toast + animation on every action |

