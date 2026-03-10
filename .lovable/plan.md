

## Plan: Clear Building/Society on GPS-based location & Cross-community radius clarification

### Bug Fix: Clear `building_name` when using "Use Current Location"

**Problem**: When a user selects a society via autocomplete search, the Building/Society field is correctly populated. But if they then use "Use Current Location" and adjust the pin, the old society name persists in the Building/Society field — showing stale data.

**Fix in `src/components/profile/AddressForm.tsx`**:

1. In `detectLocation()` (line ~116-136): After getting GPS coordinates, **clear `building_name`** and `searchQuery` so the society field resets. The reverse geocode result will populate `full_address` only.

2. In `handleMapConfirm()` (line ~139-142): When the map pin is confirmed after a GPS-based flow, do **not** carry over the old `building_name`. Only set `full_address` from the geocoded name.

The key change: when `detectLocation` is triggered, reset `building_name` to empty and clear the search query, since the user is explicitly choosing a raw GPS location rather than a named society.

---

### Answering Your Cross-Community Radius Question

The cross-community discovery radius **is maintained and working** in the database. Here's how:

- The `search_nearby_sellers` database function takes a `_radius_km` parameter (default 5 km).
- It uses the **haversine formula** to calculate distance between the buyer's society coordinates and each seller's society coordinates.
- A seller appears only if **both** conditions are met:
  - Distance ≤ the buyer's search radius (`_radius_km`, passed by the app)
  - Distance ≤ the seller's own `delivery_radius_km` (configured per seller, default 5 km)
- Additionally, the seller must have `sell_beyond_community = true` and `verification_status = 'approved'`.

So the system uses the **user's society coordinates** (from the `societies` table) for discovery — not the delivery address coordinates. The delivery address is for fulfillment; the society association drives marketplace discovery.

When a user picks "Use Current Location" instead of searching a society, the address is saved to `delivery_addresses` — but the **society association** on their profile (set during registration) remains unchanged and continues to drive cross-community seller discovery.

### Files to Change

| File | Change |
|------|--------|
| `src/components/profile/AddressForm.tsx` | Clear `building_name` and `searchQuery` when `detectLocation` is called; ensure `handleMapConfirm` doesn't carry stale building name from GPS flow |

