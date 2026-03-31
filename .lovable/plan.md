

# 2 Critical Buyer-Side Notification Bugs — Pre-Production Audit

## Bug 1: Stale Order Notifications Never Cleaned Up (Type Mismatch)

### Root Cause Analysis

The `cleanupStaleDeliveryNotifications` function (in `useNotifications.ts`, line 44-46) defines eligible types for stale cleanup:

```typescript
const staleEligibleTypes = new Set([
  'delivery_delayed', 'delivery_stalled', 'delivery_en_route', 'delivery_proximity', 'delivery_proximity_imminent',
  'order_status', 'order_update', 'order_placed', 'order_confirmed', 'order_preparing', 'order_ready',
]);
```

It then checks `n.type` (the DB column) against this set (line 51).

However, the DB trigger `fn_enqueue_order_status_notification` (migration `20260318112122`, line 250-252) inserts ALL order status notifications with:

```sql
INSERT INTO public.notification_queue (user_id, type, title, body, ...)
VALUES (NEW.buyer_id, 'order', v_title, v_body, ...);
```

The DB column `type` is always **`'order'`** — never `'order_status'`, `'order_update'`, `'order_placed'`, etc. Those strings exist only inside `payload->>'type'`, not the column. The cleanup function checks `n.type` (the column), so it **never matches any order notification**.

The delivery-specific types (`delivery_en_route`, `delivery_stalled`, etc.) DO use those exact strings as the DB column type (verified in `update-delivery-location/index.ts` line 374). So delivery cleanup works, but order status cleanup is completely broken.

### Impact Assessment

- **Severity: High** — Every order generates 3-6 status notifications (accepted → preparing → ready → delivered → completed). Once the order reaches a terminal state, all intermediate notifications become stale. They are never auto-marked as read.
- **Unread badge inflation**: A buyer with 10 completed orders could have 30-50 stale unread notifications permanently inflating their badge count. The badge says "47 unread" but there are zero actionable items.
- **Trust erosion**: The buyer opens the inbox, sees dozens of old "Order Accepted" and "Being Prepared" notifications for already-delivered orders, all highlighted as unread. The notification system feels broken and unreliable.
- **Affected flows**: `useAppLifecycle` cold-start cleanup, `NotificationInboxPage` on-mount cleanup, unread badge count (`useUnreadNotificationCount`), home banner (`useLatestActionNotification`).

### Reproduction Steps

1. Place 3 orders as a buyer
2. Let all 3 orders progress through accepted → preparing → ready → delivered → completed
3. Each order generates ~5 notifications, all with `type: 'order'` in the DB
4. Open the app — `useAppLifecycle` runs `cleanupStaleDeliveryNotifications`
5. The function iterates notifications, checks `staleEligibleTypes.has(n.type)` where `n.type === 'order'`
6. `'order'` is NOT in `staleEligibleTypes` → zero notifications match → zero cleanup
7. All 15 notifications remain unread despite all orders being terminal
8. Unread badge shows "15" with nothing actionable

### Reverse Engineering Analysis

**Modules affected by fix**:
- `cleanupStaleDeliveryNotifications` — adding `'order'` to `staleEligibleTypes`
- `useAppLifecycle` — calls the function; benefits automatically
- `NotificationInboxPage` — calls the function; benefits automatically
- `useUnreadNotificationCount` — badge will correctly decrease after cleanup

**Potential risks**:
1. Adding `'order'` could mark **active** order notifications as read if the linked order hasn't reached terminal state yet. But the function already checks terminal status (`delivered`, `completed`, `cancelled`, `no_show`) before marking as read — so this is safe.
2. First cleanup after fix may mark dozens of notifications as read in a single batch. The `supabase.update().in('id', staleIds)` handles this fine — no performance concern.

### Implementation Plan

**File**: `src/hooks/queries/useNotifications.ts`, line 44-47

Add `'order'` to `staleEligibleTypes`:

```typescript
const staleEligibleTypes = new Set([
  'delivery_delayed', 'delivery_stalled', 'delivery_en_route', 'delivery_proximity', 'delivery_proximity_imminent',
  'order_status', 'order_update', 'order_placed', 'order_confirmed', 'order_preparing', 'order_ready',
  'order',  // DB trigger uses 'order' as the column type for all order status notifications
]);
```

Also fix the `orderId` extraction (line 52) to check `orderId` (camelCase) in addition to `order_id`:

```typescript
const oid = (n.payload as any)?.orderId || (n.payload as any)?.order_id || (n.payload as any)?.entity_id || n.reference_path?.split('/orders/')?.[1];
```

Same fix on line 71 (the filter lambda).

### Validation & Assurance

- **Pre-fix**: Query `user_notifications` for a buyer with completed orders — confirm unread count includes stale order notifications with `type = 'order'`
- **Post-fix**: Trigger cleanup, verify those notifications are marked as read
- **Regression**: Active order notifications (non-terminal) must remain unread — verified by the terminal status check in the function
- **Edge case**: Buyer with zero orders — cleanup short-circuits at `orderIds.size === 0`

---

## Bug 2: `useLatestActionNotification` Misses `orderId` Key — Terminal Filter Partially Broken

### Root Cause Analysis

`useLatestActionNotification` (line 131-134) extracts order IDs from notification payloads to filter out terminal/stale orders:

```typescript
for (const n of notifications) {
  const oid = n.payload?.order_id || n.reference_path?.split('/orders/')?.[1];
  if (oid) orderIds.add(oid);
}
```

The DB trigger stores the order ID as `orderId` (camelCase) in the payload:

```sql
jsonb_build_object('orderId', NEW.id::text, 'status', NEW.status::text, 'type', 'order_status', ...)
```

So `n.payload?.order_id` is always `undefined` for trigger-generated notifications. The `reference_path` fallback works for most cases, but:

1. **Line 164** has the same issue — the terminal/stale filter check uses `n.payload?.order_id` which misses the camelCase key
2. Notifications inserted by edge functions (e.g., `confirm-razorpay-payment` line 238) use `payload: { orderId, ... }` — also camelCase
3. The `reference_path` fallback works IF the path matches `/orders/{id}` — but some notification types use different paths or null `reference_path`

The practical impact: when `reference_path` is present (most order notifications), the fallback works and the terminal filter functions. But any notification with a null `reference_path` and an `orderId` payload key will not be linked to its order, and the terminal filter will fail to exclude it — causing stale notifications to appear on the home banner.

### Impact Assessment

- **Severity: Medium-High** — The home banner (`HomeNotificationBanner`) shows a stale notification for a completed/cancelled order. The buyer sees "Order Accepted" on their home screen for an order that was delivered yesterday. They tap it, navigate to the order, and see it's already completed — a confusing, trust-eroding experience.
- **Trigger condition**: Any `order` type notification where `reference_path` is null but `payload.orderId` exists. This can happen when notifications are inserted by edge functions with missing `reference_path`.
- **Affected flows**: Home screen banner, notification-driven navigation.

### Reproduction Steps

1. Receive a notification where `reference_path` is null but `payload: { orderId: '...' }` exists
2. The order reaches terminal state (delivered/completed)
3. `useLatestActionNotification` runs — tries `n.payload?.order_id` → undefined
4. `reference_path?.split('/orders/')` → undefined (no reference_path)
5. `oid` is undefined → order ID not collected → terminal check skipped
6. The notification passes the filter and appears on the home banner despite being for a completed order

### Reverse Engineering Analysis

**Modules affected by fix**:
- `useLatestActionNotification` — lines 133 and 164
- `cleanupStaleDeliveryNotifications` — lines 52 and 71 (same key mismatch — covered in Bug 1 fix)

**Potential risks**:
1. Adding `orderId` lookup could theoretically extract a non-UUID string if some payload uses `orderId` for a different purpose. However, all notification inserts consistently use `orderId` for the order UUID.
2. No risk to other query consumers — this is a read-only extraction.

### Implementation Plan

**File**: `src/hooks/queries/useNotifications.ts`

**Line 133**: Fix order ID extraction in `useLatestActionNotification`:
```typescript
const oid = n.payload?.orderId || n.payload?.order_id || n.reference_path?.split('/orders/')?.[1];
```

**Line 164**: Same fix in the filter loop:
```typescript
const linkedOid = n.payload?.orderId || n.payload?.order_id || n.reference_path?.split('/orders/')?.[1];
```

### Validation & Assurance

- **Test**: Create a notification with `payload: { orderId: 'abc' }` and no `reference_path`, linked to a terminal order. Verify `useLatestActionNotification` excludes it.
- **Regression**: Notifications with `reference_path` set continue to work via the fallback — the `||` chain preserves backward compatibility.
- **Edge case**: Non-order notifications (no `orderId`, no `reference_path`) return `undefined` for `oid` and are correctly not filtered by the terminal check.

---

## Summary

| # | Bug | File | Confidence | Severity | Effort |
|---|-----|------|-----------|----------|--------|
| 1 | Stale order notifications never cleaned — `'order'` type missing from eligible set | `useNotifications.ts` line 44 | 100% | High — permanent badge inflation | ~3 min |
| 2 | `orderId` camelCase key missed in terminal filter | `useNotifications.ts` lines 52, 71, 133, 164 | 100% | Medium-High — stale home banner | ~3 min |

Both bugs are in the same file. All fixes are additive string additions — no logic changes, no schema changes, no refactoring.

