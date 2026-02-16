

# Plan: Location-Aware "Shop by Store" Discovery Section

## What This Delivers

A completely redesigned "Shop by Store" section on the Home page that gives users instant visibility into **who is selling, what they sell, and how far they are** -- all powered by real database data with zero hardcoding.

The section will have two parts:
1. **"In Your Society"** -- sellers within the user's own society, grouped by category
2. **"Nearby Societies"** -- sellers from other societies, grouped into distance bands (within 2 km, 5 km, 10 km)

This works **regardless** of the "Nearby societies" search toggle -- it always calculates and displays distance-based groupings.

---

## Layout Design

```text
+--------------------------------------------------+
|  In Your Society - Green Valley Residency         |
+--------------------------------------------------+
|  [Food]  Seller A, Seller B                       |
|  [Grocery]  Seller C                              |
+--------------------------------------------------+

+--------------------------------------------------+
|  Nearby Societies                                 |
+--------------------------------------------------+
|  Within 2 km                                      |
|  ┌─ Lakeside Towers (1.8 km) ─────────────────┐  |
|  │  [Food] Seller D  │  [Grocery] Seller E     │  |
|  └─────────────────────────────────────────────┘  |
|                                                    |
|  Within 5 km                                      |
|  ┌─ Hilltop Heights (4.2 km) ──────────────────┐  |
|  │  [Food] Seller F  │  [Services] Seller G    │  |
|  └─────────────────────────────────────────────┘  |
|                                                    |
|  Within 10 km                                     |
|  (empty -- nothing in this range)                 |
+--------------------------------------------------+
```

Each seller entry is tappable and navigates to `/seller/{id}`. Category pills show `primary_group` from the seller profile. Society names and distances come from the database's `haversine_km()` function.

---

## Data Strategy (100% DB-backed, no dummies)

### "In Your Society" subsection
- Query `seller_profiles` where `society_id = effectiveSocietyId` and `verification_status = 'approved'`
- Join `profiles` for seller name, join `societies` for society name
- Group sellers by `primary_group` (their main category like Food, Grocery, Services)
- Already available via existing query patterns (similar to current `ShopByStore`)

### "Nearby Societies" subsection
- Call the existing `search_nearby_sellers` RPC with `_radius_km = 10` (max range)
- This RPC already returns: `seller_id`, `business_name`, `society_name`, `distance_km`, `categories`, `primary_group`, `profile_image_url`, `rating`
- **No toggle dependency** -- we always call this RPC for the home page section regardless of the user's search toggle preference
- Group results into distance bands: 0-2 km, 2-5 km, 5-10 km
- Within each band, group by `society_name`, then by `primary_group`
- Empty bands are hidden (not shown)

---

## Technical Details

### Files to Create

1. **`src/components/home/ShopByStoreDiscovery.tsx`** -- New component replacing the current `ShopByStore`
   - Fetches local sellers (own society) with `seller_profiles` query grouped by `primary_group`
   - Fetches nearby sellers via `search_nearby_sellers` RPC with radius 10 km, `enabled: true` (always on)
   - Groups nearby results into distance bands (0-2, 2-5, 5-10)
   - Renders "In Your Society" section with society name from auth context
   - Renders "Nearby Societies" section with collapsible distance bands
   - Each seller shows: profile image, business name, rating, categories as pills
   - Tapping a seller navigates to `/seller/{id}`

2. **`src/hooks/queries/useStoreDiscovery.ts`** -- Custom hook encapsulating data fetching
   - `useLocalSellers()`: queries `seller_profiles` for the user's society, returns sellers grouped by `primary_group`
   - `useNearbySocietySellers()`: calls `search_nearby_sellers` RPC with `_radius_km: 10`, always enabled (not dependent on any toggle), groups results by distance band and society

### Files to Modify

1. **`src/components/home/MarketplaceSection.tsx`**
   - Replace `<ShopByStore />` import and usage with `<ShopByStoreDiscovery />`

2. **`src/components/home/ShopByStore.tsx`**
   - Kept for backward compatibility but no longer imported from MarketplaceSection

### No Database Changes Required
- The `search_nearby_sellers` RPC already returns all needed fields
- The `seller_profiles` table already has `primary_group`, `categories`, `society_id`
- The `societies` table already has `name`, `latitude`, `longitude`

### Key Implementation Details
- Distance bands are computed client-side from the RPC's `distance_km` field (no new SQL needed)
- The "In Your Society" label dynamically shows the society name from `effectiveSociety.name` in auth context
- Empty bands and empty category groups are hidden automatically
- Horizontal scroll for sellers within each category group (Blinkit-style compact cards)
- Loading skeletons shown while data fetches
- If no sellers exist in any section, that section is hidden entirely (no dead-end UI)

