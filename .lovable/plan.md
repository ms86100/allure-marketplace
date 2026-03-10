

# Dynamic Location-Aware Header Stats

## Current State
The header currently shows society-specific stats (society name, families count, sellers count, verified badge) via `useSocietyStats` which queries `seller_profiles` and `societies` tables filtered by `societyId`. This only works for the user's own society — it does not adapt when the user changes their browsing location.

## What Data We Can Reliably Query

From the existing database, we can derive these data points within a browsing radius:

1. **Sellers count** — count distinct sellers from `search_sellers_by_location` RPC (already exists, proven)
2. **Recent orders** — count from `orders` table where `created_at > now() - interval '24 hours'` joined with seller locations within radius
3. **Societies count** — count distinct societies from nearby sellers

A new **RPC function** is the cleanest approach — one DB call returning all stats for a given lat/lng/radius.

## Plan

### 1. Create a new DB RPC: `get_location_stats`
```sql
-- Returns: sellers_count, orders_today, societies_count
-- Inputs: _lat, _lng, _radius_km
```
- Count approved sellers within radius (reusing `haversine_km`)
- Count orders in last 24h from those sellers
- Count distinct societies those sellers belong to

### 2. Create hook: `useLocationStats`
- New file `src/hooks/queries/useLocationStats.ts`
- Takes `lat`, `lng`, `radiusKm` from `useBrowsingLocation()`
- Returns `{ sellersNearby, ordersToday, societiesNearby }`
- Uses `jitteredStaleTime(5 min)`

### 3. Update Header component
- Replace the current static `societyStats` block (lines 78-101) with a dynamic location-aware strip
- When browsing location exists: show `📍 Location Label · X sellers · Y orders today`
- When no browsing location (fallback): show existing society stats as before
- Display inline below the society name line, using the same compact chip style

### 4. Remove redundancy
- The browsing location chip (lines 155-167) already shows the location name — the new stats will be integrated into/alongside that chip rather than duplicating it

## Visual Output (compact, below branding)
```text
┌──────────────────────────────────────────┐
│ Sociva                    [icons] [avatar]│
│ COMMUNITY MARKETPLACE                    │
│ 🏢 Shriram Greenfield ✓                 │
│ 📍 Near Shriram Greenfield · 12 sellers · 5 orders today │
│ [──────── Search bar ────────]           │
└──────────────────────────────────────────┘
```

## Files Changed
- **Migration**: New `get_location_stats` RPC
- **New**: `src/hooks/queries/useLocationStats.ts`
- **Edit**: `src/components/layout/Header.tsx` — integrate dynamic stats

