

# Fix Map Confirm: Stop Shaking + Prevent Accidental Close

## Root causes

1. **Shaking during zoom**: The `zoom_changed` event fires rapidly during pinch-to-zoom, each time calling `setIsPanning(true)`. Then `idle` fires and calls `setIsPanning(false)`. These rapid React state toggles cause the pin CSS transition to jitter, and the component re-renders many times per second during a pinch gesture.

2. **Accidental close**: `GoogleMapConfirm` renders a full-screen portal, but touch events on the map can propagate upward. If a parent has a Drawer open (e.g., `SellerVisibilityChecklist` opens a Drawer, user taps "Set Location", `SetStoreLocationSheet` opens), the Drawer's swipe-to-dismiss can intercept vertical touches that start on the map. Also, the browser's pull-to-refresh / overscroll navigation can trigger on vertical drags.

## Fixes (all in `GoogleMapConfirm.tsx`)

### 1. Debounce `isPanning` off-transition
Instead of setting `isPanning = false` immediately on every `idle` event, use a ref-based approach: set `true` immediately on `dragstart`/`zoom_changed`, but only set `false` after a 300ms quiet period. This prevents rapid true→false→true flicker during pinch zoom.

### 2. Block touch propagation from map container
Add `onTouchStart`, `onTouchMove`, `onTouchEnd` with `e.stopPropagation()` on the map's parent div. This prevents any parent Drawer from intercepting map touches.

### 3. Add `touch-action: none` and `overscroll-behavior: contain`
On the root portal div, set `touch-action: manipulation` and `overscroll-behavior: contain` via inline style. This prevents pull-to-refresh, browser back/forward swipe, and double-tap zoom from interfering.

### 4. Reduce unnecessary re-renders
Move the `isPanning` visual effect to use a ref + direct DOM class toggle instead of React state, eliminating re-renders entirely during map interaction. The pin lift/drop becomes a direct `classList.toggle` call.

## Changes

| File | What |
|------|------|
| `src/components/auth/GoogleMapConfirm.tsx` | (1) Replace `isPanning` state with ref + direct DOM manipulation for pin animation. (2) Add `stopPropagation` touch handlers on map container. (3) Add `overscroll-behavior: contain` and `touch-action: manipulation` on root div. (4) Debounce the panning-end detection with 300ms quiet period. |

No other files need changes — `OnboardingLocationSheet`, `SetStoreLocationSheet`, and `AddressForm` just render `<GoogleMapConfirm>` and receive callbacks.

