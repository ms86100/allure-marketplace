

# Align: Make both location flows use the same map confirm experience

## Problem
Two different map implementations exist:
1. **Header → Detect Location** (`LocationSelectorSheet.tsx`): Custom inline map inside a Drawer with a real `google.maps.Marker` + idle-snap logic (~80 lines of map code)
2. **Add Address → Use Current Location** (`AddressForm.tsx`): Delegates to `GoogleMapConfirm` — fullscreen map with a CSS center pin

The Drawer-based map (flow 1) has a real Marker that visually moves with the map and snaps to center. The `GoogleMapConfirm` (flow 2) has a CSS pin always at center. The user perceives these as inconsistent.

## Solution
Refactor `LocationSelectorSheet` to use `GoogleMapConfirm` for its confirm step, eliminating the duplicate inline map code.

## Changes

### `src/components/location/LocationSelectorSheet.tsx`

**Remove**: All inline map logic (lines 34-176) — `mapContainerRef`, `mapInstanceRef`, `markerInstanceRef`, `mapInitializedRef`, `relocating`, `geocodeRequestIdRef`, `ignoreIdleUntilRef`, `idleDebounceRef`, the `reverseGeocode` callback, and the map initialization `useEffect`.

**Remove**: The entire confirm step UI inside the Drawer (the inline map div, marker, relocate button, confirm/back buttons).

**Add**: When `step === 'confirm'` and `detectedLocation` exists, render `<GoogleMapConfirm>` (imported from `@/components/auth/GoogleMapConfirm`) instead of the Drawer content:

```text
step === 'confirm' && detectedLocation
  → close the Drawer
  → render <GoogleMapConfirm
      latitude={detectedLocation.lat}
      longitude={detectedLocation.lng}
      name={detectedLocation.label}
      onConfirm={(lat, lng, name) => {
        setBrowsingLocation({ id: 'gps', label: name, lat, lng, source: 'gps' });
        onOpenChange(false);
        toast.success(`Browsing near ${name}`);
      }}
      onBack={() => { setStep('pick'); setDetectedLocation(null); }}
    />
```

This gives both flows the identical fullscreen map experience with the CSS center pin, pan-to-adjust, and reverse geocode on idle.

### Net effect
- ~100 lines of duplicate map logic removed from `LocationSelectorSheet`
- Both flows use the same `GoogleMapConfirm` component
- Consistent UX: fullscreen map, CSS center pin, "Move the map to adjust" instruction

