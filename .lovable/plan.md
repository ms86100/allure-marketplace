

# Round 8: 5 Critical Add-to-Cart & Checkout Bugs — Buyer Perspective

## Bug 1: Razorpay pays only the FIRST order in multi-vendor carts — remaining orders are orphaned

**Where:** `CartPage.tsx` line 345 passes `orderId={c.pendingOrderIds[0]}` to `RazorpayCheckout`. `create-razorpay-order` validates and creates a Razorpay order for that single `orderId`. `razorpay-webhook` reads `notes.order_id` (singular) and marks only that one order paid.

**What happens:** Buyer has items from Seller A and Seller B. `create_multi_vendor_orders` creates 2 orders. Razorpay payment covers only the first. Seller B's order stays `payment_status: 'pending'` forever, eventually auto-cancelled. Buyer paid full amount but only one seller gets the order.

**Impact:** Money taken, value not delivered. The most trust-destroying scenario possible.

**Fix (6 files, no migration):**
1. **`create-razorpay-order/index.ts`**: Accept `orderIds: string[]` alongside `orderId`. Resolve: `const allOrderIds = body.orderIds?.length ? body.orderIds : [body.orderId]`. Validate ALL orders belong to buyer, are pending. Store `notes.order_ids: JSON.stringify(allOrderIds)`. Keep `notes.order_id` as `allOrderIds[0]` for backward compat. Update ALL orders with `razorpay_order_id`. Skip `transfers` block when `allOrderIds.length > 1`.
2. **`razorpay-webhook/index.ts`**: Parse `notes.order_ids` if present, fall back to `[notes.order_id]`. Loop all order IDs for the `payment_records` claim + `orders` update in `payment.captured`, and for `payment.failed`/`refund.created`.
3. **`useRazorpay.ts`**: Add `orderIds?: string[]` to `RazorpayOptions`, pass in invoke body.
4. **`RazorpayCheckout.tsx`**: Add `orderIds?: string[]` prop, pass to `createOrder`.
5. **`CartPage.tsx` line 345**: Pass `orderIds={c.pendingOrderIds}`.
6. **`useCartPage.ts` line 372**: Poll any `pendingOrderIds` (not just `[0]`). Navigate to `/orders` when multi-vendor.

---

## Bug 2: Payment method stored as `'upi'` for Razorpay payments — misleading settlement data

**Where:** `useCartPage.ts` line 217: `_payment_method: paymentMethod` where `paymentMethod` state is `'upi'` even when Razorpay mode is active.

**What happens:** The `PaymentMethodSelector` maps "Pay Online" to `paymentMethod = 'upi'`. When `create_multi_vendor_orders` RPC receives `_payment_method: 'upi'`, it creates `payment_records` with `payment_mode: 'upi'`. Seller's earnings page shows all card/netbanking/wallet payments as "UPI". Settlement reports are inaccurate.

**Fix:** In `useCartPage.ts`, when building the RPC call, compute the actual payment method:
```typescript
_payment_method: paymentMode.isRazorpay && paymentMethod === 'upi' ? 'card' : paymentMethod,
```

---

## Bug 3: Razorpay session NOT restored on app resume — payment flow lost

**Where:** `useCartPage.ts` lines 91-104. Session restore only handles `paymentMethod === 'upi'`:
```typescript
if (session.paymentMethod === 'upi') {
  setPaymentMethod('upi');
  setTimeout(() => setShowUpiDeepLink(true), 100);
}
```

And session save at line 335 always stores `paymentMethod: 'upi'` regardless of Razorpay mode.

**What happens:** Buyer on Razorpay opens checkout, OS kills background app, buyer returns. Session has `paymentMethod: 'upi'`, restore opens UPI deep link instead of Razorpay. Or (if the mode check prevents it) nothing opens — buyer sees cart with no payment UI. Order sits pending until auto-cancelled.

**Fix:**
1. Line 335: Save `paymentMethod: paymentMode.isRazorpay ? 'razorpay' : 'upi'`
2. Lines 99-103: Add Razorpay restore branch:
```typescript
if (session.paymentMethod === 'upi') {
  setPaymentMethod('upi');
  setTimeout(() => setShowUpiDeepLink(true), 100);
} else if (session.paymentMethod === 'razorpay') {
  setPaymentMethod('upi'); // internal state
  setTimeout(() => setShowRazorpayCheckout(true), 100);
}
```

---

## Bug 4: Cancel button in Razorpay drawer cancels orders — destroys retry possibility

**Where:** `RazorpayCheckout.tsx` line 83-90. `handleClose` calls `onPaymentFailed()` for any non-success status. `useCartPage.ts` `handleRazorpayFailed` (line 394) polls 3 times then cancels ALL pending orders.

**What happens:** Buyer opens Razorpay checkout, sees the amount, decides to review cart first, taps "Cancel". The `handleClose` fires `onPaymentFailed` → orders are cancelled → buyer sees "Payment was not completed. Your order has been cancelled." They have to rebuild from scratch. A simple "let me think about it" becomes a destructive action.

**Fix:**
1. In `RazorpayCheckout.tsx`, add `onDismiss` prop. In `handleClose`, when `status === 'pending'` (user never attempted payment), call `onDismiss` instead of `onPaymentFailed`.
2. In `CartPage.tsx`, pass `onDismiss` to close the checkout without cancelling orders.
3. In `useCartPage.ts`, add a `handleRazorpayDismiss` that just closes the UI:
```typescript
const handleRazorpayDismiss = () => {
  setShowRazorpayCheckout(false);
  // Orders stay pending — user can retry
};
```

---

## Bug 5: `handleRazorpaySuccess` never sends payment ID server-side — stuck orders when webhook is slow

**Where:** `useCartPage.ts` lines 370-392. After Razorpay's `handler` callback fires with `razorpay_payment_id`, the client only polls `orders.payment_status` for 15 seconds hoping the webhook already updated it.

**What happens:** If the webhook is delayed (5-30 seconds is common with Razorpay), the 15-second poll (10 × 1.5s) times out. Buyer sees "Payment is being verified" toast, navigates to order page, but order shows unpaid. Cart was NOT cleared. Buyer is stuck — retrying creates duplicates, waiting is uncertain.

The `razorpay_payment_id` from the client callback is proof of payment that should be stored immediately.

**Fix:** Before starting the poll loop, immediately update the order:
```typescript
if (targetOrderId) {
  await supabase.from('orders')
    .update({ razorpay_payment_id: paymentId })
    .eq('id', targetOrderId)
    .eq('buyer_id', user.id)
    .eq('payment_status', 'pending');
}
```
This doesn't replace the webhook (which also updates `payment_records`), but ensures the payment ID is recorded even if the webhook is slow.

---

## Summary

| # | Bug | Severity | Files |
|---|-----|----------|-------|
| 1 | Multi-vendor Razorpay pays only first order | **CRITICAL** — money loss | 6 files (2 edge functions + 4 client) |
| 2 | Payment method stored as 'upi' for Razorpay | Medium — misleading data | `useCartPage.ts` |
| 3 | Razorpay session not restored on app resume | **HIGH** — lost payment flow | `useCartPage.ts` |
| 4 | Cancel button cancels orders | **HIGH** — destroys retry | `RazorpayCheckout.tsx`, `CartPage.tsx`, `useCartPage.ts` |
| 5 | Payment ID not sent server-side on success | **HIGH** — stuck orders | `useCartPage.ts` |

## Technical Details

**Files to edit:**
- `supabase/functions/create-razorpay-order/index.ts` — Bug 1
- `supabase/functions/razorpay-webhook/index.ts` — Bug 1
- `src/hooks/useRazorpay.ts` — Bug 1
- `src/components/payment/RazorpayCheckout.tsx` — Bugs 1, 4
- `src/pages/CartPage.tsx` — Bugs 1, 4
- `src/hooks/useCartPage.ts` — Bugs 2, 3, 4, 5

