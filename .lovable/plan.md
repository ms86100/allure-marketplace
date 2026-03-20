

## Part 1: Map Experience Redesign

### Problem
The current map uses plain emoji icons (🛵, 📍), a flat OpenStreetMap tile layer, a 200px fixed height, and no visual cues for rider direction or branding. It feels like a prototype, not a production delivery tracker.

### Design

**Custom Rider Icon — Scooty with Sociva Bag**
Replace the emoji `🛵` with a custom SVG `DivIcon` rendered inline. The SVG will depict a scooty silhouette carrying a delivery bag branded with "Sociva" text. The icon rotates based on heading. Uses CSS `filter: drop-shadow()` for depth.

**Destination Icon**
Replace `📍` emoji with a pulsing SVG pin with a subtle glow ring animation (CSS keyframes) to draw attention.

**Route Line**
- Gradient polyline: primary color fading to a lighter shade toward the destination
- Animated dashed "ant trail" effect using CSS `stroke-dashoffset` animation on the remaining route ahead of the rider
- Completed route segment (behind rider) rendered in a muted/faded color

**Map Tiles**
Switch to a cleaner, more modern tile provider: CartoDB Voyager (`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`) for a polished, app-like feel.

**Map Height & Interaction**
- Increase map height from `h-[200px]` to `h-[260px]` for better spatial context
- Add a "Re-center" floating button when user pans away

**Smooth Camera**
- Instead of `fitBounds` snapping, smoothly `flyTo` the midpoint with animated zoom
- Keep rider centered with slight offset toward destination

**ETA Overlay Pill**
- Redesign the top-right ETA badge with a frosted glass card showing: route ETA, distance in km, and a small progress bar

### Files to Edit
- `src/components/delivery/DeliveryMapView.tsx` — full rewrite of icons, tiles, polyline, camera, and overlay

---

## Part 2: 20 Production Bug Investigation

### Bug 1: `delivery_locations` table has NO index on `assignment_id`
**Why critical**: Every `INSERT` into `delivery_locations` (every 5s per active delivery) triggers RLS policy evaluation that JOINs `delivery_assignments` and `orders`. The SELECT policy on `delivery_locations` also scans by `assignment_id`. Without an index, this is a full table scan that will degrade as location history grows — causing timeouts during peak hours.
**Where**: `delivery_locations` table schema
**Fix**: Add index `CREATE INDEX idx_delivery_locations_assignment_id ON delivery_locations(assignment_id)`

### Bug 2: OSRM public demo server used in production
**Why critical**: `router.project-osrm.org` is a demo server with no SLA, rate limits, and frequent downtime. Under load (multiple concurrent deliveries), requests will be throttled or blocked, causing the route polyline to disappear and ETA to go stale.
**Where**: `DeliveryMapView.tsx` line 161
**Fix**: Add fallback to straight-line distance ETA when OSRM fails (already partially done), but also add exponential backoff and consider a self-hosted or paid routing API. Short-term: increase retry count from 1 to 2, add jittered backoff.

### Bug 3: `partner_id` in `delivery_locations.insert` uses `callerId` instead of actual partner
**Why critical**: When the seller (not a pool rider) delivers, `callerId` is the seller's `user_id`, but `partner_id` column semantically should reference the delivery partner. If analytics or auditing queries filter by `partner_id`, seller-delivered orders will have incorrect attribution.
**Where**: `update-delivery-location/index.ts` line 213
**Fix**: Use `assignment.partner_id || callerId` as the value.

### Bug 4: GPS filter `timeDiffMs` can be zero or negative with out-of-order realtime events
**Why critical**: If two realtime events arrive out of order (common with WebSocket reconnection), `timeDiffMs` could be 0 or negative. When `timeDiffMs === 0`, the teleport check is skipped entirely (the `if (timeDiffMs > 0)` guard). When negative, it's also skipped. This means a genuine teleport (GPS spoofing or device error) passes through unfiltered.
**Where**: `gps-filter.ts` lines 76-88
**Fix**: Reject points where `timeDiffMs <= 0` (out-of-order) — return the smoothed position.

### Bug 5: Animation `prevPos` never updates on rejected points, causing jump on next accepted point
**Why critical**: In `AnimatedRiderMarker`, `prevPos.current` only updates when animation completes (`t >= 1`). If multiple GPS updates arrive rapidly and the animation hasn't finished, the next animation starts from a stale `prevPos`, causing a visual jump/teleport on the map even though the GPS filter accepted the point.
**Where**: `DeliveryMapView.tsx` line 96
**Fix**: Update `prevPos` at animation start (capture the marker's current LatLng) rather than at animation end.

### Bug 6: `createRiderIcon` creates a new DivIcon on every render and heading change
**Why critical**: Every time the `AnimatedRiderMarker` re-renders or heading changes, `createRiderIcon(heading)` creates a brand new `L.DivIcon` instance. This causes DOM thrashing (old icon removed, new one inserted), which can cause visible flicker and memory churn during rapid movement.
**Where**: `DeliveryMapView.tsx` lines 17-25, 116, 123
**Fix**: Memoize icon creation with a heading-rounded cache (round to nearest 15°).

### Bug 7: Staleness check interval (30s) can miss the 90s→120s transition window
**Why critical**: The staleness checker in `useDeliveryTracking.ts` runs every 30 seconds. With `location_stale_threshold_ms` at 120s, there's a worst case where the stale flag is set 30s late (at 150s). The user sees "live" status for 30s longer than they should.
**Where**: `useDeliveryTracking.ts` line 98
**Fix**: Reduce interval to 15s or make it `threshold / 4`.

### Bug 8: `fetchRoute` in `useOSRMRoute` has stale closure over `degThreshold`
**Why critical**: `degThreshold` is computed from `refetchThreshold / 111000`. This is only accurate at the equator. At higher latitudes (e.g., India at ~20°N), 1° longitude ≈ 104km not 111km. The threshold is ~6% too generous, meaning route refetches happen less often than intended.
**Where**: `DeliveryMapView.tsx` line 144
**Fix**: Use `refetchThreshold / (111000 * Math.cos(riderLat * Math.PI / 180))` for longitude comparison.

### Bug 9: No cleanup of `delivery_locations` rows — unbounded table growth
**Why critical**: Every 5 seconds per active delivery, a row is inserted into `delivery_locations`. A 30-minute delivery creates ~360 rows. With even modest volume (50 deliveries/day), this adds 18k rows/day with no pruning. Over months, this will degrade all queries touching this table.
**Where**: `delivery_locations` table
**Fix**: Add a scheduled job (pg_cron) to delete rows older than 7 days, or add a retention policy.

### Bug 10: `useDeliveryTracking` polling never switches to idle rate
**Why critical**: The `getInterval()` function (line 164-171) has a comment saying "We'll use a simple approach: always poll at transit rate" — meaning it polls every 10s even for `placed`, `accepted`, `preparing` statuses where nothing location-related changes. This wastes bandwidth and API calls.
**Where**: `useDeliveryTracking.ts` lines 164-171
**Fix**: Read current status from a ref and return `POLL_IDLE_MS` for non-transit statuses.

### Bug 11: `onRoadEtaChange` causes infinite re-render loop risk
**Why critical**: `useEffect` depends on `onRoadEtaChange` callback. If the parent doesn't memoize it with `useCallback`, every parent render creates a new function reference, triggering the effect, which calls `onRoadEtaChange`, which may cause parent state update, which re-renders parent... infinite loop.
**Where**: `DeliveryMapView.tsx` lines 225-227
**Fix**: Guard with a ref comparing previous vs current ETA value before calling.

### Bug 12: Location channel listens on `delivery_locations` INSERT but RLS requires authenticated role
**Why critical**: The Realtime subscription uses the anon key's connection. If the `delivery_locations` SELECT policy requires `authenticated` role (it does — `roles:{authenticated}`), the Realtime channel may silently fail to deliver events for unauthenticated or session-expired users.
**Where**: `useDeliveryTracking.ts` line 268-309
**Fix**: Ensure session refresh before subscribing; add error handling for `CHANNEL_ERROR` that prompts re-authentication.

### Bug 13: `getClaims` API may not exist on all Supabase JS versions
**Why critical**: `authClient.auth.getClaims(token)` is a relatively new API. If the edge function's `@supabase/supabase-js` version (`2.93.3`) doesn't include it, the function silently fails auth. The import uses a pinned version which may or may not have this method.
**Where**: `update-delivery-location/index.ts` line 127
**Fix**: Verify the method exists at runtime; fallback to `getUser(token)`.

### Bug 14: `monitor-stalled-deliveries` updates `needs_attention` on EVERY cron run
**Why critical**: Line 91-97 updates `needs_attention` and `needs_attention_reason` on every invocation (to update elapsed time text). If the cron runs every 60s, this creates constant write pressure on the `orders` table and generates unnecessary Realtime events for every stalled order every minute.
**Where**: `monitor-stalled-deliveries/index.ts` lines 91-97
**Fix**: Only update if the `needs_attention_reason` text has actually changed (compare before writing).

### Bug 15: Race condition between realtime and polling in `applyFetchedData`
**Why critical**: The `isNewer` check compares `last_location_at` timestamps. But polling and realtime can deliver the same update simultaneously. The `filterGPSPoint` is called twice for the same point (once from realtime, once from poll), corrupting the smoothing state by double-applying the exponential filter.
**Where**: `useDeliveryTracking.ts` lines 106-136 and 275-299
**Fix**: Add a dedup guard using a `Set` of seen `recorded_at` timestamps.

### Bug 16: `speed_kmh` conversion applies `* 3.6` but native plugin may already report in km/h
**Why critical**: `location.coords.speed` from the web Geolocation API is in m/s, so `* 3.6` is correct. But `@transistorsoft/capacitor-background-geolocation` also reports `coords.speed` in m/s. However, if future plugin versions or configurations change this, there's no unit validation. More critically: when `speed` is `null` (indoors), the code defaults to `0` and always uses `location_interval_idle_ms`, potentially throttling legitimate indoor movements.
**Where**: `useBackgroundLocationTracking.ts` line 101
**Fix**: Add explicit null handling and log the raw speed for debugging.

### Bug 17: `proximity_nearby_distance_meters` key mismatch between edge function and frontend
**Why critical**: The edge function loads `proximity_nearby_distance_meters` (line 33) but the frontend's `DEFAULT_PROXIMITY` uses `nearby.max_meters: 500`. The DB key is different from what the frontend expects. If only one is configured, they'll disagree on what "nearby" means, causing inconsistent proximity messages between push notifications and the UI.
**Where**: `update-delivery-location/index.ts` line 33 vs `LiveDeliveryTracker.tsx` line 43
**Fix**: Unify the key names across frontend and backend.

### Bug 18: `MapContainer` center prop is ignored after initial render
**Why critical**: React-Leaflet's `MapContainer` only uses `center` and `zoom` on initial mount. The computed `center` (midpoint) changes every location update but has zero effect. This isn't a visible bug because `MapBoundsUpdater` handles it, but it's misleading code that could cause confusion in future maintenance.
**Where**: `DeliveryMapView.tsx` line 246
**Fix**: Remove the dynamic center computation or document it as initial-only.

### Bug 19: No rate limiting on `update-delivery-location` edge function
**Why critical**: A compromised or buggy client could spam the endpoint, inserting thousands of location rows per second. There's no per-assignment or per-user rate limit. This could exhaust edge function quota, bloat the DB, and trigger excessive notifications.
**Where**: `update-delivery-location/index.ts`
**Fix**: Add server-side throttle: reject if `last_location_at` was updated less than 2s ago.

### Bug 20: `clearTimeout(timeoutId)` not called on successful response in OSRM fetch
**Why critical**: On line 163, `clearTimeout(timeoutId)` is called after `res` is received. But if `res.json()` or subsequent processing throws, the timeout continues running and will abort the already-completed request, triggering the catch block with `AbortError` and potentially corrupting the route state with a stale cache.
**Where**: `DeliveryMapView.tsx` lines 158-197
**Fix**: Move `clearTimeout` into a `finally` block or immediately after the fetch resolves.

---

## Implementation Plan Summary

| Priority | Items | Effort |
|----------|-------|--------|
| **P0 — Map redesign** | Custom SVG rider+bag icon, CartoDB tiles, animated route, pulsing destination, camera smoothing, ETA overlay | Medium |
| **P0 — DB index** | Bug 1: Add `assignment_id` index on `delivery_locations` | Migration |
| **P1 — GPS robustness** | Bugs 4, 5, 6, 15: Filter hardening, animation fix, icon cache, dedup | Small |
| **P1 — OSRM resilience** | Bugs 2, 8, 20: Backoff, lat-correction, timeout fix | Small |
| **P1 — Edge function** | Bugs 3, 13, 19: Partner ID, auth fallback, rate limit | Small |
| **P2 — Performance** | Bugs 9, 10, 14: Retention policy, idle polling, stalled write guard | Small |
| **P2 — Consistency** | Bugs 7, 11, 12, 16, 17, 18: Threshold fixes, callback guard, key unification | Small |

