

# Live Delivery Tracking: Gap Analysis and Improvement Plan

## Research Findings: How Zomato/Swiggy/Blinkit Work

Based on technical research, these platforms use a **5-layer architecture**:

1. **Rider app sends GPS every 5-10 seconds** (adaptive: faster when moving, slower when idle)
2. **Backend processes updates**: road-snapping, GPS noise filtering, anomaly detection (teleport jumps)
3. **Real-time push to buyer** via WebSocket/Kafka (not polling)
4. **Client-side interpolation**: smooth marker animation between GPS points using speed + heading to predict intermediate positions
5. **Proximity-based status transitions**: automatic status changes at distance thresholds (500m, 200m, 50m) -- not manual seller action

Key insight: The "smooth movement" users see is an **illusion** -- the app receives discrete GPS points every 5-10s and **interpolates** the marker between them using heading and speed.

## Current System vs Industry Standard

| Aspect | Our System | Zomato/Swiggy |
|--------|-----------|---------------|
| GPS capture interval | 10s throttle | 5-10s adaptive |
| Transport to buyer | Supabase Realtime (Postgres changes) | WebSocket/Kafka |
| Map marker animation | Instant jump to new position | Smooth interpolation between points |
| Road snapping | None -- raw GPS on straight line | Google Roads API / Mapbox Map Matching |
| Route display | Dashed straight line | Actual road route polyline |
| ETA calculation | Haversine + speed formula | Road-distance + traffic + ML model |
| Proximity auto-status | Manual seller action | Automatic geofence triggers |
| GPS noise filtering | Accuracy > 100m skip | Kalman filter + road snap |
| Buyer location update | Fixed at order time | Can update dynamically |

## What We Can Realistically Implement

Given our stack (Supabase Realtime, Leaflet maps, edge functions), here are the high-impact improvements ranked by feasibility:

### 1. Smooth Marker Interpolation (High Impact, No Backend Change)
Animate the rider marker between GPS points using CSS transitions or Leaflet's `slideTo`. When a new GPS point arrives, smoothly move the marker over ~2 seconds instead of jumping.

### 2. GPS Noise Filtering with Kalman Filter (High Impact, Frontend)
Add a simple Kalman filter in the `useDeliveryTracking` hook to smooth out GPS jitter. Reject points that represent impossible speed (>120 km/h teleport detection).

### 3. Road-Snapped Route via OSRM (Medium Impact, Free API)
Replace the straight dashed line with an actual road route using the free OSRM API (`router.project-osrm.org`). This also gives us road-based distance and ETA instead of Haversine.

### 4. Automatic Proximity Status Transitions (High Impact, Backend)
In the `update-delivery-location` edge function, automatically transition assignment status based on distance: `on_the_way` -> when distance < 200m, show "arriving" state; when < 50m, show "at doorstep". Currently these require manual seller action.

### 5. Dynamic Buyer Location (Medium Impact, Frontend + Backend)
Allow buyer to update their delivery location while order is in transit. Store latest buyer coords and recalculate distance/ETA against updated position.

### 6. Adaptive GPS Interval (Low Effort, Frontend)
Reduce the throttle from 10s to 5s when moving (speed > 5 km/h), increase to 15s when stationary to save battery.

---

## Implementation Plan

### Step 1: Smooth Map Marker Animation
- In `DeliveryMapView.tsx`, use Leaflet marker's `setLatLng()` with CSS transition on the marker element
- Store previous position, animate over 2s to new position when GPS updates arrive
- Rotate the rider icon based on `heading` from GPS data

### Step 2: GPS Noise Filter (Kalman-lite)
- Add a `filterGPSPoint()` utility that rejects points where implied speed > 120 km/h (teleport)
- Apply exponential smoothing: `smoothed = 0.7 * new + 0.3 * previous`
- Integrate into `useDeliveryTracking` before updating state

### Step 3: OSRM Road Route
- In `DeliveryMapView.tsx`, fetch route geometry from `https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson`
- Render the actual road polyline instead of a straight dashed line
- Use OSRM's returned `duration` and `distance` for more accurate ETA display
- Cache route and only re-fetch when rider moves > 100m from last fetch point

### Step 4: Auto Proximity Status in Edge Function
- In `update-delivery-location/index.ts`, add automatic status progression:
  - When `distance < 200m` and status is `on_the_way` -> update status hint to `arriving`
  - When `distance < 50m` -> update hint to `at_doorstep`
- Add a `proximity_status` column to `delivery_assignments` (separate from workflow status)
- Frontend reads this for display without changing the manual workflow

### Step 5: Adaptive Send Interval
- In `useBackgroundLocationTracking.ts`, make `SEND_INTERVAL_MS` dynamic:
  - Moving (speed > 5 km/h): 5 seconds
  - Stationary: 15 seconds
  - Track last known speed to decide interval

### Step 6: Dynamic Buyer Location
- Add a "Update my location" button on buyer's tracking screen
- Save updated coords to `delivery_assignments.delivery_lat/lng` (or the order)
- Edge function recalculates distance/ETA against latest buyer position

| # | Change | Type | Files |
|---|--------|------|-------|
| 1 | Smooth marker animation with heading rotation | Frontend | `DeliveryMapView.tsx` |
| 2 | GPS noise filter (teleport rejection + smoothing) | Frontend | New `lib/gps-filter.ts`, `useDeliveryTracking.ts` |
| 3 | OSRM road route polyline + road-based ETA | Frontend | `DeliveryMapView.tsx`, `LiveDeliveryTracker.tsx` |
| 4 | Proximity status column + auto-update in edge function | Backend + DB | `update-delivery-location/index.ts`, migration |
| 5 | Adaptive GPS send interval | Frontend | `useBackgroundLocationTracking.ts` |
| 6 | Dynamic buyer location update | Frontend + Backend | `OrderDetailPage.tsx`, edge function |

