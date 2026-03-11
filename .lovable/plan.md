

# Marketplace Stabilization Plan — 10 Fixes, 3 Phases

This plan addresses the 5 critical issues identified in the audit. No new features. Pure reliability work.

---

## Phase 1 — Core Logic Fixes (Priority 1-3)

### Fix 1: Create unified radius constant
Create `src/lib/marketplace-constants.ts` with `MARKETPLACE_RADIUS_KM = 5`. Import and use in all 7 hooks that currently hardcode different values.

**Files changed:**
- **Create** `src/lib/marketplace-constants.ts`
- `useLocalSellers` → change `2` to `MARKETPLACE_RADIUS_KM`
- `usePopularProducts` → change `5` to constant
- `useTrendingProducts` → change `3` to constant
- `useNearbyProducts` → change `profile?.search_radius_km ?? 10` to `?? MARKETPLACE_RADIUS_KM`
- `useCategoryProducts` → change `10` to constant
- `useProductsByCategory` → change `10` to constant
- `useNearbySocietySellers` → change default param `5` to constant

### Fix 2: Trending must follow browsing location
Remove the `effectiveSocietyId`-first path in `useTrendingProducts`. Always use coordinate-based discovery via `search_sellers_by_location` with `browsingLocation` lat/lng and `MARKETPLACE_RADIUS_KM`. The society-based `get_trending_products_by_society` RPC becomes unused here.

**Files changed:** `src/hooks/queries/useTrendingProducts.ts`

### Fix 3: Enforce `sell_beyond_community` in RPC
Update the `search_sellers_by_location` SQL function to add:
```sql
AND (sp.sell_beyond_community = true OR sp.society_id = (
  SELECT p.society_id FROM public.profiles p WHERE p.id = auth.uid()
))
```
This ensures sellers who disabled cross-society selling only appear to buyers in their own society.

**Database migration required.**

---

## Phase 2 — Real-time & Cache Fixes (Priority 4)

### Fix 4: Fix real-time query key invalidation
In `ShopByStore.tsx`, change invalidation targets from `['shop-by-store']`, `['local-sellers']`, `['nearby-sellers']` to `['store-discovery']` to match actual query keys used by discovery hooks.

**Files changed:** `src/components/home/ShopByStore.tsx`

### Fix 5: Invalidate discovery queries on location change
In `BrowsingLocationContext.tsx`, when `setBrowsingLocation` is called, also call `queryClient.invalidateQueries({ queryKey: ['store-discovery'] })` and `['trending-products']` to force fresh data.

**Files changed:** `src/contexts/BrowsingLocationContext.tsx`

### Fix 6: Fix `TrendingInSociety` header text
Since trending now follows browsing location (not society), update the heading from "Trending in your society" to "Trending near you".

**Files changed:** `src/components/home/TrendingInSociety.tsx`

---

## Phase 3 — Cart Safety & Dedup (Priority 5+)

### Fix 7: Cart location guard
When browsing location changes by more than 2 km, show a warning dialog: "Switching location will clear your cart." If user confirms, call `clearCart()`. If cancelled, revert location. Add distance check in `BrowsingLocationContext.setBrowsingLocation`.

**Files changed:** `src/contexts/BrowsingLocationContext.tsx`, `src/hooks/useCart.tsx` (expose `clearCart` for external use — already exposed)

### Fix 8: Consistent Set-based dedup in all hooks
Replace `products.some(x => x.id === p.id)` (O(n²)) with `Set`-based dedup in `useTrendingProducts` and add dedup to `useCategoryProducts` which currently has none.

**Files changed:** `src/hooks/queries/useTrendingProducts.ts`, `src/hooks/queries/usePopularProducts.ts` (the `useCategoryProducts` function)

### Fix 9: Remove `browseBeyond` gate from `useNearbyProducts`
Since all discovery is now coordinate-based with a unified 5km radius, the `browse_beyond_community` flag on the buyer profile is redundant for discovery. Remove the `enabled: browseBeyond &&` guard so the hook fires for all users with coordinates.

**Files changed:** `src/hooks/queries/useNearbyProducts.ts`

### Fix 10: Update `useSearchPage` radius defaults
Change the search page's default radius from `10` to `MARKETPLACE_RADIUS_KM` for consistency.

**Files changed:** `src/hooks/useSearchPage.ts`

---

## Summary

| Phase | Fixes | Risk Level | Impact |
|-------|-------|-----------|--------|
| 1 | Radius + Trending + RPC | High (core logic) | Marketplace becomes consistent |
| 2 | Cache + Real-time | Medium | UI stays fresh on changes |
| 3 | Cart + Dedup + Cleanup | Lower | Edge cases + performance |

**Total files touched:** ~12 frontend files + 1 database migration
**No new features. No new UI components. Pure stabilization.**

