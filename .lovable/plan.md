# Production-Hardened Live Tracking System

## Status: ✅ IMPLEMENTED

## What Changed

### 1. Background Location Tracking (Seller)
- **Package:** Added `@transistorsoft/capacitor-background-geolocation`
- **File:** `src/hooks/useBackgroundLocationTracking.ts` — Full rewrite
  - Native: Transistorsoft plugin with motion-aware tracking, `stopOnTerminate: false`, `preventSuspend: true`
  - Web: Falls back to `navigator.geolocation.watchPosition`
  - 20s health watchdog detects stale tracking and attempts recovery via `getCurrentPosition()`
  - Auto-restart on app resume if native plugin was killed by OS
  - Permission level tracking (`always` / `when_in_use` / `denied`)

### 2. Seller GPS Tracker UI
- **File:** `src/components/delivery/SellerGPSTracker.tsx`
  - "Keep screen open" warning only on web (native handles background natively)
  - Permission upgrade banner when on `when_in_use` with link to Settings
  - Tracking paused badge + alert when watchdog detects stale state
  - Settings deep link via `capacitor-native-settings`

### 3. Delta-Based Live Activity APNs Push
- **File:** `supabase/functions/update-delivery-location/index.ts`
  - After updating `delivery_assignments`, queries `live_activity_tokens`
  - Compares deltas: distance > 50m OR ETA change ≥ 1 min
  - 15s throttle floor to stay within Apple's APNs budget
  - Stale retry: pushes if last push was >60s ago regardless of deltas
  - Stores `last_pushed_eta`, `last_pushed_distance` on `live_activity_tokens`
  - Timing instrumentation: logs `db=Xms total=Xms la_push=Xms`

### 4. APNs Success Tracking
- **File:** `supabase/functions/update-live-activity-apns/index.ts`
  - Updates `live_activity_tokens.updated_at` on successful (non-terminal) pushes
  - `dismissal-date` set to now+4s (Apple minimum) for terminal events

### 5. Database
- **Migration:** Added `last_pushed_eta` (int) and `last_pushed_distance` (int) columns to `live_activity_tokens`
- **Migration:** Updated `verify_delivery_otp_and_complete` RPC → sets `completed` directly, clears `needs_attention`
- **Migration:** Added `at_gate` to `transit_statuses_la` system setting

### 6. Auto-Complete on OTP Verification
- **RPC:** `verify_delivery_otp_and_complete` now sets order status to `completed` (not `delivered`), clears `needs_attention` flags
- **UI:** `BuyerDeliveryConfirmation` hidden for delivery orders (OTP = proof of delivery)
- **UI:** Attention banner hidden on terminal statuses (`delivered`, `completed`, `cancelled`)

### 7. Dynamic Stalled Delivery Alerts
- **File:** `supabase/functions/monitor-stalled-deliveries/index.ts`
  - Computes actual elapsed time from `last_location_at`
  - Contextual messages: "a few minutes" → "X minutes" → "over X hours"

### 8. Dynamic Island Fixes
- **File:** `src/services/liveActivitySync.ts` — End stale native activities on app resume
  - After syncing active orders, queries `getActiveActivities()` and ends any whose order is no longer active
- **File:** `src/hooks/useOrderDetail.ts` — Force refetch on app resume / visibility change
  - Listens for `order-detail-refetch` event and `visibilitychange` to re-fetch order data
- **File:** `src/hooks/useAppLifecycle.ts` — Dispatches `order-detail-refetch` event on resume
- **File:** `src/services/liveActivityMapper.ts` — ETA-based progress during transit
  - Uses `1 - (eta_minutes / 45)` clamped to [0.1, 0.95] when ETA available
  - Falls back to distance-based progress
  - `at_gate` included in transit statuses

## iOS Build Requirements
- `Info.plist`: `UIBackgroundModes` → `location`, `fetch`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `NSLocationWhenInUseUsageDescription`
- `NSMotionUsageDescription`

## Latency Targets
- Seller GPS → Edge Function: < 2s
- Edge Function → DB: < 500ms
- DB → Realtime → Buyer: < 1s
- Edge Function → APNs → Dynamic Island: < 3s
- **Total foreground: < 5s | Dynamic Island: < 8s**
