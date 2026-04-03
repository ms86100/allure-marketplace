

# Society-Aware Banner System — Handling Sellers Without a Society

## The Gap

The current plan assumes every seller has a `society_id`. But the platform has two seller types:

1. **`society_resident`** — tied to a society (`society_id` is set)
2. **`commercial`** — independent sellers with NO society (`society_id IS NULL`), operating purely on coordinates + `delivery_radius_km`

The planned `resolve_banner_products` RPC has this eligibility logic:

```
sp.society_id = p_society_id
OR (sp.sell_beyond_community = true AND haversine_km(...) <= sp.delivery_radius_km)
```

**This excludes commercial sellers entirely** because:
- `sp.society_id IS NULL` → fails the first condition
- `sp.sell_beyond_community` may be `false` or irrelevant for commercial sellers → fails the second condition

A commercial seller 2km away from a society with a 5km delivery radius would be invisible in all banners.

## Architecture Principle

Per the domain separation rules:
- **Marketplace = coordinate-based** (no society gating)
- **Society = community-gated**

Banners are a **marketplace feature** — they promote products. The eligibility logic must respect coordinates, not just society membership.

## Fix: 3-Way Seller Eligibility

Replace the 2-condition check with a 3-way eligibility in the RPC:

```text
Seller is eligible for a banner targeting society X if:

1. sp.society_id = X                                    -- local resident seller
2. sp.society_id IS NOT NULL AND sp.society_id != X     -- cross-society resident
   AND sp.sell_beyond_community = true
   AND haversine_km(seller, society) <= delivery_radius_km
3. sp.society_id IS NULL                                -- commercial seller (no society)
   AND sp.latitude IS NOT NULL
   AND haversine_km(seller, society) <= delivery_radius_km
```

For **global banners** (no target society), buyer-level radius check alone applies:
```text
haversine_km(seller, buyer) <= delivery_radius_km
```

## Changes Required

### Step 1: Database Migration — Updated RPC

The `resolve_banner_products` RPC's WHERE clause becomes:

```sql
AND (
  p_society_id IS NULL  -- global banner: skip society filter
  OR sp.society_id = p_society_id  -- local seller
  OR (
    sp.society_id IS NOT NULL
    AND sp.sell_beyond_community = true
    AND _society_lat IS NOT NULL AND sp.latitude IS NOT NULL
    AND public.haversine_km(sp.latitude, _society_lat, sp.longitude, _society_lng)
        <= sp.delivery_radius_km
  )
  OR (
    sp.society_id IS NULL  -- commercial seller, no society
    AND sp.latitude IS NOT NULL
    AND _society_lat IS NOT NULL
    AND public.haversine_km(sp.latitude, _society_lat, sp.longitude, _society_lng)
        <= sp.delivery_radius_km
  )
)
```

This can be simplified (conditions 2 and 3 share the radius check, differ only on `sell_beyond_community`):

```sql
AND (
  p_society_id IS NULL
  OR sp.society_id = p_society_id
  OR (
    sp.society_id IS DISTINCT FROM p_society_id
    AND (sp.society_id IS NULL OR sp.sell_beyond_community = true)
    AND sp.latitude IS NOT NULL AND _society_lat IS NOT NULL
    AND public.haversine_km(sp.latitude, _society_lat, sp.longitude, _society_lng)
        <= sp.delivery_radius_km
  )
)
```

All other steps from the previously approved plan remain unchanged — the only modification is this eligibility clause in the RPC.

### Step 2: Admin UI — No changes needed

The multi-society picker already targets societies. Commercial sellers are automatically included when they fall within radius of any targeted society. The pre-save validation will naturally count their products.

### Step 3: Resolver & Buyer-Side — No changes needed

The resolver calls the RPC with `societyId` and buyer coords. The RPC handles the 3-way logic server-side.

## Files Changed

| File | Change |
|---|---|
| Migration SQL (`resolve_banner_products` RPC) | Update seller eligibility WHERE clause to include commercial sellers via radius check |

Everything else from the approved plan stays identical. This is a single SQL clause fix that closes the gap for society-less sellers.

## Validation Scenarios

| Scenario | Expected |
|---|---|
| Commercial seller, 2km from Society A, radius 5km | Visible in Society A banners |
| Commercial seller, 10km from Society A, radius 5km | NOT visible |
| Commercial seller, no coordinates | NOT visible (cannot verify radius) |
| Society resident, same society | Visible |
| Society resident, different society, `sell_beyond_community=false` | NOT visible |
| Society resident, different society, `sell_beyond_community=true`, within radius | Visible |
| Global banner, commercial seller within buyer radius | Visible |

