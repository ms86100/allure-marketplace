

# Refined Plan: Coordinate-First Discovery Architecture

All feedback points are agreed and incorporated. Here is the final implementation plan.

## Migration (single SQL file)

### 1. Schema changes on `seller_profiles`

```sql
-- Enum for seller type (not text)
CREATE TYPE public.seller_type_enum AS ENUM ('society_resident', 'commercial');

ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS seller_type public.seller_type_enum NOT NULL DEFAULT 'society_resident',
  ADD COLUMN IF NOT EXISTS store_location_source text;

-- Composite index for bounding-box pre-filter
CREATE INDEX IF NOT EXISTS idx_seller_coords ON public.seller_profiles(latitude, longitude);
```

### 2. Backfill existing sellers (copy society coords)

```sql
UPDATE public.seller_profiles sp
SET latitude = s.latitude::double precision,
    longitude = s.longitude::double precision,
    store_location_source = 'society'
FROM public.societies s
WHERE s.id = sp.society_id
  AND s.latitude IS NOT NULL
  AND sp.latitude IS NULL;
```

### 3. New RPC: `set_my_store_coordinates`

Writes directly to `seller_profiles.latitude/longitude`. Source is set automatically (not user-controlled).

```sql
CREATE OR REPLACE FUNCTION public.set_my_store_coordinates(
  p_lat double precision, p_lng double precision, p_source text DEFAULT 'manual'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.seller_profiles
  SET latitude = p_lat, longitude = p_lng,
      store_location_source = p_source
  WHERE user_id = auth.uid();
END; $$;
```

### 4. Update `set_my_society_coordinates` for backward compat

Extend existing function to ALSO update seller_profiles coordinates:

```sql
-- After updating societies, also sync to seller_profiles
UPDATE public.seller_profiles
SET latitude = p_lat, longitude = p_lng,
    store_location_source = 'society'
WHERE user_id = auth.uid() AND latitude IS NULL;
```

### 5. Recreate `search_sellers_by_location`

Key changes from current:
- `LEFT JOIN societies` (was INNER JOIN)
- Society filters (`s.latitude IS NOT NULL`) move INTO the JOIN condition
- `COALESCE(sp.latitude, s.latitude::double precision)` for all coordinate references
- Bounding box pre-filter before haversine (~0.045 degrees per km × radius)
- `sell_beyond_community` bypassed when `seller_type = 'commercial'`
- `LEAST(_radius_km, COALESCE(sp.delivery_radius_km, _radius_km))` for radius safety

```text
FROM seller_profiles sp
LEFT JOIN societies s 
  ON s.id = sp.society_id 
  AND s.latitude IS NOT NULL 
  AND s.longitude IS NOT NULL
WHERE sp.verification_status = 'approved'
  AND sp.is_available = true
  AND COALESCE(sp.latitude, s.latitude) IS NOT NULL
  AND COALESCE(sp.longitude, s.longitude) IS NOT NULL
  -- Bounding box pre-filter (fast index scan)
  AND COALESCE(sp.latitude, s.latitude::dp) BETWEEN (_lat - _radius_km * 0.009) AND (_lat + _radius_km * 0.009)
  AND COALESCE(sp.longitude, s.longitude::dp) BETWEEN (_lng - _radius_km * 0.009) AND (_lng + _radius_km * 0.009)
  -- Precise haversine
  AND haversine_km(...) <= LEAST(_radius_km, COALESCE(sp.delivery_radius_km, _radius_km))
  -- Community gating: commercial sellers bypass this entirely
  AND (sp.seller_type = 'commercial' OR sp.sell_beyond_community = true 
       OR sp.society_id = (SELECT p2.society_id FROM profiles p2 WHERE p2.id = auth.uid()))
```

### 6. Update `get_location_stats`

Same LEFT JOIN + COALESCE + bounding box pattern.

### 7. Update `create_multi_vendor_orders`

Delivery radius check uses `COALESCE(sp.latitude, s.latitude)` instead of only `s.latitude`.

## Frontend Changes

### 1. Rename `SetSocietyLocationSheet` to `SetStoreLocationSheet`

- File: `src/components/seller/SetSocietyLocationSheet.tsx` → `src/components/seller/SetStoreLocationSheet.tsx`
- Title: "Set Store Location"
- Call `set_my_store_coordinates` RPC (with `p_source = 'manual'` for search, `p_source = 'gps'` for GPS)
- Remove society-specific error messaging

### 2. Update `SellerVisibilityChecklist.tsx`

- Import `SetStoreLocationSheet` instead of `SetSocietyLocationSheet`

### 3. Update `useSellerHealth.ts`

- Fetch `latitude, longitude, seller_type` from `seller_profiles` in the query
- Location check logic:
  - If `sp.latitude` exists OR `society.latitude` exists → PASS
  - If neither → FAIL with "Store location not configured" + action "Set Store Location"
  - Remove "No society linked" message entirely
- For `seller_type = 'commercial'`: skip society-related checks

### 4. Update `useSellerApplication.ts`

- No structural changes needed. `society_id` already allows null (line 226: `profile?.society_id || null`)

## Technical Details

- **Bounding box**: `0.009` degrees per km is conservative (~111 km per degree latitude). This pre-filters candidates before expensive haversine math.
- **ENUM vs text**: `seller_type_enum` prevents typos, enables faster filtering.
- **`store_location_source`**: Set automatically by the system (`'society'` during backfill, `'manual'` from map pin, `'gps'` from device). Never user-controlled.
- **`sell_beyond_community` for commercial**: Commercial sellers (`seller_type = 'commercial'`) always bypass the community restriction regardless of the flag value.

## Files Changed

1. **Migration SQL** — schema + backfill + 4 RPCs (new `set_my_store_coordinates`, updated `set_my_society_coordinates`, `search_sellers_by_location`, `get_location_stats`, delivery radius in `create_multi_vendor_orders`)
2. **`src/components/seller/SetStoreLocationSheet.tsx`** — renamed from SetSocietyLocationSheet, calls new RPC
3. **`src/components/seller/SellerVisibilityChecklist.tsx`** — import update
4. **`src/hooks/queries/useSellerHealth.ts`** — coordinate-aware location check, commercial seller handling

