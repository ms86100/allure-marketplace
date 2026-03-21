

# Round 11: 5 Critical Checkout Bugs — Buyer Perspective

## Bug 1: Pending order guard re-opens UPI but NOT Razorpay — buyer stuck in dead end

**Where:** `src/hooks/useCartPage.ts` lines 276-284

**What happens:** When a buyer has pending Razorpay orders (dismissed without paying), taps "Place Order" again, the guard at line 268 detects `stillPending` orders and shows "You have a pending payment." But line 280 only re-opens UPI:
```typescript
if (paymentMethod === 'upi' && paymentMode.isUpiDeepLink) {
  setShowUpiDeepLink(true);
}
```
For Razorpay mode, neither `isUpiDeepLink` is true, so nothing opens. Buyer sees the error toast, button re-enables, taps again — same error. They're locked out of checkout with no way to pay or cancel. Must kill the app to clear sessionStorage.

**Impact:** Complete checkout deadlock for Razorpay users.

**Fix:** Add Razorpay branch after line 282:
```typescript
if (paymentMethod === 'upi' && paymentMode.isUpiDeepLink) {
  setShowUpiDeepLink(true);
} else if (paymentMode.isRazorpay) {
  setShowRazorpayCheckout(true);
}
```

**Impact analysis:** Only `useCartPage.ts` modified. No other files reference this guard logic.

---

## Bug 2: Unconfirmed Razorpay success clears session — duplicate orders on retry

**Where:** `src/hooks/useCartPage.ts` lines 397-404

**What happens:** When Razorpay payment succeeds client-side but the webhook is slow (>15s polling timeout), the code:
1. Clears `paymentSession` (line 400)
2. Clears `pendingOrderIds` (line 402)
3. Navigates to orders page (line 401)
4. Does NOT clear cart (correctly — payment unconfirmed)

When the buyer returns to cart, items are still there. The pending order guard at line 266 checks `pendingOrderIdsRef.current` (empty) and `loadPaymentSession()` (cleared). No guard fires. Buyer taps "Place Order" → NEW idempotency key generated (line 216 uses `Date.now()`) → creates DUPLICATE orders. The original orders are still alive with `payment_status: pending` (webhook may update them later). Buyer now has 2 sets of orders for the same items.

**Impact:** Duplicate orders, potential double-charge.

**Fix:** Do NOT clear `pendingOrderIds` or `paymentSession` in the unconfirmed path. Instead, keep them alive so the guard can protect against re-entry:
```typescript
if (!confirmed) {
  toast.info('Payment is being verified. Your order will update shortly.', { id: 'razorpay-verifying' });
  // Keep session alive — don't clear pendingOrderIds or paymentSession
  // Navigate to let buyer track status, guard will protect against re-order
  navigate(pendingOrderIds.length === 1 ? `/orders/${pendingOrderIds[0]}` : '/orders');
  return;
}
```

**Impact analysis:** Only `useCartPage.ts` modified. The `handleRazorpayDismiss` and `handleRazorpayFailed` paths are separate and unaffected.

---

## Bug 3: Fulfillment conflict doesn't disable Place Order — unfulfillable orders created

**Where:** `src/pages/CartPage.tsx` line 308

**What happens:** When the buyer has a multi-seller cart with conflicting fulfillment modes (e.g., Seller A: delivery-only, Seller B: pickup-only), `hasFulfillmentConflict` is `true` and a warning is shown (line 196). But the Place Order button's `disabled` condition at line 308:
```
disabled={c.isPlacingOrder || c.hasBelowMinimumOrder || c.noPaymentMethodAvailable || (c.fulfillmentType === 'delivery' && !c.selectedDeliveryAddress)}
```
does NOT include `c.hasFulfillmentConflict`. The buyer sees a yellow warning but can still tap Place Order. Orders are created with a single shared `fulfillment_type` that one seller can't fulfill. That seller has no mechanism to switch fulfillment mode per-order, so they must cancel.

**Impact:** Unfulfillable orders, seller frustration, buyer disappointment.

**Fix:** Add to disabled condition in `CartPage.tsx`:
```
disabled={c.isPlacingOrder || c.hasBelowMinimumOrder || c.noPaymentMethodAvailable || c.hasFulfillmentConflict || (c.fulfillmentType === 'delivery' && !c.selectedDeliveryAddress)}
```

**Impact analysis:** Only `CartPage.tsx` modified. The `hasFulfillmentConflict` value is already computed and exposed by `useCartPage.ts`.

---

## Bug 4: COD bypasses confirmation dialog — no review before irreversible order

**Where:** `src/pages/CartPage.tsx` line 308

**What happens:** The Place Order button logic:
```typescript
onClick={() => {
  if (c.paymentMethod === 'cod') { c.handlePlaceOrder(); }
  else { c.setShowConfirmDialog(true); }
}}
```

For UPI/Razorpay, the buyer sees a confirmation dialog showing item count, payment method, delivery address, and total amount. They can review and tap "Review Cart" to go back.

For COD — the most common payment method — tapping Place Order immediately creates the order with no confirmation. If the buyer accidentally selected the wrong address, wrong fulfillment type, or didn't notice a minimum order warning, the order is created irreversibly. They must then go through cancellation.

**Impact:** Accidental orders, wrong addresses, trust erosion. The asymmetry between COD and online payment UX feels inconsistent.

**Fix:** Route COD through the same confirmation dialog:
```typescript
onClick={() => c.setShowConfirmDialog(true)}
```
Remove the `paymentMethod === 'cod'` branch. The confirm dialog already calls `c.handlePlaceOrder` on "Confirm Order".

**Impact analysis:** Only `CartPage.tsx` line 308 modified. The confirm dialog already handles all payment methods correctly.

---

## Bug 5: Auto-cancel kills orders after 15 min, but payment session lives for 30 min

**Where:** `supabase/functions/auto-cancel-orders/index.ts` lines 57-63 and `src/hooks/useCartPage.ts` line 51

**What happens:** The `auto-cancel-orders` edge function cancels non-COD orders with `payment_status: 'pending'` that are older than 15 minutes (line 45: `fifteenMinAgo`). But the client's `loadPaymentSession` keeps sessions alive for 30 minutes (line 51: `30 * 60 * 1000`).

Scenario: Buyer creates order, Razorpay opens, buyer switches to another app for 20 minutes, returns. Session restore opens Razorpay checkout (session is valid — under 30 min). Buyer pays. But the order was already auto-cancelled at minute 15. The Razorpay payment goes to a cancelled order. The `razorpay-webhook` updates `payment_status` to 'paid' but the order `status` is 'cancelled'. Buyer paid for a cancelled order.

**Impact:** Money taken for cancelled orders — most trust-destroying scenario.

**Fix:** Align the timeouts. In `auto-cancel-orders/index.ts`, increase the orphan threshold to 30 minutes to match the client session:
```typescript
const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
```
And in the query:
```typescript
.lt("created_at", thirtyMinAgo);
```

**Impact analysis:** Only `auto-cancel-orders/index.ts` modified. The urgent order auto-cancel (query 1) is unaffected — it uses `auto_cancel_at` from the DB, not a fixed timeout.

---

## Summary

| # | Bug | Severity | File(s) |
|---|-----|----------|---------|
| 1 | Pending guard doesn't re-open Razorpay | **CRITICAL** — checkout deadlock | `useCartPage.ts` |
| 2 | Unconfirmed Razorpay clears session → duplicates | **CRITICAL** — duplicate orders | `useCartPage.ts` |
| 3 | Fulfillment conflict doesn't block checkout | **HIGH** — unfulfillable orders | `CartPage.tsx` |
| 4 | COD bypasses confirmation dialog | **HIGH** — accidental orders | `CartPage.tsx` |
| 5 | Auto-cancel timeout (15m) vs session timeout (30m) | **CRITICAL** — paid cancelled orders | `auto-cancel-orders/index.ts` |

## Technical Details

**Files to edit:**
- `src/hooks/useCartPage.ts` — Bugs 1, 2
- `src/pages/CartPage.tsx` — Bugs 3, 4
- `supabase/functions/auto-cancel-orders/index.ts` — Bug 5

**Cross-impact analysis:**
- Bug 1 fix: Adds a branch to the guard — no other code path affected
- Bug 2 fix: Removes 3 lines from the unconfirmed path — `handleRazorpayFailed` and `handleRazorpayDismiss` are separate functions, unaffected
- Bug 3 fix: Adds one boolean to `disabled` — the value is already computed, no new computation
- Bug 4 fix: Removes a conditional branch — the dialog already handles COD correctly
- Bug 5 fix: Changes one constant — only affects the orphaned UPI query, not urgent order cancellation

