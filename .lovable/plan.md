

# Fix: Google Map Shaking During Pan/Zoom in Location Confirm Overlay

## Root Cause

The `GoogleMapConfirm` component (line 217-222) wraps the map in a div with `onTouchStart`, `onTouchMove`, and `onTouchEnd` handlers that call `e.stopPropagation()`. This was originally added to prevent drawer swipe-to-close from interfering with map gestures.

**The problem:** Google Maps internally attaches event listeners higher in the DOM tree (document/window level) for gesture recognition (pinch-to-zoom, two-finger pan). When `stopPropagation()` blocks touch events from bubbling past the wrapper, Google Maps loses track of multi-touch gestures mid-interaction. This causes:
- Jerky/shaking pin during pinch-to-zoom
- Map snapping unexpectedly during panning
- Inconsistent gesture recognition

**Why the fix is unnecessary in the first place:** `GoogleMapConfirm` renders via `createPortal(... , document.body)` — it is **completely outside** any drawer DOM. There is no drawer to accidentally close. The `stopPropagation` serves no purpose and actively harms map interaction.

## Fix (3 changes in 1 file)

### `src/components/auth/GoogleMapConfirm.tsx`

1. **Remove `stopPropagation` handlers** from the map wrapper div (lines 219-221). These block Google Maps' internal gesture pipeline.

2. **Add `touch-action: none`** to the map wrapper div (instead of only on the map div). This tells the browser to hand all touch handling to JavaScript (Google Maps), preventing browser-level gesture conflicts like pull-to-refresh or overscroll.

3. **Remove `touchAction: manipulation`** from the root container (line 203). This CSS property conflicts with the map's `touch-action: none` — the browser sees two competing touch-action values in the same containment chain and may partially apply both, causing jitter. Replace with `touch-action: pan-y` on the root so only the header/bottom card allow vertical scroll, while the map area is fully JS-controlled.

### Before (shaky):
```tsx
<div className="flex-1 relative"
  onTouchStart={(e) => e.stopPropagation()}
  onTouchMove={(e) => e.stopPropagation()}
  onTouchEnd={(e) => e.stopPropagation()}
>
  <div ref={mapRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
```

### After (stable):
```tsx
<div className="flex-1 relative" style={{ touchAction: 'none' }}>
  <div ref={mapRef} className="absolute inset-0" />
```

### Root container change:
```tsx
// Before
<div style={{ touchAction: 'manipulation', overscrollBehavior: 'contain' }}>

// After  
<div style={{ overscrollBehavior: 'contain' }}>
```

## Why This Is Bulletproof

- **No `stopPropagation`** — Google Maps gets the full event chain it needs for multi-touch gestures
- **`touch-action: none` on wrapper** — browser delegates all touch handling to JS (Google Maps), no competing browser gestures
- **No conflicting `touchAction`** values in the containment chain
- **`overscrollBehavior: contain`** stays on root to prevent pull-to-refresh without interfering with map events
- **Portal to `document.body`** already isolates from any drawer — no drawer protection needed

## Files Changed

| File | Change |
|------|--------|
| `src/components/auth/GoogleMapConfirm.tsx` | Remove stopPropagation handlers, consolidate touch-action, remove manipulation |

## Risk

Zero risk to other components. `GoogleMapConfirm` is self-contained via portal. No other component is affected.

