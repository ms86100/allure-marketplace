

# Deep QA Audit — Round 6

After thorough codebase inspection, I identified the following new bugs and issues that are distinct from the Round 5 fixes.

---

## BUG 1: `useBuyerOrderAlerts` suppresses toasts when `oldStatus === undefined` — blocks all alerts on REPLICA IDENTITY DEFAULT
**Severity: HIGH — buyer never sees in-app toast notifications for order status changes**

File: `src/hooks/useBuyerOrderAlerts.ts` line 51:
```typescript
if (!newStatus || oldStatus === undefined || newStatus === oldStatus) return;
```

The `orders` table uses REPLICA IDENTITY DEFAULT. This means `payload.old` only contains the primary key (`id`), NOT the `status` column. So `(payload.old as any)?.status` is always `undefined`. The guard `oldStatus === undefined` therefore returns early on EVERY update, silencing all buyer toasts.

The comment on line 50 says "If old status is undefined (REPLICA IDENTITY not FULL), skip to avoid spam toasts" — but this logic prevents ALL toasts, not just spam.

**Fix:** Remove the `oldStatus === undefined` guard. Instead, deduplicate via the toast ID (`order-${orderId}-${newStatus}`) which already prevents duplicates. The `newStatus === oldStatus` check is unreachable due to the undefined guard, so also remove it since it can't work without FULL replica identity anyway.

Change line 51 to:
```typescript
if (!newStatus) return;
```

This is safe because:
- Toast dedup via `id: \`order-${orderId}-${newStatus}\`` prevents repeated toasts for the same status
- The `placed` status is already filtered on line 54
- The cart page suppression on line 57 prevents checkout noise

---

## BUG 2: `DeliveryStatusCard` realtime uses `event: '*'` but payload.new may not have all fields for DELETE events
**Severity: LOW — minor, but DELETE events will set assignment to `{}`**

File: `src/components/delivery/DeliveryStatusCard.tsx` line 46-53:
```typescript
.on('postgres_changes', { event: '*', ... }, (payload) => {
  if (payload.new) {
    setAssignment(payload.new as DeliveryAssignment);
  }
})
```

On DELETE events, `payload.new` is `{}` (empty object), which is truthy. This would set assignment to an empty object, breaking the UI. Not likely in practice (assignments rarely deleted), but it's a code smell.

**Fix:** Change `event: '*'` to `event: 'UPDATE'` since we only care about status changes, or add a guard `if (payload.new?.id)`.

---

## BUG 3: `DeliveryStatusCard` missing `on_the_way` in DELIVERY_STATUS_CONFIG
**Severity: MEDIUM — `on_the_way` status shows fallback "Assigning Rider" badge**

File: `src/components/delivery/DeliveryStatusCard.tsx` line 24-32:
```typescript
const DELIVERY_STATUS_CONFIG = {
  pending, assigned, picked_up, at_gate, delivered, failed, cancelled
};
```

The `on_the_way` status is missing. When an assignment reaches `on_the_way` (set by `sync_order_to_delivery_assignment`), the config falls back to `DELIVERY_STATUS_CONFIG.pending` (line 89: `|| DELIVERY_STATUS_CONFIG.pending`), showing "Assigning Rider" — completely wrong.

Also, the `deliverySteps` array on line 92 (`['pending', 'assigned', 'picked_up', 'at_gate', 'delivered']`) is missing `on_the_way`, so the progress dots skip it.

**Fix:** Add `on_the_way: { label: 'On The Way', color: 'bg-primary/15 text-primary', icon: Truck }` to the config map, and add `'on_the_way'` to the `deliverySteps` array between `picked_up` and `at_gate`.

---

## BUG 4: `useDeliveryTracking` — `eta` and `distance` can be silently reset to `null` on realtime updates
**Severity: MEDIUM — ETA/distance flicker to null on partial updates**

File: `src/hooks/useDeliveryTracking.ts` lines 107-108:
```typescript
eta: d.eta_minutes ?? prev.eta,
distance: d.distance_meters ?? prev.distance,
```

The `??` operator only guards against `null`/`undefined`. But the edge function explicitly sets `distance_meters` in every update (line 237 of edge function), and sets `eta_minutes` only when `!skipEtaUpdate`. When `skipEtaUpdate` is true (accuracy > 100m), `eta_minutes` is NOT included in the update payload.

With REPLICA IDENTITY DEFAULT, `d.eta_minutes` will be `undefined` for those partial updates, so `??` correctly falls back. This is actually OK.

However, when `eta_minutes` IS included and is legitimately `null` (e.g., no destination coordinates), `d.eta_minutes ?? prev.eta` would keep the stale previous ETA instead of showing null. This is a minor data staleness issue but not critical.

**Status:** Minor — no fix needed for production readiness.

---

## BUG 5: `SellerGPSTracker` auto-start has stale closure for `isTracking`
**Severity: LOW — double-start possible in rare timing conditions**

File: `src/components/delivery/SellerGPSTracker.tsx` line 18-21:
```typescript
useEffect(() => {
  if (autoStart && !isTracking && !permissionDenied) {
    startTracking();
  }
}, [autoStart]); // Only on mount — intentionally not tracking `isTracking`
```

The dependency array intentionally excludes `isTracking` and `startTracking`. The `startTracking` callback depends on `state.isTracking` (line 58 of `useBackgroundLocationTracking.ts`), which has its own guard. So double-start is prevented at the hook level. This is fine.

**Status:** No fix needed.

---

## BUG 6: `liveActivitySync` ACTIVE_STATUSES missing `'placed'` — Live Activity won't start on order placement
**Severity: LOW — by design, Live Activities start from `accepted` onwards**

The `ACTIVE_STATUSES` array in `liveActivitySync.ts` starts at `'accepted'`. The `placed` status is intentionally excluded because the order hasn't been confirmed yet. This is correct behavior.

**Status:** No fix needed.

---

## Summary

| # | Bug | Severity | Fix Required |
|---|-----|----------|-------------|
| 1 | Buyer toast notifications blocked by undefined guard | **HIGH** | Yes |
| 2 | DeliveryStatusCard DELETE event handling | LOW | Yes (minor) |
| 3 | `on_the_way` missing from DeliveryStatusCard config | **MEDIUM** | Yes |
| 4 | ETA null staleness | Minor | No |
| 5 | SellerGPSTracker stale closure | Low | No |
| 6 | ACTIVE_STATUSES design | N/A | No |

---

## Implementation Plan

### Frontend Fixes (3 files)

**1. `src/hooks/useBuyerOrderAlerts.ts` (Bug 1)**
- Line 51: Remove `oldStatus === undefined ||` and `newStatus === oldStatus` checks
- Change to: `if (!newStatus) return;`

**2. `src/components/delivery/DeliveryStatusCard.tsx` (Bugs 2 & 3)**
- Add `on_the_way` to `DELIVERY_STATUS_CONFIG` map
- Add `'on_the_way'` to `deliverySteps` array between `picked_up` and `at_gate`
- Change realtime event from `'*'` to `'UPDATE'` (or add `payload.new?.id` guard)

No database changes or edge function changes needed.

