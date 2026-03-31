

# Fix: Seller Not Receiving Notifications for All Stores

## Root Cause

There are **two distinct problems**:

### Problem 1: COD Orders — No Push Notification At All

The INSERT trigger `trg_enqueue_order_placed_notification` was **dropped** in migration `20260301064847` and never replaced. The only remaining trigger is `trg_enqueue_order_status_notification` which fires on **AFTER UPDATE** only.

- **COD orders** are inserted directly with `status = 'placed'` — no subsequent UPDATE occurs → **trigger never fires** → seller gets zero push notification
- **Razorpay/UPI orders** are inserted as `payment_pending`, then updated to `placed` on payment confirmation → trigger fires correctly

This explains the "sometimes works, sometimes doesn't" behavior — it's deterministic based on payment method.

### Problem 2: In-App Alerts Already Work Across All Stores ✅

`GlobalSellerAlert` in `App.tsx` (line 325-327) already passes **all** seller profile IDs to `useNewOrderAlert`. The realtime subscription and polling both check against all seller IDs. This part is correct.

### Problem 3: Push Notifications Already Work Across All Stores ✅

The DB trigger `fn_enqueue_order_status_notification` resolves `seller_profiles.user_id` from the order's `seller_id`. Since all stores belonging to one seller share the same `user_id`, push goes to the correct person regardless of which store is selected. This part is also correct — but only when the trigger fires (i.e., non-COD orders).

## Fix

### Database Migration: Re-add INSERT Trigger for New Orders

Add an `AFTER INSERT` trigger on orders that calls the same `fn_enqueue_order_status_notification` function, with a guard so it only fires for actionable statuses (`placed`, `enquired`).

The existing function already handles all the notification logic correctly — it just needs to also be called on INSERT.

```sql
-- Add AFTER INSERT trigger to cover COD orders (inserted directly as 'placed')
CREATE OR REPLACE TRIGGER trg_enqueue_order_notification_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.status IN ('placed', 'enquired'))
  EXECUTE FUNCTION public.fn_enqueue_order_status_notification();
```

**One concern**: `fn_enqueue_order_status_notification` has a guard at line 32:
```sql
IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
```

On INSERT, `OLD` is `NULL`, so `NULL IS NOT DISTINCT FROM 'placed'` → `FALSE` → the guard passes correctly. ✅

It also checks `OLD.status = 'payment_pending'` at line 38 — on INSERT, `OLD.status` is `NULL`, so that guard also passes correctly. ✅

### No Code Changes Required

- In-app alerts: already multi-store ✅
- Push delivery pipeline: already multi-store ✅
- The only fix is the missing INSERT trigger

## Summary

| Component | Status |
|-----------|--------|
| In-app bell alerts (all stores) | Already works ✅ |
| Push notifications (all stores) | Already works ✅ |
| COD order notifications | **BROKEN** — missing INSERT trigger |
| Online payment order notifications | Works ✅ |

**Single fix**: One SQL migration to add the INSERT trigger.

## Validation

1. Place a **COD order** → seller receives push notification immediately
2. Place a **Razorpay order** → seller receives push notification (no regression)
3. Multi-store seller: place orders on **Store A and Store B** → seller receives notifications for both without switching stores
4. Check `notification_queue` has entries for both COD and online orders

