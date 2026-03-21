

# Final Gap Analysis & Production Fix

## Gaps Found

### Gap 1: `BuyerCancelBooking` — Double Prefix Bug (Critical)
**File:** `src/components/booking/BuyerCancelBooking.tsx` line 86

The fallback reason is `'Cancelled by buyer'`, which gets sent to `buyer_cancel_order` RPC. The RPC prepends `'Cancelled by buyer: '`, resulting in:
`"Cancelled by buyer: Cancelled by buyer"` in the database.

**Fix:** Change the fallback from `'Cancelled by buyer'` to `'No reason provided'`.

### Gap 2: `buyer_cancel_pending_orders` RPC — Hardcoded Double Prefix (Critical)
**File:** `supabase/migrations/…` — The `buyer_cancel_pending_orders` function hardcodes:
```sql
rejection_reason = 'Cancelled by buyer: Payment was not completed'
```
This is fine on its own (no double prefix), BUT the UI strip logic on `OrderDetailPage.tsx` strips `"Cancelled by buyer: "`, leaving just `"Payment was not completed"` — which is correct. No fix needed here, just confirming consistency.

### Gap 3: Auto-Cancel Missing Notification Trigger (Medium)
**File:** `supabase/functions/auto-cancel-orders/index.ts`

After cancelling orders, the edge function does NOT invoke `process-notification-queue`. Both buyer and seller receive no push notification when an order is auto-cancelled. Every other status change in the codebase triggers this.

**Fix:** After the cancel loop completes, invoke `process-notification-queue` via a fetch call to the edge function URL.

### Gap 4: Test File Has Stale Assertion (Low)
**File:** `src/test/orders-payments.test.ts` line 413

The test asserts `rejection_reason: 'Cancelled by buyer: Changed my mind'` which matches the DB RPC output. But line 415 asserts `toContain('Cancelled by buyer')` — this is still correct post-fix. No action needed.

## Implementation Plan

### 1. Fix BuyerCancelBooking fallback reason
**File:** `src/components/booking/BuyerCancelBooking.tsx`
- Line 86: Change `|| 'Cancelled by buyer'` → `|| 'No reason provided'`
- Line 97: Same change for the booking table update fallback

### 2. Add notification trigger to auto-cancel edge function
**File:** `supabase/functions/auto-cancel-orders/index.ts`
- After the cancel + auto-complete loops, if any orders were affected, call `process-notification-queue` using the Supabase URL + service role key (same pattern used elsewhere in edge functions).

### Summary

| # | Issue | Severity | File |
|---|-------|----------|------|
| 1 | BuyerCancelBooking double-prefix fallback | Critical | `BuyerCancelBooking.tsx` |
| 2 | Auto-cancel missing push notifications | Medium | `auto-cancel-orders/index.ts` |

Two surgical edits. No database migration needed.

