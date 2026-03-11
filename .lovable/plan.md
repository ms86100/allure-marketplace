

# UPI Deep Link Payment Module — Bug Investigation Report

## Issues Found: 3 Real Bugs, 2 Silent Failure Risks

---

### BUG 1 — CRITICAL: Auto-Cancel Kills UPI-Paid Orders

**File**: `supabase/functions/auto-cancel-orders/index.ts`, lines 28-34

**Problem**: Query 1 (urgent orders) fetches ALL orders where `status = 'placed'` and `auto_cancel_at < now`. It does **not** check `payment_status`. When a buyer pays via UPI deep link for an urgent item:

1. Order created with `status: 'placed'`, `payment_status: 'pending'`, `auto_cancel_at: now+3min`
2. Buyer pays UPI, submits UTR → `payment_status` updates to `'buyer_confirmed'`
3. But `status` is still `'placed'` and `auto_cancel_at` is still set
4. Auto-cancel cron fires → cancels the order despite buyer having paid

**Impact**: Buyer pays real money, order gets auto-cancelled. Seller never sees it.

**Fix**: Add `.not("payment_status", "in", "(buyer_confirmed,paid)")` to Query 1, or clear `auto_cancel_at` when buyer confirms payment.

---

### BUG 2 — MEDIUM: Accidental Sheet Dismiss Cancels Paid Order

**File**: `src/components/payment/UpiDeepLinkCheckout.tsx`, line 130-134

**Problem**: The `Sheet` component's `onOpenChange` is wired to `handleClose`, which calls `onPaymentFailed()` whenever `step !== 'done'`. If the buyer:
1. Completes UPI payment in their bank app
2. Returns to the platform, is on the "Enter UTR" step
3. Accidentally swipes down / taps backdrop

The sheet closes → `handleUpiDeepLinkFailed` fires → order is cancelled with `status: 'cancelled'`. The buyer already paid but the order is gone.

**Fix**: In the `confirm` and `utr` steps, prevent dismiss or show a confirmation dialog before cancelling. At minimum, don't auto-cancel the order if the user is past the `pay` step.

---

### BUG 3 — MEDIUM: Cart Not Cleared After UPI Deep Link Success

**File**: `src/hooks/useCartPage.ts`, lines 238-244

**Problem**: `handleUpiDeepLinkSuccess` calls `refresh()` (which reloads cart data) and navigates away, but it does **not** call `clearCart()`. Compare with the COD flow (line 200) which also doesn't explicitly call `clearCart()` — but that flow relies on the RPC `create_multi_vendor_orders` which deletes `cart_items` in the database (line: `delete from public.cart_items where user_id = _buyer_id`).

Wait — the RPC does delete cart items. So `refresh()` should return empty. This is actually fine. **Not a bug** — the RPC already handles cart clearing.

*(Revised: this is NOT a bug)*

---

### SILENT FAILURE RISK 1 — Orphaned UPI Orders (15-min Window)

**File**: `supabase/functions/auto-cancel-orders/index.ts`, lines 36-43

**Problem**: Query 2 cancels orphaned UPI orders where `payment_status = 'pending'` and older than 15 minutes. This is correct and protects against abandoned orders. However, there's a **race window**: if the buyer takes 16+ minutes to complete the UPI payment (e.g., slow bank, app switch, distraction), the order gets cancelled before they can submit UTR.

**Impact**: Low — 15 minutes is generous for UPI. But worth noting.

**Mitigation**: Could extend to 30 minutes, or skip cancellation when `payment_status = 'buyer_confirmed'` (already handled — Query 2 only targets `pending`).

---

### SILENT FAILURE RISK 2 — No RLS `WITH CHECK` on Order Updates

**File**: Migration `20260130075657`, lines 241-250

**Problem**: The UPDATE policy uses `USING` but has no `WITH CHECK` clause. This means a buyer can update **any column** on their order — including `status`, `total_amount`, `seller_id`, etc. The `UpiDeepLinkCheckout` and `SellerPaymentConfirmation` components rely on this permissive policy, but it also means a malicious buyer could:
- Set their own `payment_status` to `'paid'` directly
- Change `total_amount` to 0
- Modify `payment_confirmed_by_seller` to `true`

**Impact**: Security vulnerability. Any authenticated buyer can manipulate their order data via the browser console.

**Fix**: Add a `WITH CHECK` clause or move sensitive updates (payment_status, payment_confirmed_by_seller) to a SECURITY DEFINER RPC that validates the caller's role.

---

## Summary

| # | Issue | Severity | Can Break Production? |
|---|-------|----------|----------------------|
| 1 | Auto-cancel ignores `buyer_confirmed` payment status | **Critical** | Yes — buyer pays, order cancelled |
| 2 | Sheet dismiss cancels order mid-payment flow | **Medium** | Yes — accidental data loss |
| 3 | No `WITH CHECK` on orders UPDATE RLS | **Medium** | Security — buyer can fake payment |
| 4 | 15-min orphan window (edge case) | **Low** | Rare edge case |

## Recommended Fixes

### Fix for Bug 1 (auto-cancel):
Add payment status guard to Query 1 in `auto-cancel-orders/index.ts`:
```typescript
.not("payment_status", "in", "(buyer_confirmed,paid)")
```

### Fix for Bug 2 (sheet dismiss):
In `UpiDeepLinkCheckout.tsx`, prevent dismiss after `pay` step:
```typescript
const handleClose = () => {
  if (step === 'pay') {
    onPaymentFailed();
    onClose();
  }
  // After pay step, require explicit cancel action
};
```

### Fix for Bug 3 (RLS security):
Create a `confirm_upi_payment` SECURITY DEFINER RPC that only allows buyers to set `payment_status = 'buyer_confirmed'` and `upi_transaction_ref`, and a `verify_seller_payment` RPC for sellers. Remove direct `.update()` calls from frontend components.

Shall I implement these fixes?

