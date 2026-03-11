

# UPI Deep Link Payment Module — Third Stability Audit

After a comprehensive scan of all files, RPCs, edge functions, order lifecycle, and frontend components, here are the remaining issues.

---

## Issue 1 — MEDIUM: `onClose` is a No-Op, Sheet Cannot Be Dismissed

**File**: `src/pages/CartPage.tsx`, line 289

```
onClose={() => {}}
```

The `UpiDeepLinkCheckout` component's `handleClose` calls both `onPaymentFailed()` AND `onClose()`. But `onClose` is `() => {}` — it never sets `showUpiDeepLink` to `false`. So the actual sheet dismiss relies on the Sheet's `onOpenChange` prop (which is wired to `handleClose`). 

When `handleClose` runs:
1. If `step === 'pay'`: calls `onPaymentFailed()` → which calls `setShowUpiDeepLink(false)` ✓ (via `handleUpiDeepLinkFailed`)
2. If `step !== 'pay'`: calls only `onClose()` → which is `() => {}` → **sheet never closes**

**Impact**: After the buyer progresses past step 1 (clicks "Pay Now"), the sheet's swipe-to-dismiss and backdrop click will fire `handleClose`, but since `step` is `confirm/utr`, it only calls the empty `onClose`. The sheet content remains visible but the overlay state is broken — the Sheet thinks it's closed but `showUpiDeepLink` is still `true`.

**Fix**: Change `onClose` to `() => c.setShowUpiDeepLink(false)` OR update `handleClose` to always call `onClose()` which actually updates the state.

---

## Issue 2 — MEDIUM: `finalAmount` Used Instead of Per-Seller Amount

**File**: `src/pages/CartPage.tsx`, line 289

```
amount={c.finalAmount}
```

`finalAmount` includes coupon discounts and delivery fees across the entire cart. But the UPI deep link payment goes to a single seller. If a coupon reduces the total by ₹50, or delivery fee adds ₹30, the UPI link will show the wrong amount (cart total, not the seller's subtotal).

**Impact**: Buyer pays wrong amount to seller. Seller sees a different amount than expected. Mismatched payment creates disputes.

**Fix**: Use `c.sellerGroups[0]?.subtotal` for the UPI amount (the actual amount owed to that seller). Delivery fee and coupon adjustments should be handled separately or noted.

---

## Issue 3 — LOW: Double Notification to Seller on Order Creation

**File**: `UpiDeepLinkCheckout.tsx` lines 112-121 + `create_multi_vendor_orders` RPC

When a buyer submits UTR:
1. The `confirm_upi_payment` RPC updates payment status
2. `UpiDeepLinkCheckout` then manually inserts a notification: "Payment Confirmation Needed"

But `create_multi_vendor_orders` already inserted a "New Order Received!" notification when the order was created. The `enqueue_order_status_notification` trigger also fires on status changes. So the seller gets:
- Notification 1: "New Order Received!" (from RPC)  
- Notification 2: "Payment Confirmation Needed" (from frontend)

This is **expected behavior** (two different notifications for two different events), but worth confirming it's intentional. Not a bug.

---

## Issue 4 — LOW: Disputed Payment Has No Resolution Path

**File**: `verify_seller_payment` RPC, `SellerPaymentConfirmation.tsx`

When seller clicks "Not Received", `payment_status` becomes `'disputed'` and `payment_confirmed_by_seller = false`. But there is:
- No UI for the buyer to see the dispute reason or retry
- No UI for admin to resolve disputes
- No way to re-trigger seller confirmation after a dispute
- The order remains in `placed` status with `disputed` payment — effectively stuck

The `OrderDetailPage` shows the "Disputed" badge but no actionable next step.

**Impact**: Orders with disputed payments become permanently stuck. No way to resolve without direct database intervention.

**Fix**: Add a resolution path — either allow buyer to resubmit UTR (reset to `pending`), or allow admin to manually set payment status, or auto-cancel after X hours of dispute.

---

## Issue 5 — LOW: Admin Mode Switch During Active Checkout

**File**: `CredentialsManager.tsx`, `usePaymentMode.ts`

If admin switches from `upi_deep_link` → `razorpay` while a buyer has the UPI checkout sheet open:
- `usePaymentMode` has a 10-minute stale time, so the buyer's session won't see the change immediately
- The order was already created with `payment_status: 'pending'`
- The UPI flow continues normally — no immediate break

But on the next checkout, the buyer's cached `paymentMode` may still show `upi_deep_link` for up to 10 minutes. This is **acceptable** — the old flow continues to work, and new sessions pick up the change.

**Not a bug** — just a note on eventual consistency.

---

## Issue 6 — LOW: `confirm_upi_payment` RPC Allows Only `pending` → `buyer_confirmed`

**File**: Migration, line 39

```sql
IF _order.payment_status NOT IN ('pending') THEN
  RAISE EXCEPTION 'Payment already processed';
```

If a buyer somehow triggers the UTR submission twice (e.g., double-tap, network retry), the second call throws "Payment already processed" and the frontend shows an error toast.

This is **correct defensive behavior**. But the error message shown to the user ("Failed to submit payment confirmation") is generic — could be improved to "Payment already submitted. Waiting for seller verification."

---

## Summary

| # | Issue | Severity | Action Required |
|---|-------|----------|----------------|
| 1 | `onClose` no-op prevents sheet dismiss after step 1 | **Medium** | Fix `onClose` prop |
| 2 | `finalAmount` includes coupon/delivery, wrong UPI amount | **Medium** | Use seller subtotal |
| 3 | Double seller notification (intended) | **Low** | No action |
| 4 | Disputed payments have no resolution path | **Low** | Add resolution UX |
| 5 | Admin mode switch during checkout (handled by cache) | **Low** | No action |
| 6 | Double UTR submit shows generic error | **Low** | Improve error text |

## Recommended Immediate Fixes

**Fix 1** — `CartPage.tsx` line 289, change `onClose`:
```tsx
onClose={() => c.setShowUpiDeepLink(false)}
```

**Fix 2** — `CartPage.tsx` line 289, change `amount`:
```tsx
amount={c.sellerGroups[0]?.subtotal || c.finalAmount}
```

These two are the only fixes that could cause real user-facing failures. The rest are improvements.

