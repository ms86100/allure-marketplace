

# 2 Critical Buyer-Side Notification Bugs — Round 2

## Bug 1: Cold-Start Stale Cleanup Doesn't Invalidate Home Banner Query

### Root Cause Analysis

`useAppLifecycle.ts` line 39-40 runs `cleanupStaleDeliveryNotifications` on cold start and marks stale order notifications as read in the DB. After cleanup, it only invalidates `['unread-notifications']`:

```typescript
cleanupStaleDeliveryNotifications(data as UserNotification[]).then(() => {
  queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
});
```

It does **not** invalidate `['latest-action-notification']` or `['notifications']`. Compare with `NotificationInboxPage.tsx` lines 42-44 which correctly invalidates all three after the same cleanup.

This was introduced when the cold-start cleanup was added separately from the inbox cleanup — the invalidation set was incomplete (copy-paste omission).

### Impact Assessment

- **Severity: Medium-High** — After cold start, `cleanupStaleDeliveryNotifications` marks stale order notifications as read in the DB. The unread badge count updates immediately. But `useLatestActionNotification` (which drives the `HomeNotificationBanner`) still holds cached data showing the now-read notification. The banner displays a stale "Order Accepted" card for a completed order for up to 30 seconds (the `refetchInterval`).
- **User experience**: Buyer opens app, sees "Order Accepted" banner for an order delivered yesterday. The unread badge says "0" but the banner is still visible — contradictory state. If they tap the banner action, they navigate to a completed order.
- **Affected flows**: Home screen banner, cold-start resume on native apps.

### Reproduction Steps

1. Complete 3 orders as a buyer (let them reach `delivered`/`completed`)
2. Force-close the app completely
3. Reopen the app (cold start triggers `useAppLifecycle`)
4. Observe: unread badge drops to 0, but the home banner still shows a stale order notification for ~30 seconds

### Reverse Engineering Analysis

**Modules affected**: Only `useAppLifecycle.ts` — adding two more `invalidateQueries` calls.

**Potential risks**:
1. Additional invalidations cause a brief re-fetch burst on cold start. Since `latest-action-notification` has `staleTime: 10_000`, this is negligible.
2. No risk to other modules — the `NotificationInboxPage` already does this exact pattern.

### Implementation Plan

**File**: `src/hooks/useAppLifecycle.ts`, line 40

Add missing invalidations after cleanup:

```typescript
cleanupStaleDeliveryNotifications(data as UserNotification[]).then(() => {
  queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
  queryClient.invalidateQueries({ queryKey: ['latest-action-notification'] });
});
```

### Validation

- Cold-start with stale notifications → banner clears immediately after cleanup, not after 30s delay
- Regression: inbox cleanup path unchanged; unread badge still updates correctly

---

## Bug 2: `useBuyerOrderAlerts` Fires Haptics for `payment_pending → cancelled` Transitions

### Root Cause Analysis

`useBuyerOrderAlerts.ts` line 49 suppresses haptics for `status === 'pending'` transitions:

```typescript
const statusChanged = newStatus && newStatus !== 'pending' && newStatus !== oldStatus;
```

But it does **not** suppress `payment_pending`. When the `auto-cancel-orders` edge function cancels a stale `payment_pending` order (buyer abandoned payment), the realtime channel fires with `oldStatus = 'payment_pending'`, `newStatus = 'cancelled'`. This passes the filter (`'cancelled' !== 'pending'` is true), triggering:

1. An **error haptic buzz** — the buyer feels their phone vibrate with an error pattern for an order they already forgot about
2. A **query invalidation storm** — all order queries, notification queries, and the active orders strip are invalidated simultaneously

The DB trigger `fn_enqueue_order_status_notification` explicitly suppresses notifications for `payment_pending → cancelled` (line 38-40 of the trigger). But the client-side realtime listener has no such guard — it was written before the `payment_pending` status existed.

### Impact Assessment

- **Severity: Medium-High** — On cold start, `useAppLifecycle` invokes `auto-cancel-orders` which sweeps all stale `payment_pending` orders. If the buyer has 3 abandoned payment orders, the realtime listener fires 3 error haptics in rapid succession. The buyer feels their phone buzz with error patterns immediately on app open — with no corresponding UI notification or toast (the DB trigger suppressed the notification). This is a phantom alert that erodes trust.
- **Query storm**: Each cancelled order triggers 5 query invalidations. With 3 orders, that's 15 simultaneous re-fetches on cold start, competing with the app's initial data load.
- **Affected flows**: App cold start, `auto-cancel-orders` cron, any payment timeout cancellation.

### Reproduction Steps

1. As a buyer, add items to cart and choose online payment
2. At the Razorpay/UPI payment screen, close the app without completing payment (creates `payment_pending` order)
3. Repeat 2-3 times to create multiple abandoned orders
4. Wait 30+ minutes (past the auto-cancel threshold)
5. Reopen the app — `auto-cancel-orders` fires, cancelling all `payment_pending` orders
6. The realtime listener fires error haptics for each cancellation — phone buzzes 3 times with error pattern
7. No notification appears (DB trigger suppressed it) — the haptic has no corresponding UI feedback

### Reverse Engineering Analysis

**Modules affected**: Only `useBuyerOrderAlerts.ts` — adding `payment_pending` to the suppression filter.

**Potential risks**:
1. If a `payment_pending` order transitions to a non-cancelled status (e.g., `payment_pending → placed` after successful payment), the haptic would also be suppressed. However, the `confirm-razorpay-payment` edge function handles this transition server-side, and the buyer sees on-screen confirmation — no haptic is needed.
2. Query invalidation is also suppressed for `payment_pending` transitions. This is correct — the buyer doesn't need order list refreshes for phantom orders.

### Implementation Plan

**File**: `src/hooks/useBuyerOrderAlerts.ts`, line 49

Add `payment_pending` to the suppression filter — suppress when `oldStatus` was `payment_pending`:

```typescript
const statusChanged = newStatus && newStatus !== 'pending' && newStatus !== oldStatus;
const paymentChanged = newPayment && newPayment !== oldPayment;
// Suppress phantom alerts for payment_pending orders (auto-cancelled, no user-facing notification)
if (!statusChanged && !paymentChanged) return;
if (oldStatus === 'payment_pending') return;
```

### Validation

- Abandon a payment, wait for auto-cancel, reopen app → no error haptic, no query storm
- Normal order transitions (placed → accepted → preparing) → haptics still fire correctly
- Razorpay payment success (`payment_pending → placed`) → no haptic (suppressed, but buyer sees on-screen confirmation already)

---

## Summary

| # | Bug | File | Confidence | Severity | Effort |
|---|-----|------|-----------|----------|--------|
| 1 | Cold-start cleanup doesn't invalidate banner query | `useAppLifecycle.ts` line 40 | 100% | Medium-High — stale banner for 30s | ~1 min |
| 2 | Realtime fires error haptics for `payment_pending` cancellations | `useBuyerOrderAlerts.ts` line 49 | 100% | Medium-High — phantom buzzes on cold start | ~1 min |

Both fixes are 1-2 line additions. No schema changes, no refactoring, no new features.

