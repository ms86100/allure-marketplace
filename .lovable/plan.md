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

### 5. Database
- **Migration:** Added `last_pushed_eta` (int) and `last_pushed_distance` (int) columns to `live_activity_tokens`

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
