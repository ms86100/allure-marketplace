

# Investigation Results and Fix Plan

## Issues Found

### Issue 1: Duplicate Lock Screen Cards (Live Activity)
The screenshot shows 3x "Your Order is Ready" and 1x "We're Preparing Your Order" as **iOS Live Activity cards** (not push notifications). The trigger fix from earlier only addressed the `notification_queue` duplicates — the Live Activity APNs updates have a **separate duplication path**:

- **Path A**: The DB trigger `fn_enqueue_order_status_notification` calls `update-live-activity-apns` edge function via `pg_net` on every status change
- **Path B**: The `useLiveActivityOrchestrator` hook detects the same status change via Supabase Realtime and calls `LiveActivityManager.push()` which invokes `startLiveActivity` / `updateLiveActivity` on the native bridge

Both paths fire for the same status change, causing duplicate APNs updates to the iOS widget system. Each update can create a stacked card on the lock screen.

**Fix**: Remove the `pg_net` call to `update-live-activity-apns` from the DB trigger. Let the client-side `LiveActivityOrchestrator` (which has proper dedup, throttling, and concurrency guards) be the **sole driver** of Live Activity updates. The DB trigger should only handle push notification queue entries.

### Issue 2: Wrong Notification Content ("Your Order is Ready" always)
The "Your Order is Ready" text comes from the **Live Activity widget** on iOS, not from push notifications. When the seller rapidly transitions through statuses (accepted → preparing → ready), the Live Activity gets multiple APNs updates. The native iOS widget displays the **last received status** but stacks previous cards. The `progress_stage` field in `buildLiveActivityData` correctly maps each status, so the issue is the duplicate cards showing stale states alongside the current one.

This is resolved by fixing Issue 1 (removing the duplicate APNs path).

### Issue 3: ETA Shows 13-17 Minutes at 50m Distance
The `delivery_assignments` row for this order has `eta_minutes: 15, distance_meters: 50`. The 15-minute ETA was set by the **manual database insert** done earlier to recover the missing assignment. The trigger `trg_create_seller_delivery_assignment` would have calculated `GREATEST(2, round(50 * 1.3 / 1000 / 15 * 60))` = 2 minutes.

The `LiveDeliveryTracker` displays `{eta - 2}–{eta + 2} min` = 13-17 min using the raw DB value.

**Fix (two parts)**:
1. **DB**: Update the existing assignment's `eta_minutes` to a correct value based on actual distance
2. **Frontend**: In `LiveDeliveryTracker`, when distance is available and small (< 500m), override the DB ETA with a distance-derived estimate: `max(1, ceil(distance_m / 1000 * 4))` minutes (assuming ~15 km/h). This prevents stale/wrong ETAs from being displayed

### Issue 4: DeliveryArrivalOverlay Clipped/Broken Layout
The overlay uses `fixed inset-0 z-50 flex items-end` which puts it behind the bottom tab bar. On mobile, the bottom tab bar overlaps the overlay content.

**Fix**: Add `pb-20` (bottom padding) to the overlay container to account for the tab bar, and ensure the overlay's z-index is above the tab bar.

### Issue 5: Seller Has No Live Tracking UI
Currently, the seller only sees `SellerGPSTracker` (a simple "broadcasting" panel). The user wants the seller to see the **same map and tracking card** as the buyer.

**Fix**: Show `DeliveryMapView` and `LiveDeliveryTracker` for the seller view as well (remove the `isBuyerView` guard on the map), while keeping the GPS broadcasting panel.

---

## Implementation Plan

### 1. DB Migration: Remove Live Activity APNs from notification trigger
Remove the `pg_net` call to `update-live-activity-apns` from `fn_enqueue_order_status_notification`. The client-side orchestrator handles this. Also fix the active order's ETA.

### 2. Frontend: Distance-based ETA override in LiveDeliveryTracker
In `LiveDeliveryTracker`, when `distance < 500m` and `eta > 2`, compute a smarter ETA from distance instead of using the stale DB value.

### 3. Frontend: Fix DeliveryArrivalOverlay bottom clipping
Add padding to account for the tab bar and increase z-index.

### 4. Frontend: Show map and tracking to seller
In `OrderDetailPage.tsx`, render `DeliveryMapView` for both buyer and seller views when in transit. The seller's GPS location (from `SellerGPSTracker`) feeds into `delivery_assignments`, so the same tracker works for both views.

| # | Change | Type |
|---|--------|------|
| 1 | Remove `pg_net` Live Activity APNs call from `fn_enqueue_order_status_notification` | DB Migration |
| 2 | Fix active order's ETA to match actual distance | DB Migration |
| 3 | Distance-based ETA override in `LiveDeliveryTracker` | Frontend |
| 4 | Fix `DeliveryArrivalOverlay` bottom padding + z-index | Frontend |
| 5 | Show map + tracking card for seller view | Frontend |

