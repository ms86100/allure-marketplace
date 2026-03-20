

## Investigation Findings

Three distinct root causes were identified:

### Bug 1: `isInTransit` logic is broken — Map and Live Tracking never appear

**Root cause**: In `useOrderDetail.ts` (line 239-246), `isInTransit` only returns `true` when the flow step's `actor === 'delivery'`. However, for the seller_delivery workflow (which this order uses), the `on_the_way` and `picked_up` statuses have `actor: 'seller'`, not `'delivery'`. This means:
- The DeliveryMapView (Google Maps tracking) never renders
- The LiveDeliveryTracker never renders  
- The SellerGPSTracker never renders (so no GPS data is written either)
- The buyer sees the static DeliveryStatusCard instead

**Fix**: Change `isInTransit` to also check against the DB-backed `transit_statuses` system setting (which correctly includes `['picked_up', 'on_the_way', 'at_gate']`). This is already available via `useTrackingConfig` which is imported on the page.

**File**: `src/hooks/useOrderDetail.ts` lines 239-246

### Bug 2: ActiveOrderStrip has no realtime updates on web

**Root cause**: The strip uses React Query with `refetchInterval: 60_000` (60 seconds) and no Supabase Realtime subscription. The `orders` table IS published for realtime, but no channel is created. The `useLiveActivityOrchestrator` does have realtime, but it's gated by `Capacitor.isNativePlatform()` and only drives native Live Activities.

**Fix**: Add a Supabase Realtime channel to `ActiveOrderStrip` that listens for order updates and invalidates the query. Also reduce the polling interval from 60s to 15s as a safety net.

**File**: `src/components/home/ActiveOrderStrip.tsx`

### Bug 3: No GPS location data is being recorded

**Root cause**: This is a consequence of Bug 1. Since `isInTransit` is false, the `SellerGPSTracker` component never renders for the seller, so the background location service never starts, and `delivery_locations` stays empty (`last_location_at` is null).

**Fix**: Automatically resolved by fixing Bug 1.

---

## Implementation Plan

### Step 1: Fix `isInTransit` in useOrderDetail.ts
- Replace the `actor === 'delivery'` check with a check against `transit_statuses` from system_settings
- Import and use the synchronous tracking config getter
- Also keep the actor check as a secondary signal for completeness

### Step 2: Add Realtime subscription to ActiveOrderStrip  
- Subscribe to `postgres_changes` on the `orders` table filtered by `buyer_id`
- On any UPDATE event, invalidate the `active-orders-strip` query
- Reduce `refetchInterval` from 60s to 15s as a fallback
- Clean up channel on unmount

### Technical Details

**useOrderDetail.ts change** (the critical fix):
```typescript
// Before:
const isInTransit = useMemo(() => {
  if (!order) return false;
  const transitStep = flow.find(s => s.status_key === order.status);
  if (transitStep?.actor === 'delivery') return true;
  return false;
}, [order?.status, flow]);

// After: check DB-backed transit_statuses from system_settings
const isInTransit = useMemo(() => {
  if (!order) return false;
  const transitStatuses = getTrackingConfigSync().transit_statuses;
  if (transitStatuses.includes(order.status)) return true;
  const transitStep = flow.find(s => s.status_key === order.status);
  if (transitStep?.actor === 'delivery') return true;
  return false;
}, [order?.status, flow]);
```

**ActiveOrderStrip.tsx change**: Add realtime channel that invalidates query on order updates, bringing web behavior closer to native.

