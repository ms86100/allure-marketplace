

# Fix: Complete Zomato-Level Tracking — 3 Missing Pieces

## Issues Identified

1. **No Google Maps**: Map uses Leaflet/OSM. User wants Google Maps with smooth animations.
2. **Delivery OTP `onVerified` is a no-op**: Line 877 has `onVerified={() => {}}` — after OTP verification, the order state doesn't refresh.
3. **Buyer sees old status labels**: `LiveDeliveryTracker` and `DeliveryStatusCard` still show raw workflow statuses ("placed", "accepted", "preparing") instead of derived display status.

---

## Plan

### 1. Replace Leaflet with Google Maps in `DeliveryMapView`

**File**: `src/components/delivery/DeliveryMapView.tsx` — full rewrite

- Remove `react-leaflet` and `leaflet` imports
- Use `@vis.gl/react-google-maps` (modern React wrapper for Google Maps JS API)
- Load API key via existing `useGoogleMaps` hook (already fetches from `admin_settings`)
- Implement:
  - `AdvancedMarkerElement` for rider (animated), seller, and destination
  - `google.maps.Polyline` for route (OSRM decoded polyline)
  - Smooth rider animation via `requestAnimationFrame` interpolation
  - Dynamic zoom: `>5km → zoom 12`, `2-5km → zoom 14`, `<1km → zoom 16`
  - Auto camera: fit all before pickup, follow rider after pickup, zoom home near delivery
  - Tap rider marker → info window with name, ETA, distance
  - GPS smoothing (ignore >200m jumps in <2s, 3-point weighted average)
  - Recenter floating button
  - Route progress visualization (completed vs remaining segments)
- Map height: `h-[320px]` during transit
- Keep same props interface (`DeliveryMapViewProps`) for zero changes in OrderDetailPage

### 2. Fix Delivery OTP `onVerified` callback

**File**: `src/pages/OrderDetailPage.tsx` — line 877

Change:
```tsx
onVerified={() => {}}
```
To:
```tsx
onVerified={() => o.fetchOrder()}
```

This ensures the order refreshes after OTP verification so status updates immediately.

### 3. Remove raw status exposure from buyer view

**File**: `src/components/delivery/LiveDeliveryTracker.tsx`

The `LiveDeliveryTracker` still shows raw proximity messages and status labels. Replace the status text section with derived display status pass-through — accept `displayStatusText` prop and show it instead of computing its own status message.

**File**: `src/components/delivery/DeliveryStatusCard.tsx`

This card shows pre-transit delivery status with raw labels like "pending", "assigned". Refactor to use derived display status labels or hide it entirely when `LiveActivityCard` is visible (it already covers this).

**File**: `src/pages/OrderDetailPage.tsx`

- Remove the `DeliveryStatusCard` render for buyers (line 578) — `LiveActivityCard` already covers this
- Pass `displayStatus.text` to `LiveDeliveryTracker` so it shows the derived sentence instead of raw workflow state

### 4. Install `@vis.gl/react-google-maps` dependency

Add the Google Maps React library as a project dependency.

---

## Files Summary

| File | Action |
|---|---|
| `src/components/delivery/DeliveryMapView.tsx` | Full rewrite (Leaflet → Google Maps) |
| `src/pages/OrderDetailPage.tsx` | Fix OTP callback + remove raw status cards for buyer |
| `src/components/delivery/LiveDeliveryTracker.tsx` | Accept derived status text, stop showing raw statuses |
| `src/components/delivery/DeliveryStatusCard.tsx` | Minor: hide for buyer when LiveActivityCard active |
| `package.json` | Add `@vis.gl/react-google-maps` |

## What Does NOT Change
- `deriveDisplayStatus.ts`, `ExperienceHeader.tsx`, `LiveActivityCard.tsx` — already correct
- DB schema, workflow engine, action bars, OTP dialogs
- Google Maps API key infrastructure (already in place)
- All seller workflows and realtime subscriptions

