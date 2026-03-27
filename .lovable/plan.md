

# Fix Google Map Confirm: Center-Pinned Marker + Full-Screen Layout

## Problems

1. **Drawer conflicts with map gestures**: The map sits inside a `Drawer` component. Swiping down on the map can close the drawer instead of panning. Touch conflicts make the experience jerky.
2. **Draggable marker is hard to use on mobile**: Small pin, hard to grab with a finger. Users expect Uber/Zomato/Blinkit style — the pin stays fixed at center, you move the map underneath.
3. **Pin doesn't follow zoom center**: Current `idle` listener moves the marker to center after zoom settles, but there's a visible jump. The pin should visually stay at center the entire time.

## Solution: Uber/Zomato-style center-pinned map

### Design

```text
┌──────────────────────────────┐
│  ← Back     Confirm Location │  ← Fixed header
├──────────────────────────────┤
│                              │
│         [MAP FILLS           │
│          FULL SCREEN]        │
│                              │
│            📍 ← CSS overlay  │  ← Pin is a fixed HTML element
│              (always center) │     centered with CSS, not a
│                              │     Google Maps Marker
│                              │
├──────────────────────────────┤
│  📍 Detected Location Name   │  ← Bottom card overlay
│  Full formatted address      │
│  [ Confirm Location ]        │
└──────────────────────────────┘
```

### How it works

- **No Drawer**: The confirm step renders as a full-screen portal (same pattern as the 'pick' step already uses)
- **CSS center pin**: A `<div>` with the pin icon is positioned `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full` over the map. It never moves — the map moves underneath it.
- **No Google Maps Marker**: Remove the draggable `Marker`. The pin IS the CSS overlay.
- **On map `idle`**: Read `map.getCenter()`, reverse geocode, update the address card at the bottom.
- **Gestures**: `gestureHandling: 'greedy'` — single finger pans the map (effectively moving the pin location), two fingers zoom. Both work without conflict because there's no Drawer intercepting touches.
- **Pin lift animation**: While dragging/zooming, the CSS pin lifts slightly (`scale-110 -translate-y-2`) to indicate active movement. On `idle`, it drops back down.

### Changes to parent components

All three parents that wrap `GoogleMapConfirm` in a `Drawer` (OnboardingLocationSheet, SetStoreLocationSheet, AddressForm) will benefit automatically because `GoogleMapConfirm` itself becomes a full-screen experience.

**Option A (cleaner)**: `GoogleMapConfirm` renders its own full-screen portal internally — parents just mount it and receive the callback.

**Option B**: Parents switch from `<Drawer>` to a portal wrapper. This is more work for the same result.

Going with **Option A** — `GoogleMapConfirm` owns its full-screen layout.

## Technical details

### `GoogleMapConfirm.tsx` rewrite

1. Wrap entire component in `createPortal(... , document.body)` with `fixed inset-0 z-50`
2. Map div fills the viewport: `absolute inset-0`
3. Remove `google.maps.Marker` creation entirely
4. Add CSS pin overlay: positioned at center of map container
5. Add state `isPanning` — set `true` on `dragstart`/`zoom_changed`, `false` on `idle`
6. Pin gets `transition-transform` class, lifts when `isPanning`
7. On `idle`: `const center = map.getCenter()` → update coordinates → reverse geocode
8. Bottom card: `absolute bottom-0 left-0 right-0` with address + confirm button
9. Top bar: back arrow + title
10. Remove `click` listener (no more tap-to-place — center pin replaces it)
11. Keep `gestureHandling: 'greedy'` for smooth single-finger pan
12. Instruction text changes from "Drag or tap the pin" to "Move the map to adjust location"

### Parent component changes

| File | Change |
|------|--------|
| `src/components/auth/GoogleMapConfirm.tsx` | Full rewrite: full-screen portal, CSS center pin, no Marker |
| `src/components/seller/OnboardingLocationSheet.tsx` | Remove Drawer wrapper for confirm step — just render `<GoogleMapConfirm>` directly |
| `src/components/seller/SetStoreLocationSheet.tsx` | Same — remove Drawer wrapper for confirm step |
| `src/components/profile/AddressForm.tsx` | No change needed (already renders GoogleMapConfirm inline, no Drawer) |

