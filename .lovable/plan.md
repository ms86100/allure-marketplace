

## Plan: Fix Auto-Cancel Rejection Reason & Razorpay UPI Intent Flow

---

### Problem 1: Incorrect "Cancelled by buyer" Message

**Root Cause (DB-level):** The `buyer_cancel_pending_orders` RPC (called when Razorpay/UPI payment fails) hardcodes:
```sql
rejection_reason = 'Cancelled by buyer: Payment was not completed'
```
This is misleading — the buyer didn't deliberately cancel; the system auto-cancelled because payment wasn't completed. Every failed-payment cancellation in the DB carries the wrong "Cancelled by buyer:" prefix.

**Evidence:** All 9 recent cancelled orders in the DB have `rejection_reason = 'Cancelled by buyer: Payment was not completed'` — none went through the auto-cancel edge function (which would write `"Order automatically cancelled — ..."`).

**Fix:** Database migration to alter the `buyer_cancel_pending_orders` RPC:

- Change rejection_reason from `'Cancelled by buyer: Payment was not completed'` to `'Order automatically cancelled — payment was not completed'`
- This aligns with the auto-cancel edge function's wording and the existing UI strip logic on OrderDetailPage line 275

Additionally, update the display logic on `OrderDetailPage.tsx` to show a contextual banner title:
- If rejection_reason contains "auto" → show "Auto-Cancelled" instead of generic "Order Cancelled"
- This makes the distinction clear to both buyers and sellers

---

### Problem 2: Razorpay UPI Intent Flow Not Working

**Root Cause:** The `config.display.blocks` feature in Razorpay Standard Checkout is a **gated feature** — it requires explicit activation on the merchant's Razorpay dashboard. If not activated, the configuration is silently ignored and Razorpay falls back to its default layout (cards/netbanking first, UPI via manual VPA entry).

The code in `useRazorpay.ts` lines 147-164 is syntactically correct but has no effect without merchant-level enablement.

**Fix:** Since we cannot control the Razorpay dashboard configuration from code, the fix is two-fold:

1. **`useRazorpay.ts`:** Simplify the `config` block to use Razorpay's `method.upi` preferred order approach instead of the gated `blocks` API. Set `method: { upi: true }` at the top level and use `config.display.preferences.show_default_blocks: true` to ensure UPI appears prominently without requiring the gated blocks feature.

2. **`RazorpayCheckout.tsx`:** Update the description text from "UPI · Cards · Wallets · Netbanking" to accurately reflect the payment methods available via the standard Razorpay modal (no false promise about UPI app intent buttons).

---

### Summary

| File | Change | Type |
|---|---|---|
| DB Migration | Fix `buyer_cancel_pending_orders` rejection_reason wording | SQL |
| `OrderDetailPage.tsx` line 274 | Show "Auto-Cancelled" when rejection_reason contains "auto" | UI |
| `useRazorpay.ts` lines 147-164 | Replace gated `blocks` config with standard `method` preferences | Config |
| `RazorpayCheckout.tsx` line 143 | Update payment method description text | UI |

Total: ~15 lines changed across 3 files + 1 DB migration.

