

# Show Location Name Instead of Coordinates

## Problem
When a seller has an existing store with a set location, both the "Use from another store" cards and the "Location set" confirmation show raw latitude/longitude (e.g., `26.1708, 91.7475`) instead of a human-readable place name.

## Root Cause
The `seller_profiles` table has no column to store the location name. When a seller sets their store location (via search or GPS), the place name is used transiently but never persisted.

## Solution
Add a `store_location_label` column to `seller_profiles` and persist the place name when setting coordinates. Then display it everywhere instead of raw coordinates.

### DB Migration
- Add `store_location_label TEXT` to `seller_profiles`
- Update the `set_my_store_coordinates` RPC to accept an optional `p_label TEXT` parameter and store it

### Backend Changes
**`set_my_store_coordinates` RPC** — add `p_label text default null` parameter, set `store_location_label = COALESCE(p_label, store_location_label)` alongside lat/lng update.

### Frontend Changes

**`SetStoreLocationSheet.tsx`**
- Pass `selectedPlaceName` to `handleConfirm`
- Include it in the RPC call as `p_label`
- In the existing store cards, show `store_location_label` instead of coordinates (fall back to coords if label is null)

**`BecomeSellerPage.tsx` — `StoreLocationPicker`**
- Expand `existingStoreLocations` type to include `store_location_label`
- Show `store_location_label || coordinates` in both the existing store buttons and the "Location set" confirmation
- When the `OnboardingLocationSheet` confirms, persist the place name via the RPC

**`OnboardingLocationSheet.tsx`**
- Already passes `name` in `onConfirm(lat, lng, updatedName)` — no change needed here

**`BecomeSellerPage.tsx` — onboarding save flow**
- When saving the seller profile with coordinates, also call `set_my_store_coordinates` with the label so it persists

### Display Priority
Everywhere a location is shown: `store_location_label > "lat, lng" fallback`

### Files
| File | Action |
|---|---|
| DB migration | **Create** — add column + update RPC |
| `src/components/seller/SetStoreLocationSheet.tsx` | **Modify** — pass label to RPC, show label in cards |
| `src/pages/BecomeSellerPage.tsx` | **Modify** — include label in type, display label, persist on save |

