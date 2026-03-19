

# Fix: Home Banner Persistence + Delivery Code After Completion

## Root Cause Analysis

### Issue 1: Home banner persists after delivery
The `HomeNotificationBanner` shows the latest **unread** notification with an `action` payload. When the order completes, the "Delivery slightly delayed" notification is never auto-marked as read — it stays unread indefinitely, so the banner keeps appearing even though the order is done.

**The system lacks a mechanism to auto-dismiss delivery-related notifications when the order reaches a terminal state.**

### Issue 2: Delivery code visible after delivery
For the `seller_delivery` flow, the status `delivered` has `is_terminal = false` in `category_status_flows`. It's an intermediate step before `completed`. The OTP card uses `!isTerminalStatus(...)` to decide visibility, so it correctly (per data) shows for `delivered`. But from a **product perspective**, once the order is `delivered`, the delivery code has served its purpose and should no longer be shown.

This is a semantic gap: `delivered` means "delivery confirmed" but isn't terminal in the flow because `completed` is the final state (involving payment confirmation, etc.). The OTP card shouldn't care about terminal status — it should care about whether **the delivery act is done**.

### Issue 3: Notification content is stale
The "Delivery slightly delayed" banner says "Updated ETA: 1 min" from 11 hours ago. This is misleading post-delivery. Delivery-related notifications should be auto-cleared when the order reaches delivery completion.

## Plan

### Fix 1: Auto-mark delivery notifications as read on order completion

**Database migration** — Create a trigger on `orders` that marks all delivery-related notifications as read when the order transitions to `delivered` or `completed`:

```sql
CREATE OR REPLACE FUNCTION auto_dismiss_delivery_notifications()
RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('delivered', 'completed') 
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE user_notifications
    SET is_read = true
    WHERE user_id = NEW.buyer_id
      AND is_read = false
      AND type IN ('delivery_delayed', 'delivery_stalled', 
                   'delivery_en_route', 'delivery_proximity',
                   'delivery_proximity_imminent')
      AND (payload->>'order_id' = NEW.id::text 
           OR reference_path LIKE '%' || NEW.id || '%');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This ensures the home banner disappears as soon as the order is delivered/completed.

### Fix 2: Hide delivery code once delivery is done (not just terminal)

**File: `src/pages/OrderDetailPage.tsx`**

Change the OTP card condition from:
```
!isTerminalStatus(o.flow, order.status)
```
to:
```
!isTerminalStatus(o.flow, order.status) && !['delivered', 'completed'].includes(order.status)
```

This is a belt-and-suspenders approach: even if `delivered` isn't terminal in the flow, the delivery code is no longer relevant once the package has been handed over.

### Fix 3: HomeNotificationBanner — filter out stale delivery notifications for completed orders

**File: `src/hooks/queries/useNotifications.ts`**

In `useLatestActionNotification`, add a secondary check: if the notification is delivery-related and the referenced order is now terminal, skip it. This is a lightweight client-side safety net in case the trigger hasn't fired yet.

Alternatively (simpler): rely on the trigger from Fix 1 to mark them read, which already excludes them from the query (`is_read = false`).

**Recommendation:** The trigger (Fix 1) is sufficient. No client-side change needed for the banner — the trigger handles it at the database level.

## Summary of Changes

| File | Change |
|------|--------|
| Database migration (new) | Trigger to auto-mark delivery notifications as read on order completion |
| `src/pages/OrderDetailPage.tsx` | Hide OTP card when status is `delivered` or `completed` (regardless of terminal flag) |

## Product Perspective

These changes reflect empathetic design:
- **No leftover artifacts** — once delivery is done, all in-progress UI elements (banner, OTP code) disappear
- **No misleading information** — stale "delayed" alerts don't linger after successful delivery
- **Clean state transitions** — the UI clearly communicates "this order is done" without residual noise

