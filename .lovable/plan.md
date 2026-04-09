

# Replace CSS center pin with a snapping Google Maps Marker in GoogleMapConfirm

## What changes

The `GoogleMapConfirm` component (used by both the header location picker and the address form) currently uses a CSS overlay pin fixed at the visual center. The user prefers a real `google.maps.Marker` that moves with the map and snaps to the center when the user stops dragging/zooming.

## File: `src/components/auth/GoogleMapConfirm.tsx`

### Remove
- The CSS center pin overlay div (lines 222-235) — the `pinRef`, `map-pin-container`, `MapPin` icon, and shadow dot
- The `isPanningRef`, `pinRef`, `panningTimeoutRef` refs and the `setPanningActive`/`setPanningInactive` helpers (lines 47-49, 133-147, and their usage in drag/zoom listeners)
- The `map-pin-container` / `is-panning` CSS class toggling

### Add
- A `markerRef = useRef<google.maps.Marker | null>(null)` to hold a real Google Maps marker
- Create the marker during map initialization with the initial position, using a primary-colored pin icon
- On the `idle` event (after user interaction), read `map.getCenter()` and call `marker.setPosition(center)` to snap the marker to the new center — this gives the "follow and snap" behavior
- On `dragstart` / `zoom_changed`, optionally hide or dim the marker briefly for visual feedback
- Clean up the marker in the `useEffect` return

### Keep unchanged
- All reverse geocoding logic (`resolveLabel`, `idle` debounce, `setMarker` state)
- The bottom card with location info and confirm/back buttons
- The instruction chip (update text to "Drag the map to adjust")
- The header with back button
- The portal rendering approach

### Result
Both flows (header detect location and add address) use `GoogleMapConfirm` with a real snapping marker — consistent with the user's preferred behavior.

