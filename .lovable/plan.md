

## Multi-Vendor Order Flow — Critical Bug Audit

### Summary
**5 critical bugs found.** The most severe is a regression in the `create_multi_vendor_orders` RPC where a "bulletproof fix" for `auto_cancel_at` inadvertently stripped out delivery fees, coupon discounts, payment records, delivery radius validation, delivery_handled_by routing, coupon redemption tracking, and auth guards.

---

### Bug 1 (P0): RPC Regression — Missing delivery_fee, discount_amount, coupon_id, payment_records, delivery_handled_by

**What's broken:**
The latest `create_multi_vendor_orders` (migration `20260321135149`) was rewritten to add `auto_cancel_at` but lost these critical columns from the INSERT:
- `delivery_fee` — not persisted to orders table
- `discount_amount` — not persisted
- `coupon_id` — not persisted
- `delivery_handled_by` — not resolved or persisted (breaks seller vs platform delivery routing)
- No `payment_records` INSERT (webhook expects them for duplicate guard)
- No `coupon_redemptions` INSERT (coupons can be reused infinitely)
- No `auth.uid()` caller check (security regression)
- No delivery radius server-side validation (client-side only)
- No stock validation in RPC

**Why it's critical:**
- Razorpay webhook's atomic duplicate guard (`UPDATE payment_records ... WHERE razorpay_payment_id IS NULL`) will find NO rows → payments silently fail to record
- Settlements trigger reads `payment_records.platform_fee` → no record = no settlement for sellers
- `delivery_handled_by` is NULL → all delivery orders route to wrong workflow (`self_fulfillment` instead of `seller_delivery`)
- Coupons have no usage tracking → unlimited redemptions
- No auth guard → any authenticated user can create orders for any buyer_id

**Impact:** Payment recording, seller settlements, delivery workflow, coupon integrity, and authorization — all broken.

**Surgical fix:**
Recreate the RPC by merging the `20260313` version (which had all columns, payment_records, coupon_redemptions, radius check, auth guard) with the `20260321` version's additions (idempotency layers, advisory locks, `auto_cancel_at`, ON CONFLICT dedup). One migration, ~200 lines.

**Risk of fixing:** Low — the fix restores previously working logic. Must ensure the ON CONFLICT dedup path also handles the `delivery_handled_by` and `delivery_fee` columns correctly for idempotent retries.

---

### Bug 2 (P0): Razorpay Webhook Fails Silently for Multi-Vendor Orders

**What's broken:**
The `create-razorpay-order` edge function receives `sellerId` from the client (line 350 of CartPage.tsx: `sellerId={c.sellerGroups[0]?.sellerId}`). For multi-vendor carts, this is always the FIRST seller's ID. The Razorpay order is created with `notes.seller_id = firstSellerId`. But the webhook uses `notes.order_ids` (JSON array) to find ALL orders.

The real bug: since Bug 1 means no `payment_records` are created, the webhook's `UPDATE payment_records ... eq('order_id', orderId)` returns 0 rows for ALL orders → no payment is ever marked as paid.

**Why it's critical:** Real money paid by buyers but orders remain in `payment_status: 'pending'` → auto-cancelled after 3 minutes → buyer loses money.

**Fix:** Addressed by Bug 1 fix (restoring payment_records INSERT in the RPC).

---

### Bug 3 (P1): Delivery Fee Applied to Only First Seller's Order in Multi-Vendor Cart

**What's broken:**
In the `20260313` version (the last correct one), delivery fee is assigned to the first seller's order only (`_group_count = 1`). But the client calculates a single flat `effectiveDeliveryFee` based on global thresholds — not per-seller. For a 2-seller cart where one is nearby (free delivery) and one is far (paid delivery), the buyer pays the wrong amount.

**Why it's critical:** Financial inconsistency. Buyer either overpays or underpays delivery.

**Fix:** For now, the flat fee on the first order is acceptable (matches the bill details UI which shows a single "Delivery Fee" line). Document this as a known limitation. True per-seller delivery fees require UI + backend changes.

---

### Bug 4 (P1): Razorpay Payment Failure Cancels ALL Multi-Vendor Orders Without Granularity

**What's broken:**
`handleRazorpayFailed` calls `buyer_cancel_pending_orders` with ALL `pendingOrderIds`. If one of those orders was already accepted by a seller during the payment window (within the 3-minute timer), it still gets cancelled. The RPC should check status before cancelling.

**Why it's critical:** Seller accepted an order, started preparing, then it's cancelled because the buyer's payment failed.

**Fix:** The `buyer_cancel_pending_orders` RPC should only cancel orders still in `placed` status with `payment_status = 'pending'`. Verify the existing RPC has this guard.

---

### Bug 5 (P2): COD Orders Created with `payment_status: 'pending'` Instead of Contextually Correct Status

**What's broken:**
Line 389: COD orders call `createOrdersForAllSellers('pending')`. For COD, the payment isn't pending in the same way as online — it's "pay on delivery." But the 3-minute `auto_cancel_at` timer still applies, meaning COD orders auto-cancel if the seller doesn't accept within 3 minutes. This is correct behavior, but the `payment_status` of `'pending'` combined with the auto-cancel logic means the cancellation reason says "payment was not completed" — misleading for COD.

**Why it's critical:** Confusing cancellation messages for COD orders.

**Fix:** Update the auto-cancel edge function's cancellation reason to differentiate COD vs online payment timeouts: "Seller didn't respond in time" vs "Payment was not completed."

---

### Recommended Fix Priority

| Priority | Bug | Effort | Risk |
|----------|-----|--------|------|
| **Fix first** | Bug 1 (RPC regression) | High (~200 LOC SQL) | Medium — must merge two versions carefully |
| **Fix second** | Bug 2 (webhook no-op) | None — fixed by Bug 1 | None |
| **Verify** | Bug 4 (cancel guard) | Low — check existing RPC | Low |
| **Document** | Bug 3 (delivery fee) | None — known limitation | None |
| **Low priority** | Bug 5 (COD message) | Low — string change | None |

### Implementation Plan

**Single migration** to recreate `create_multi_vendor_orders` with:
1. All idempotency layers from `20260321` (advisory lock, ON CONFLICT, canonical response)
2. `auto_cancel_at` from `20260321`
3. `delivery_fee`, `discount_amount`, `coupon_id` columns from `20260313`
4. `delivery_handled_by` resolution from `20260317`
5. `payment_records` INSERT from `20260313` (inside the `else` new-order branch)
6. `coupon_redemptions` INSERT from `20260313`
7. `auth.uid()` caller check from `20260313`
8. Server-side delivery radius validation from `20260313`

**No client-side changes needed** — the client already passes all required parameters (`_delivery_fee`, `_coupon_id`, etc.), the RPC just ignores them.

### Files Changed
| File | Change |
|---|---|
| New SQL migration | Recreate `create_multi_vendor_orders` merging all required logic |

