

## P0 Fix: Stale "On The Way" Notification Banner Persisting After Delivery

### Root Cause (Two Bugs)

**Bug 1 — `useLatestActionNotification` only filters delivery-type notifications for terminal orders, not order status notifications.**

The hook (lines 112-125) checks if notifications with types like `delivery_en_route`, `delivery_stalled` etc. belong to terminal orders and marks them as read. But an `order_status` notification saying "On The Way" has type `order_status` or `order` — which is NOT in the `deliveryTypes` set. So it passes through and gets displayed even when the order is already `delivered`/`completed`.

**Bug 2 — `useBuyerOrderAlerts` doesn't invalidate `['latest-action-notification']`.**

When a terminal status arrives via Realtime, the hook invalidates `['orders']`, `['notifications']`, `['unread-notifications']`, and `['active-orders-strip']` — but NOT `['latest-action-notification']`. The banner query keeps serving stale cached data until its 30s polling interval fires.

### Fix

**File: `src/hooks/queries/useNotifications.ts`**
- Expand the terminal-order filter to include ALL order-linked notification types (not just delivery types). Any unread notification whose `reference_path` starts with `/orders/{id}` or has `payload.order_id` should be checked against terminal order statuses. This makes the stale-detection universal.
- Collect order IDs from ALL order-linked notifications, not just delivery-specific ones.

**File: `src/hooks/useBuyerOrderAlerts.ts`**
- Add `queryClient.invalidateQueries({ queryKey: ['latest-action-notification'] })` to the Realtime handler. This forces the banner to re-evaluate immediately on any status change, rather than waiting up to 30 seconds.

### Files Changed

| File | Change |
|---|---|
| `src/hooks/queries/useNotifications.ts` | Expand stale-notification detection to all order-linked types, not just delivery types |
| `src/hooks/useBuyerOrderAlerts.ts` | Add `['latest-action-notification']` invalidation on status change |

