

## P0 QA Audit: 10 Critical Bugs in Checkout & Payment Flow

### Bug 1: DEADLOCK — "Pending Payment" Toast Blocks All Future Orders After Razorpay Dismiss

**Issue**: When a buyer opens Razorpay, doesn't complete payment, and closes the popup, `handleRazorpayDismiss` (line 534) only sets `showRazorpayCheckout = false`. It does NOT clear the `sessionStorage` payment session. The orders remain in `payment_pending` status in DB. On next "Place Order" tap, the guard at line 308 finds the session, queries the DB, finds `payment_pending` orders (which are NOT cancelled and NOT paid), and blocks with "You have a pending payment" toast — permanently. The user is stuck.

**Why critical**: Complete conversion killer. Buyer cannot place ANY order until the 30-minute auto-cancel runs, or they manually clear browser storage.

**Affected modules**: Checkout flow, cart page, payment session management

**Fix**: `handleRazorpayDismiss` must cancel the `payment_pending` orders via `buyer_cancel_pending_orders` RPC, then clear the payment session and `pendingOrderIds`. The guard's `stillPending` filter (line 315) should also include `payment_pending` status check.

**Risk**: If `buyer_cancel_pending_orders` RPC doesn't handle `payment_pending` status, the cancel will silently fail. Must verify the RPC accepts this status.

---

### Bug 2: Cart "Clear All" Does Not Clear Payment Session — Ghost Pending State

**Issue**: The "Clear All" button (CartPage line 77) calls `c.clearCart()` but does NOT call `clearPaymentSession()` or cancel pending orders. If a user had initiated payment, cleared the cart, then tries to add new items and checkout — the stale session blocks them.

**Why critical**: Creates a confusing state where cart is empty but "Place Order" shows pending payment error.

**Affected modules**: Cart clearing, payment session, checkout guard

**Fix**: When clearing cart while `hasActivePaymentSession` is true, also cancel pending orders and clear the payment session.

**Risk**: Must check that cancelled orders don't trigger refund flows for unpaid orders.

---

### Bug 3: `payment_pending` Orders Visible in Buyer's "Active Orders" Query

**Issue**: The buyer's active orders query (visible in network requests) filters `status=not.in.(completed, cancelled, no_show, delivered, failed)`. Since `payment_pending` is NOT in this exclusion list, unpaid orders will appear in the buyer's active orders list — showing orders that were never actually confirmed.

**Why critical**: Buyer sees phantom orders they never completed payment for. Confusing and trust-eroding.

**Affected modules**: Order list page, home page active orders widget

**Fix**: Add `payment_pending` to the exclusion list in buyer order queries, or create a separate filter that only shows `payment_pending` orders with an "Awaiting Payment" UI that lets the buyer retry or cancel.

**Risk**: If we hide `payment_pending` completely, buyers lose the ability to retry payment from the orders page. Better approach: show them with a distinct "Complete Payment" CTA.

---

### Bug 4: Seller New Order Alert Polling Does NOT Filter `payment_pending`

**Issue**: The seller polling query (visible in network requests: `status=in.(placed, enquired, quoted)`) correctly excludes `payment_pending`. However, if the client-side fallback in `handleRazorpaySuccess` (line 484-491) transitions the order to `placed` before the webhook can verify the payment, a fraudulent or failed payment could still trigger seller alerts.

**Why critical**: The client-side `update` at line 486 sets `status: 'placed', payment_status: 'paid'` without any server-side verification. A malicious client could call this directly.

**Affected modules**: Seller alerts, order integrity, payment verification

**Fix**: The client-side fallback should only set `payment_status: 'paid'` — the status transition to `placed` should be done via a secure RPC or only by the webhook. Add an RLS policy that prevents buyers from setting `payment_status` to `paid` directly.

**Risk**: If we remove the client-side fallback entirely and the webhook is delayed, the buyer sees "Payment is being verified" indefinitely. Keep the fallback but make it set a `buyer_confirmed_payment` flag instead, with a server-side cron that verifies with Razorpay API.

---

### Bug 5: COD Orders Still Created as `payment_pending` When `_payment_status = 'pending'`

**Issue**: The COD flow at line 448 calls `createOrdersForAllSellers('pending')`. The updated RPC was modified to set `status = 'payment_pending'` when `_payment_status = 'pending'`. This means COD orders are also being created as `payment_pending` instead of `placed`.

**Why critical**: COD orders should go to `placed` immediately. Sellers won't see COD orders until the auto-cancel fires or until someone manually transitions them.

**Affected modules**: COD checkout, seller notifications, order lifecycle

**Fix**: The RPC migration should check `_payment_method` not just `_payment_status`. The condition should be: `IF _payment_status = 'pending' AND _payment_method NOT IN ('cod') THEN status = 'payment_pending'`. Verify the migration SQL from the earlier P0 fix implemented this correctly.

**Risk**: If the RPC already has the `_payment_method` guard (from the plan), this is a non-issue. Must verify deployed RPC logic.

---

### Bug 6: No Way for Buyer to Cancel `payment_pending` Orders from UI

**Issue**: When the Razorpay dismiss flow leaves orders in `payment_pending`, there's no UI for the buyer to explicitly cancel them. The only escape is the 30-minute auto-cancel. The "pending payment" toast re-opens the Razorpay modal, but if the payment gateway is down, the buyer is completely stuck.

**Why critical**: User is trapped with no way out. Must provide an explicit "Cancel Payment" action.

**Affected modules**: Checkout page, payment session guard

**Fix**: When showing the "pending payment" toast, also show a "Cancel" option that calls `buyer_cancel_pending_orders` and clears the session.

**Risk**: None significant — straightforward addition.

---

### Bug 7: `buyer_cancel_pending_orders` RPC May Not Handle `payment_pending` Status

**Issue**: The `buyer_cancel_pending_orders` RPC was written before the `payment_pending` status existed. It likely only cancels orders with `status = 'placed'` (or similar). If it doesn't include `payment_pending`, the cancel calls in `handleRazorpayFailed` silently fail, leaving zombie orders.

**Why critical**: Failed payment cleanup breaks silently — orders linger in DB, block future checkout.

**Affected modules**: Order cancellation, payment failure handling

**Fix**: Update the RPC to also handle `payment_pending` status orders.

**Risk**: Must verify the RPC's current WHERE clause.

---

### Bug 8: Race Condition — Cart Cleared Before Razorpay Success Confirmed

**Issue**: In `handleRazorpaySuccess` (line 506), `clearCartAndCache()` is called after polling confirms payment. But the polling loop (line 496) waits up to 15 seconds. If the user navigates away during polling, the cart data is lost but the order might not be confirmed yet.

**Why critical**: Low probability but high impact — buyer loses cart items without confirmed order.

**Affected modules**: Cart integrity, payment confirmation

**Fix**: Already mostly handled by the payment session persistence. Low priority compared to bugs 1-7.

---

### Bug 9: Checkout Shows "Shipment of 0 items" With Empty Cart + Active Session

**Issue**: When cart is empty but `hasActivePaymentSession` is true (screenshot shows "Shipment of 0 items"), the checkout page renders with no items, $0 total, but still shows "Place Order". The UPI Payment option shows "Not available for this seller" because `sellerGroups` is empty.

**Why critical**: Confusing UI — buyer sees a broken checkout page with no actionable path.

**Affected modules**: CartPage rendering, checkout UI state

**Fix**: When `hasActivePaymentSession` is true but cart is empty, show a dedicated "Pending Payment" view with options to retry payment or cancel — not the full checkout form.

**Risk**: UI change — needs careful conditional rendering.

---

### Bug 10: `payment_pending` Not in `order_status_config` for Buyer Order List Display

**Issue**: The `order_status_config` table was seeded with `payment_pending` in the migration, but the buyer order list page likely doesn't have display logic for this status. Orders in `payment_pending` will show with missing or default labels/colors.

**Why critical**: Minor visual issue but contributes to confusion about order state.

**Affected modules**: Order list page, order detail page, status display components

**Fix**: Verify display mapping exists. If not, add a "Awaiting Payment" label with appropriate styling.

---

## Implementation Plan (Priority Order)

### Phase 1: Immediate Fixes (Bugs 1, 2, 5, 7) — Unblock Users

1. **Verify RPC** `buyer_cancel_pending_orders` handles `payment_pending` status. If not, update via migration. (Bug 7)
2. **Verify RPC** `create_multi_vendor_orders` has `_payment_method` guard for COD. (Bug 5)
3. **Fix `handleRazorpayDismiss`** to cancel orders + clear session. (Bug 1)
4. **Fix "Clear All"** to also cancel pending orders + clear session. (Bug 2)

### Phase 2: UX Improvements (Bugs 3, 6, 9)

5. **Add "Cancel Payment" action** to the pending payment guard toast. (Bug 6)
6. **Add `payment_pending` to buyer order exclusion** or show with dedicated UI. (Bug 3)
7. **Show dedicated pending-payment view** when cart is empty but session exists. (Bug 9)

### Phase 3: Security Hardening (Bug 4)

8. **Replace client-side `placed` transition** with a secure RPC or remove direct status update. (Bug 4)

### Impact Analysis If All Bugs Are Fixed

| Module | Impact |
|--------|--------|
| Checkout flow | Unblocked — no more deadlocks |
| Cart page | Clean state management |
| Seller alerts | Only receive alerts for paid orders |
| Order list (buyer) | No phantom unpaid orders |
| Order cancellation | Works for `payment_pending` status |
| Auto-cancel cron | Already handles `payment_pending` — no change |
| Payment session | Properly cleared on all exit paths |

### Files to Modify

- `src/hooks/useCartPage.ts` — Bugs 1, 2, 6
- `src/pages/CartPage.tsx` — Bugs 2, 9
- `src/components/payment/RazorpayCheckout.tsx` — Minor (already correct)
- Database migration — Bugs 5, 7 (verify RPCs)
- `supabase/functions/razorpay-webhook/index.ts` — Bug 4 (if hardening)

