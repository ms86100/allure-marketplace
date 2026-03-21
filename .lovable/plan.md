

# 5 Critical Buyer-Facing Bugs — Round 2

## Bug 1: Razorpay success clears cart even when payment is NOT confirmed
**File:** `src/hooks/useCartPage.ts` lines 359-374
**What:** `handleRazorpaySuccess` polls for up to 15 seconds for `payment_status === 'paid'`. If the webhook is slow and confirmation never arrives, the code shows a toast ("Payment is being verified") but **still clears the cart and navigates away** (lines 370-373). The cart is destroyed before payment is actually verified.
**Impact:** Buyer pays via Razorpay, webhook is delayed by >15s (common under load), cart is wiped, order stays `pending` with `payment_status: pending`. If the webhook eventually fails, the buyer has no cart to retry with. They lose both their money (until manual refund) and their cart state.
**Fix:** Only call `clearCartAndCache()` when `confirmed === true`. When unconfirmed, navigate to the order detail page but keep the cart intact and show a clear "verifying" state. The cart should only be cleared once payment is actually confirmed (via realtime listener or re-check).

## Bug 2: Duplicate OrderCancellation button renders — inline AND bottom bar
**File:** `src/pages/OrderDetailPage.tsx` lines 309-310 and 565-569
**What:** `OrderCancellation` renders in TWO places:
1. **Line 309:** Inside the status timeline card, shown when `isBuyerView && !buyerNextStatus` (no gating on terminal status)
2. **Line 568:** In the bottom action bar, shown when `isBuyerView && !isTerminalStatus && canBuyerCancel`

When the buyer has no forward action but CAN cancel (e.g., order is in a state where only cancellation is possible), both render simultaneously. The inline one at line 309 is even worse — it renders on **terminal statuses** too (no terminal check), showing a "Cancel Order" button on already-cancelled or completed orders (the `canCancel` prop will be false so `OrderCancellation` returns null, but it still mounts, runs effects, and queries the DB for cancellation reasons on every render of a completed order).
**Impact:** Duplicate cancel buttons on active orders; unnecessary DB queries on terminal orders.
**Fix:** Add `!isTerminalStatus(o.flow, order.status)` guard to line 309, and remove the inline instance entirely since the bottom bar already handles it.

## Bug 3: `fetchOrder` uses stale `flow` for review check — race condition
**File:** `src/hooks/useOrderDetail.ts` lines 142-155
**What:** Inside `fetchOrder`, line 149 calls `isSuccessfulTerminal(flow, data.status)` to decide whether to check for reviews. But `flow` is a state variable loaded asynchronously by `useCategoryStatusFlow`. On initial page load, `fetchOrder` runs immediately (line 134) while `flow` is still `[]` (empty). When `flow` is empty, `isSuccessfulTerminal` returns `false`, so the review check is skipped even for completed orders. The realtime UPDATE at line 138 re-calls `fetchOrder`, but `flow` may still not be loaded if the category config query is slow.
**Impact:** Buyer opens a completed order → `hasReview` stays `false` → "Leave a Review" button appears even if they already submitted one. If they tap it and submit again, the DB may reject (if unique constraint exists) or create a duplicate review.
**Fix:** Either move the review check outside `fetchOrder` into a separate effect that reacts to both `order.status` and `flow`, or treat `flow.length === 0` as "unknown" and always check reviews as a fallback.

## Bug 4: `'failed'` orders vanish from buyer's order list — no filter catches them
**File:** `src/pages/OrdersPage.tsx` lines 188-194
**What:** The buyer filter has 4 options: `all`, `active`, `completed`, `cancelled`. The `cancelled` filter only matches `order.status === 'cancelled'` (exact match). Orders with status `'failed'` (e.g., delivery failure) are NOT terminal-success, so they don't match `completed`. They ARE terminal, so they don't match `active`. They don't match `cancelled` (different status string). They only appear under `all`.
**Impact:** Buyer switches to "Cancelled" to find failed orders → not there. Tries "Completed" → not there. Tries "Active" → not there. The order is effectively invisible unless they know to check "All". Creates distrust — "where did my order go?"
**Fix:** Change the `cancelled` filter condition to catch all negative-terminal statuses: `terminalSet.has(order.status) && !successSet.has(order.status)` instead of `order.status === 'cancelled'`.

## Bug 5: Razorpay failure handler doesn't reset `isPlacingOrder` — button stays disabled
**File:** `src/hooks/useCartPage.ts` lines 376-398
**What:** `handleRazorpayFailed` cancels orders and shows an error toast, but never calls `setIsPlacingOrder(false)`. The `handlePlaceOrderInner` sets `isPlacingOrder = false` in its `finally` block (line 354), but that already fired before Razorpay opened (line 338). When Razorpay fails and calls `handleRazorpayFailed`, `isPlacingOrder` may still be `false` from the earlier reset — so this is not a direct lock. However, the `useSubmitGuard` at line 357 has a `holdMs` of 5000ms. If Razorpay fails quickly (e.g., user closes the modal within 5s), the guard is still active and blocks the next `handlePlaceOrder` call. The buyer taps "Place Order" again and nothing happens for up to 5 seconds — no feedback, no error, just dead button.
**Impact:** Buyer's Razorpay fails → they try again immediately → button appears interactive but does nothing for 5 seconds. On slow connections this extends further. Creates a "broken app" feeling.
**Fix:** In `handleRazorpayFailed`, explicitly reset the submit guard's internal state, or reduce the `holdMs` to 0 for the failure path. Simplest: set `holdMs` to 0 (the 5s hold was designed for the success navigation path, not failure).

---

## Summary

| # | Bug | File | Impact |
|---|-----|------|--------|
| 1 | Cart cleared before payment verified | `useCartPage.ts:370` | Data loss — cart gone, payment unconfirmed |
| 2 | Duplicate cancel button + terminal waste | `OrderDetailPage.tsx:309` | UX confusion + unnecessary DB queries |
| 3 | Review check uses stale empty flow | `useOrderDetail.ts:149` | Duplicate reviews possible |
| 4 | `failed` orders invisible in buyer list | `OrdersPage.tsx:190` | Orders disappear from filtered views |
| 5 | Submit guard blocks retry after Razorpay fail | `useCartPage.ts:357` | Dead button for 5s after payment failure |

All fixes are surgical — no new features, no refactors.

