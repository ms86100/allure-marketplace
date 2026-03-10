

## Plan: Move All Discovery to Coordinate-Based (lat/lng)

You're right — tying discovery to `society_id` is a legacy constraint. Users without a society (or with a society missing coordinates) get zero results. The `browsingLocation` context already resolves lat/lng for every user, so all marketplace queries should use it as the primary input.

### What Changes

**Principle**: Every marketplace discovery hook switches from `effectiveSocietyId` to `browsingLocation.lat/lng`. The `search_sellers_by_location` RPC becomes the single discovery engine. The old `search_nearby_sellers` (society-based) is kept as-is but no longer called from the frontend.

### Affected Hooks (6 files)

1. **`useLocalSellers`** — Currently filters `seller_profiles.society_id = effectiveSocietyId`. Replace with a call to `search_sellers_by_location` using `browsingLocation` lat/lng with a small radius (~2 km) to find "local" sellers. Group results by `primary_group` as before.

2. **`useNearbySocietySellers`** — Already has coordinate branch but falls back to society-based RPC. Remove the society fallback; always use `search_sellers_by_location` with `browsingLocation` lat/lng.

3. **`useNearbyProducts`** — Same pattern: remove society-based fallback, always use coordinate search.

4. **`usePopularProducts`** — Currently filters by `seller.society_id`. Switch to using `browsingLocation` lat/lng via the RPC or by filtering products from sellers within radius.

5. **`useCategoryProducts`** — Same as above; remove `societyId` filter, use coordinate-based discovery.

6. **`useProductsByCategory`** — Same pattern.

7. **`useSearchPage`** — Replace `search_nearby_sellers` calls with `search_sellers_by_location` using `browsingLocation`.

### Enabled Conditions

All hooks currently gate on `!!effectiveSocietyId`. This changes to `!!(browsingLocation?.lat && browsingLocation?.lng)`, which is resolved from the fallback chain (override → default address → society coordinates).

### RPC Enhancement

Update `search_sellers_by_location` to accept an optional `_local_radius_km` parameter (default 2) for the "local sellers" use case, so we can distinguish "hyper-local" from "nearby" without a separate query pattern.

### What Stays Society-Based

Community features (bulletin, help requests, gate entry, society admin) remain tied to `society_id` — no change there.

### Migration for Missing Data

Run a one-time backfill for "Shriram Greenfield" society coordinates so existing sellers become discoverable immediately. Coordinates: approximately `13.0717, 77.7538` (from your GPS session) — confirm or provide exact values.

### Summary of Changes

```text
Before:  effectiveSocietyId → search_nearby_sellers (society RPC)
After:   browsingLocation.lat/lng → search_sellers_by_location (coordinate RPC)

Hooks affected: 6-7 files
DB changes: 1 migration (backfill society coords)
RPC changes: None required (search_sellers_by_location already supports all params)
```

