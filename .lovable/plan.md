

# 5 Critical Buyer-Facing Bugs to Fix Before Production

## Bug 1: Double notification trigger on buyer status advance (CONFIRMED)
**File:** `src/hooks/useOrderDetail.ts` lines 168-169
**What:** `buyerAdvanceOrder` calls `supabase.functions.invoke('process-notification-queue')` **twice** in a row — a copy-paste duplication. This means every time a buyer advances an order status, the notification queue is processed twice, potentially sending duplicate push notifications to sellers.
**Impact:** Sellers get duplicate notifications for the same event. Annoying and unprofessional.
**Fix:** Remove the duplicate line 169.

## Bug 2: BuyerDeliveryConfirmation shows on ALL completed non-delivery orders — even after already confirmed
**File:** `src/pages/OrderDetailPage.tsx` line 367
**What:** The condition `o.isBuyerView && isSuccessfulTerminal(o.flow, order.status) && !isDeliveryOrder` shows the "Did you receive your order?" prompt every time a buyer opens a completed self-pickup order — forever. There's no DB check for whether the buyer already confirmed. The component has internal `confirmed` state, but it resets on every remount.
**Impact:** Buyer sees the confirmation prompt every time they revisit a completed order. Tapping "Yes" again would call `buyer_confirm_delivery` RPC repeatedly (likely harmless but wasteful and confusing UX).
**Fix:** Check if the order already has `buyer_confirmed_at` set (or a similar flag from the RPC) and skip rendering the component if so.

## Bug 3: Coupon state silently clears when single-seller cart changes seller
**File:** `src/hooks/useCartPage.ts` lines 156-162
**What:** The effect on line 156 clears `appliedCoupon` whenever `currentSellerId` changes — but it fires unconditionally even on initial mount when `currentSellerId` is first set. If a buyer applies a coupon, then adds an item from the same seller (causing a re-render that re-derives `currentSellerId`), the coupon may be silently cleared without any user feedback.
**Impact:** Buyer applies a valid coupon, adds another item, coupon disappears silently. They check out at full price.
**Fix:** Track the previous seller ID and only clear when it genuinely changes to a different seller.

## Bug 4: `displayStatuses` filters out 'completed' when 'delivered' exists — hides final state from buyer
**File:** `src/hooks/useOrderDetail.ts` lines 227-234
**What:** The timeline display logic at line 230 strips `completed` from the status list if `delivered` already exists. This was likely done to reduce visual clutter, but if the workflow flow defines `delivered → completed` as separate meaningful steps (e.g., delivered = at your door, completed = buyer confirmed), the buyer loses visibility of the final confirmation step.
**Impact:** For workflows where `completed` is the true terminal after `delivered`, the buyer's timeline never shows the final step. They see "delivered" as the last node but the order status badge says "completed" — confusing mismatch.
**Fix:** Only filter `completed` when it's NOT a distinct step in the flow (i.e., when delivered IS the terminal).

## Bug 5: `cancelPlacingOrder` doesn't reset `orderStep` — stale overlay on next attempt
**File:** `src/hooks/useCartPage.ts` line 462
**What:** `cancelPlacingOrder` only calls `setIsPlacingOrder(false)` but doesn't reset `orderStep` back to `'validating'`. If a buyer cancels during the "creating" step, then tries again, the `OrderProgressOverlay` briefly flashes "creating" before the flow resets it to "validating" on line 284.
**Impact:** Brief but confusing flash of wrong progress state. On slow connections, the buyer sees "Creating order..." for a split second before it jumps back to "Validating...".
**Fix:** Reset `orderStep` to `'validating'` in `cancelPlacingOrder`.

---

## Summary of Changes

| Bug | File | Change |
|-----|------|--------|
| 1 | `useOrderDetail.ts:169` | Delete duplicate `process-notification-queue` invoke |
| 2 | `OrderDetailPage.tsx:367` | Add `buyer_confirmed_at` check to skip re-rendering confirmation |
| 3 | `useCartPage.ts:156-162` | Track previous seller ID, only clear coupon on genuine change |
| 4 | `useOrderDetail.ts:230` | Only filter `completed` when `delivered` is itself terminal |
| 5 | `useCartPage.ts:462` | Reset `orderStep` to `'validating'` in `cancelPlacingOrder` |

All 5 fixes are surgical — no new features, no refactors, just targeted corrections.

