

# Analysis: Current State vs. What's Being Requested

The previous plan already implemented 5 of 6 steps. Here's a summary of what's **already working** and what's **still missing**:

## Already Implemented
1. **Smooth marker animation** — `AnimatedRiderMarker` with 2s ease-out cubic interpolation and heading rotation
2. **GPS noise filter** — `src/lib/gps-filter.ts` with teleport rejection (>120 km/h), micro-jitter filtering (<3m), exponential smoothing (0.7 weight)
3. **OSRM road routing** — Real road polylines via `router.project-osrm.org`, cached with 80m re-fetch threshold
4. **Auto proximity status** — `proximity_status` column on `delivery_assignments`, auto-set by edge function (`at_doorstep` <50m, `arriving` <200m, `nearby` <500m), displayed in `LiveDeliveryTracker`
5. **Adaptive GPS intervals** — 5s when moving (>5 km/h), 15s when stationary

## Still Missing (Step 6 from previous plan)
**Dynamic buyer location update** — the scenario where a buyer moves from location A to location B and the system adapts. Currently, delivery distance and ETA are calculated against the order's original `delivery_lat/delivery_lng`, which is set at checkout and never updated.

## Implementation Plan

### 1. "Update My Location" button on buyer's tracking screen
In `OrderDetailPage.tsx`, when the buyer is viewing a delivery in transit, add an "Update My Location" button below the map. Tapping it calls `getCurrentPosition()` from `src/lib/native-location.ts` and saves the new coordinates.

### 2. Backend: Update destination coordinates
- Add an edge function endpoint or modify `update-delivery-location` to accept buyer location updates
- Simpler approach: directly update `orders.delivery_lat` and `orders.delivery_lng` from the frontend via Supabase client (with RLS allowing buyer to update their own order's delivery coords)
- The existing `update-delivery-location` edge function already reads `delivery_lat/delivery_lng` from the order for distance/ETA calculation, so updating those columns automatically recalibrates everything on the next GPS ping

### 3. RLS policy
Add an RLS policy allowing the buyer to update `delivery_lat` and `delivery_lng` on their own order (the order's `buyer_id` must match `auth.uid()`).

| # | Change | Type | File |
|---|--------|------|------|
| 1 | Add "Update My Location" button with GPS capture | Frontend | `OrderDetailPage.tsx` |
| 2 | RLS policy for buyer to update delivery coords | DB Migration | New migration |
| 3 | Show "Location updated" confirmation toast | Frontend | `OrderDetailPage.tsx` |

This is a focused change — the entire distance/ETA/proximity pipeline already recalculates against the order's delivery coordinates on every GPS ping from the rider, so updating those coordinates is all that's needed to replicate the Zomato "moved to location B" behavior.

