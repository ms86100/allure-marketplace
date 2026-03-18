

# Round 4 Production Readiness Audit

## Verified Working (Rounds 1-3)

All previously identified Critical and High issues are confirmed resolved:
- OTP triggers, RPCs, and delivery gate enforcement
- GPS filtering, OSRM road ETA, smooth marker interpolation
- Live Activity dedup, deep link 404 fix, lifecycle termination
- Stalled delivery monitor with DB-backed thresholds and notification text
- Status flow cache for dynamic START/TERMINAL sets
- Proximity thresholds and UI strings from system_settings
- LiveDeliveryTracker status hints from category_status_flows
- Hooks error fixed (useTrackingConfig moved above early returns at line 60)
- Auth readiness gate for cart queries

## Current Findings

### Finding 1: Stale ETA persists for orders with no active GPS (CRITICAL)

**Issue:** The delivery assignment for order `0ca43884` shows `distance_meters: 50, eta_minutes: 15, last_location_at: null`. The ETA of 15 minutes was written by the `update-delivery-location` edge function during an earlier GPS update, but since GPS stopped (last_location_at is null/cleared), the stale ETA persists in the DB indefinitely.

**Why it matters:** Buyer sees "15 min ETA" when the rider is 50m away (or GPS is stale). This is misleading and destroys trust.

**Root cause:** The `getSmartEta` function in `LiveDeliveryTracker.tsx` correctly prefers road ETA and distance-based ETA for <500m, but the ETA badge at line 150 also calls `getSmartEta` and displays the stale DB ETA when OSRM returns no route (both points are essentially the same location, OSRM returned distance=5m, duration=0.8s). The OSRM road ETA would be ~0 min, but `roadEtaMinutes` may not propagate correctly when OSRM returns near-zero values.

Additionally, the proximity message logic correctly shows "At your doorstep" for 50m, but the badge still shows the stale "14-16 min" range because `getSmartEta(50, 15, roadEta)` falls through to the distance-based calculation of `max(1, ceil(50/1000*4)) = 1` only when `roadEta` is null.

**Fix:**
1. In `LiveDeliveryTracker.tsx`, the ETA badge should suppress display when `isLocationStale` is true or `lastLocationAt` is null
2. In `useDeliveryTracking.ts`, mark location as stale when `last_location_at` is null (currently only checks age threshold, but null means never reported or cleared)
3. In `getSmartEta`, when distance < proximity doorstep threshold, always return 1 regardless of DB ETA

### Finding 2: `last_location_at: null` not treated as stale (HIGH)

**Issue:** `useDeliveryTracking` line 63-69 checks staleness by comparing `Date.now() - lastLocationAt`. When `lastLocationAt` is null, it returns early and never sets `isLocationStale = true`. So if GPS was never recorded (or was cleared), the system does not warn the buyer.

**Root cause:** The staleness check at line 65 (`if (!prev.lastLocationAt) return prev`) skips the check entirely for null values.

**Fix:** When `lastLocationAt` is null and the order is in transit, treat it as stale. This ensures the warning appears.

### Finding 3: DeliveryStatusCard ICON_MAP and COLOR_MAP are hardcoded (MEDIUM)

**Issue:** Lines 31-50 of `DeliveryStatusCard.tsx` hardcode `ICON_MAP` and `COLOR_MAP`. While labels are DB-backed via `delivery_status_labels`, the visual presentation (icons, colors) is still hardcoded.

**Root cause:** The previous rounds only migrated labels/messages to DB, not the icon/color assignments.

**Fix:** Extend the `delivery_status_labels` system_settings JSON to include `icon` and `color` keys per status. Parse them in the component with fallback to current hardcoded defaults.

### Finding 4: `DEFAULT_PROXIMITY` in LiveDeliveryTracker is a hardcoded fallback (LOW)

**Issue:** Lines 40-47 contain hardcoded fallback proximity messages. These are only used if the DB value is missing or unparseable.

**Severity:** Low — this is acceptable defensive coding. The DB value is confirmed present and working. No action needed.

### Finding 5: `statusFlowCache.ts` queries `cart_purchase` transaction type but delivery orders use `seller_delivery` (MEDIUM)

**Issue:** The status flow cache (used by LiveActivityManager) queries `transaction_type = 'cart_purchase'` and `parent_group = 'default'`. But the network request for the actual order detail page queries `parent_group = 'food_beverages'` and `transaction_type = 'seller_delivery'`, which returns the full delivery flow (placed through cancelled). The `cart_purchase` type returns a different, shorter flow.

**Root cause:** The Live Activity system's status sets may not match the actual order's flow, causing incorrect terminal/start classification for delivery orders.

**Fix:** The status flow cache should consider both transaction types, or the Live Activity system should resolve the correct flow based on the order's fulfillment type and seller category.

---

## Implementation Plan

| Step | What | Severity | Files |
|------|------|----------|-------|
| 1 | Fix stale ETA display: suppress badge when location is null/stale, cap ETA to distance-based value for <500m | Critical | `LiveDeliveryTracker.tsx` |
| 2 | Treat `last_location_at: null` as stale when in transit | High | `useDeliveryTracking.ts` |
| 3 | Fix statusFlowCache to include `seller_delivery` flows | Medium | `statusFlowCache.ts` |
| 4 | Extend DeliveryStatusCard to support DB-backed icons/colors | Medium | `DeliveryStatusCard.tsx`, DB migration for extended JSON |

