

# Fix: `search_sellers_by_location` Type Mismatch Breaking All Listings

## Root Cause

The `societies` table stores `latitude`/`longitude` as `numeric`, but the latest migration (added `seller_latitude`/`seller_longitude` to the return type) declared them as `double precision`. PostgreSQL enforces strict type matching on function return types, so `s.latitude AS seller_latitude` returns `numeric` but the function expects `double precision` — causing a 400 error on every call.

This is why listings disappeared: every discovery hook (`useNearbyProducts`, `useTrendingProducts`, `usePopularProducts`, `useProductsByCategory`) calls this RPC and gets back the error instead of data.

## Fix

**One migration**: Recreate the function with explicit casts on the two columns:

```sql
s.latitude::double precision AS seller_latitude,
s.longitude::double precision AS seller_longitude
```

Also cast the `haversine_km` inputs for safety since that function likely expects `double precision` too:

```sql
public.haversine_km(_lat, _lng, s.latitude::double precision, s.longitude::double precision)
```

No frontend changes needed — the data shapes are already correct in the hooks.

### Files Changed
- **1 migration** — Drop and recreate `search_sellers_by_location` with `::double precision` casts on `s.latitude` and `s.longitude`

