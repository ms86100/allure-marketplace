

# Round 4 Audit Report — Checkout, Payment & Workflow Engine

## Checkout & Payment Flow Audit

### Payment flows do NOT update order `status` — only `payment_status`

Both Razorpay and UPI flows correctly separate payment status from order status:

- **Razorpay webhook** (`razorpay-webhook/index.ts:160-168`): Updates `payment_status: 'paid'` and `razorpay_payment_id`. Does NOT change `status`. Guards against cancelled orders with `.neq('status', 'cancelled')`. **No workflow trigger conflict.**
- **Razorpay checkout** (`useCartPage.ts:299-314`): On success, polls `payment_status` for confirmation. Never updates `status`. **Clean.**
- **UPI deep link** (`UpiDeepLinkCheckout.tsx:182-232`): Calls `confirm_upi_payment` RPC which updates `payment_status` to `buyer_confirmed`. Does NOT change order `status`. **Clean.**
- **Payment failure** (`useCartPage.ts:316-328, 340-360`): Cancels orders via `.update({ status: 'cancelled' }).eq('payment_status', 'pending')`. The `placed → cancelled` transition exists for buyer in all workflows. The DB trigger runs with the authenticated user's role, and the transition is valid. **Safe.**

**Verdict: No bugs in checkout/payment flows related to the workflow engine.**

---

## Remaining Issues Found

### R4-1: `useAdminAnalytics` misclassifies `no_show` as "active" (P2)
**File:** `src/hooks/queries/useAdminAnalytics.ts:8-17`

`getStatusBucket()` classifies anything not in `DELIVERED_STATUSES` or `CANCELLED_STATUSES` as `active`. The `no_show` status is terminal but gets bucketed as "active", inflating active order counts and revenue in admin analytics.

**Fix:** Add `no_show` to a new terminal-negative bucket, or add it to `CANCELLED_STATUSES` since it represents a failed outcome:
```typescript
const CANCELLED_STATUSES = ['cancelled', 'no_show'];
```

### R4-2: `BuyerCancelBooking` bypasses workflow actor context (P2)
**File:** `src/components/booking/BuyerCancelBooking.tsx:86-90`

Direct `.update({ status: 'cancelled' })` without checking if the buyer has a `cancelled` transition from the current booking status. The DB trigger will validate, but error handling shows generic "Failed to cancel booking" — not the specific "Invalid status transition" message from the trigger.

**Fix:** Extract trigger error message in the catch block (same pattern as `useOrderDetail.ts:151-152`).

### R4-3: `ACTIVE_STATUSES` array is decorative but misleading (P3)
**File:** `src/hooks/queries/useAdminAnalytics.ts:10`

The constant lists 15 statuses but `getStatusBucket` doesn't use it — it uses fallback logic. Missing `at_gate` and `no_show` from the array. Since it's unused in code logic, it's just a maintenance hazard.

**Fix:** Delete the `ACTIVE_STATUSES` constant or add a comment that it's informational only.

### R4-4: Razorpay webhook doesn't handle `payment.authorized` event (Informational)
**File:** `supabase/functions/razorpay-webhook/index.ts:114`

Only handles `payment.captured`, `payment.failed`, and `refund.created`. If Razorpay is configured for manual capture, `payment.authorized` fires first and `payment.captured` never fires until manual capture. Currently fine if auto-capture is enabled (default).

---

## Summary

| Priority | Issue | Description | Fix |
|----------|-------|-------------|-----|
| **P2** | R4-1 | `no_show` counted as active in admin analytics | Add to `CANCELLED_STATUSES` |
| **P2** | R4-2 | `BuyerCancelBooking` error handling doesn't surface trigger message | Extract error like `useOrderDetail` |
| **P3** | R4-3 | `ACTIVE_STATUSES` is unused and stale | Delete or annotate |
| **Info** | R4-4 | Razorpay `payment.authorized` not handled | Fine with auto-capture |

**Checkout and payment flows are clean.** No workflow conflicts found in Razorpay, UPI deep link, or payment failure cancellation paths. The webhook correctly updates only `payment_status`, never `status`.

