

# Revised Plan: Production-Hardened Live Tracking (Final 5 Gaps)

## Gap 1: Tracking Health Monitoring (Seller-Side Watchdog)

**Problem:** If iOS kills background tracking, nothing detects it. The seller sees "Sharing location" but no data flows.

**Fix:** Add a health check timer inside `useBackgroundLocationTracking.ts`. Every 20 seconds, compare `Date.now()` against `lastSentAt`. If the gap exceeds 30 seconds while `isTracking === true`:
- Show a persistent toast: "Location updates paused — tap to resume"
- On native: attempt `BackgroundGeolocation.getCurrentPosition()` as a one-shot recovery
- If that also fails: surface a banner in `SellerGPSTracker.tsx` with "Open app to resume tracking" + link to iOS Settings if permission was downgraded

Additionally, the existing `monitor-stalled-deliveries` edge function (cron) already detects stale `last_location_at` server-side and notifies both buyer and seller. This provides a server-side safety net independent of the client watchdog.

**Buyer-side:** Already handled — `useDeliveryTracking.ts` sets `isLocationStale: true` after the configured threshold, and `LiveDeliveryTracker.tsx` renders a stale warning ("⚠️ Location data may be outdated").

**Files:** `src/hooks/useBackgroundLocationTracking.ts`, `src/components/delivery/SellerGPSTracker.tsx`

---

## Gap 2: Background Kill Reality Handling

**Problem:** `stopOnTerminate: false` is not a guarantee on iOS. Force-kill, low battery, or memory pressure can still terminate the native location service.

**Fix — Detection + Recovery (three layers):**

1. **Client recovery (seller app):** On app resume (`visibilitychange` or Capacitor `appStateChange`), check if `isTracking` was `true` but `BackgroundGeolocation` is no longer running. If so, auto-restart tracking and flush any queued points. Show a brief toast: "Tracking resumed."

2. **Server detection (already exists):** `monitor-stalled-deliveries` cron flags orders where `last_location_at` is older than the configured soft threshold (default 10 min). It sets `needs_attention` on the order and sends push notifications to both seller ("Tracking paused — keep app open") and buyer ("Live tracking temporarily unavailable").

3. **Buyer UI (already exists):** The stale location indicator in `LiveDeliveryTracker.tsx` already shows when data is outdated, suppresses ETA, and shows last-seen time.

**New work:** Only the client-side auto-restart logic in `useBackgroundLocationTracking.ts` (check plugin state on resume, auto-restart if stopped).

**Files:** `src/hooks/useBackgroundLocationTracking.ts`

---

## Gap 3: Live Activity Failure Fallback

**Problem:** APNs can drop/delay pushes. If the Dynamic Island stops updating, the buyer has no indication.

**Fix:**
- The Dynamic Island widget is a **complement** to push notifications, not the sole channel. When the buyer opens the app, the in-app tracking (Realtime + polling) takes over immediately — no dependency on APNs.
- For the closed-app scenario: if APNs drops a push, the next successful push (within 15-30s) will carry the latest state, so the DI self-corrects. There is no persistent "frozen" state because every push carries the full `contentState` (not deltas).
- Add a `stale-activity` check: in `update-delivery-location`, if the last successful APNs push for an order was >60s ago, increase priority and retry once. Track last successful push timestamp on `live_activity_tokens.updated_at` (already exists — update it on successful APNs response).

**Files:** `supabase/functions/update-delivery-location/index.ts` (LA push logic), `supabase/functions/update-live-activity-apns/index.ts` (update `updated_at` on success)

---

## Gap 4: Cold Start Sync (Buyer App)

**Problem:** If buyer opens app after minutes of being closed, does it snap to the latest location or show stale data?

**Fix:** Already implemented in the previous iteration. `useDeliveryTracking.ts` performs an immediate `fetchAssignment()` on mount (line 149-156) and on `visibilitychange` (line 193-201). This is a direct DB fetch, not dependent on Realtime.

**Verification:** No code changes needed. The initial fetch and visibility listener both call `fetchAssignment()` which queries `delivery_assignments` directly. State is applied via `applyFetchedData()` which compares timestamps and only updates if newer.

**No files changed.**

---

## Gap 5: Live Activity Push State Storage

**Problem:** Where is `last_pushed_distance`, `last_pushed_eta` stored? Edge functions are stateless.

**Fix:** Use the existing `live_activity_tokens.updated_at` column for the throttle timestamp. For delta detection (distance/ETA), read the current values from `delivery_assignments` at push time and compare against what was last sent. Store `last_pushed_eta` and `last_pushed_distance` as new columns on `live_activity_tokens`.

**Database migration:** Add two columns to `live_activity_tokens`:
```sql
ALTER TABLE live_activity_tokens ADD COLUMN last_pushed_eta int;
ALTER TABLE live_activity_tokens ADD COLUMN last_pushed_distance int;
```

In `update-delivery-location`, after computing new ETA/distance:
1. Query `live_activity_tokens` for the order
2. Compare `last_pushed_eta` vs current `etaMinutes` (delta ≥ 1 min)
3. Compare `last_pushed_distance` vs current `distanceMeters` (delta > 50m)
4. Check `updated_at` for 15s throttle floor
5. If any delta triggers → invoke `update-live-activity-apns` → update `last_pushed_eta`, `last_pushed_distance`, `updated_at`

**Files:** Database migration (new), `supabase/functions/update-delivery-location/index.ts`

---

## Summary of Changes

| File | Change |
|------|--------|
| `package.json` | Add `@transistorsoft/capacitor-background-geolocation` |
| `src/hooks/useBackgroundLocationTracking.ts` | Full rewrite: native background plugin, health watchdog (20s check), auto-restart on resume |
| `src/components/delivery/SellerGPSTracker.tsx` | Permission upgrade banner, remove "keep open" warning on native, show tracking-paused alert |
| `supabase/functions/update-delivery-location/index.ts` | Add delta-based LA push logic with DB-backed state, timing instrumentation |
| `supabase/functions/update-live-activity-apns/index.ts` | Update `updated_at` on successful push |
| Database migration | Add `last_pushed_eta`, `last_pushed_distance` columns to `live_activity_tokens` |

### iOS Build Requirements (documentation)
- `Info.plist`: `UIBackgroundModes` → `location`, `fetch`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `NSLocationWhenInUseUsageDescription`
- `NSMotionUsageDescription`

