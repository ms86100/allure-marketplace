

# Zomato/Swiggy-Level Live Tracking — Bulletproof Fix Plan

## Current State Assessment

The existing codebase already has **most of the real-time infrastructure in place**:
- ✅ Real-time location via Supabase channels + polling fallback (`useDeliveryTracking`)
- ✅ GPS noise filtering with teleport rejection (`gps-filter.ts`)
- ✅ OSRM route fetching with auto-refetch on movement (`DeliveryMapView`)
- ✅ Route split into completed/remaining paths
- ✅ Dynamic ETA with rush-hour adjustment
- ✅ GPS smoothing with weighted averaging
- ✅ Auto-follow camera with user-pan override + recenter
- ✅ Adaptive polling (transit vs idle vs degraded)
- ✅ Seller GPS broadcasting (`SellerGPSTracker`)

## What's Actually Broken / Missing

### Problem 1: Google Maps "Can't load correctly" overlay
The API key IS loading (visible in console: `AIzaSyDi4bu9zvAUDtxvlQZRL0Wl9gQa-ISBr3o`). The overlay is a **Google Cloud Console issue** — either billing isn't enabled or HTTP referrer restrictions block the preview domain. **This is not a code bug.** However, the code should handle it gracefully and provide actionable feedback.

### Problem 2: Legacy Marker type mismatch
`riderMarkerRef` is typed as `AdvancedMarkerElement` but uses `google.maps.Marker`. The `.position` property assignment in the animation effect (line 426-428) uses `AdvancedMarkerElement`-style direct assignment (`marker.position = {...}`) instead of `marker.setPosition(...)`, causing the rider to not animate.

### Problem 3: No branded delivery icon
Currently uses a basic SVG circle with 🛵 emoji — not Zomato/Swiggy quality.

### Problem 4: No bearing-based rotation
The `heading` prop is received but never applied to the rider marker.

### Problem 5: No pulsing destination marker
Destination uses same generic marker as everything else.

### Problem 6: No route progress animation
Remaining path is solid — no animated dashes or visual progress.

### Problem 7: No "tracking unavailable" retry
When map auth fails, the fallback card has no retry mechanism.

---

## Implementation Plan

### 1. Fix Google Maps Auth Feedback (useGoogleMaps.ts)
- Add clear console diagnostic: log `window.location.origin` so user knows exactly which referrer to whitelist
- Show specific error message in fallback: "Add [origin] to your Google Maps API key's allowed referrers in Google Cloud Console"
- Add retry button in MapFallbackCard

### 2. Fix Marker Animation (DeliveryMapView.tsx)
- Change all marker refs from `AdvancedMarkerElement` to `google.maps.Marker`
- Replace `marker.position = {...}` with `marker.setPosition(new google.maps.LatLng(...))`
- This fixes the rider gliding animation that's currently broken

### 3. Branded Sociva Scooter Icon
- Create a proper SVG scooter rider icon with Sociva brand color (#3b82f6)
- Apply `heading` rotation via CSS transform on a custom overlay or via `google.maps.Marker` icon rotation
- Add subtle scale pulse animation when location updates

### 4. Pulsing Destination Marker
- Replace generic destination marker with a custom overlay: outer pulsing ring + inner pin
- Use CSS `@keyframes` for the pulse effect (already partially in place but not connected)

### 5. Animated Route Line
- Add animated dash pattern to the remaining route polyline using `strokeOpacity: 0` + `icons` with a repeating dash symbol
- Faded completed path stays as-is

### 6. Smooth Camera Transitions
- Replace direct `map.panTo()` / `map.setZoom()` with `map.panTo()` + gradual zoom (Google Maps handles smooth pan natively)
- Add distance-based zoom tiers (already present, just needs the `setPosition` fix to actually trigger)

### 7. MapFallbackCard Improvements
- Show exact origin URL so user can whitelist it
- Add "Retry" button that clears cached key and reloads script
- Keep OSRM ETA + "Open in Google Maps" link

### 8. Fix forwardRef Warning
- `DeliveryMapView` is used with `lazy()` and `Suspense` in `OrderDetailPage`. The ref warning comes from passing a ref to the lazy component. Fix by wrapping with `React.forwardRef` or removing the ref pass.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/delivery/DeliveryMapView.tsx` | Fix marker types, add branded icon, heading rotation, pulsing destination, animated route, retry logic |
| `src/hooks/useGoogleMaps.ts` | Add origin diagnostic logging, expose retry function |

## What Does NOT Need Changing
- `useDeliveryTracking.ts` — already production-grade with realtime + polling + GPS filtering
- `gps-filter.ts` — already has Kalman-lite smoothing + teleport rejection
- `etaEngine.ts` — already DB-driven with mood tiers
- `SellerGPSTracker.tsx` — already handles auto-start, wake lock, background tracking
- `useTrackingConfig.ts` — already loads all thresholds from DB
- Edge function `get-google-maps-key` — working correctly

## Google Cloud Console Action Required (User)
After code changes, the user must:
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Find the API key `AIzaSyDi4bu9zvAUDtxvlQZRL0Wl9gQa-ISBr3o`
3. Under "Application restrictions" → "HTTP referrers", add:
   - `https://*.lovable.app/*`
   - `https://*.lovableproject.com/*`
   - Their production domain
4. Ensure "Maps JavaScript API" and "Places API" are enabled
5. Ensure billing is active

The improved fallback card will display these exact instructions dynamically.

