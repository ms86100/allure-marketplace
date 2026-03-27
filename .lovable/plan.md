

# Full App Performance Overhaul — Phases 3-5 + New Pages

## Status Check

**Already done (Phases 1-2):**
- ✅ Single `useMarketplaceData` shared hook — homepage consumer hooks derive from it
- ✅ SQL migration with CTE + product flags in RPC JSON
- ✅ Database indexes added
- ✅ `mergeProductFlags` eliminated from homepage hooks

**Still calling `search_sellers_by_location` independently:**
- `useMarketplaceDataFull` (2nd RPC call, no society exclusion — used by `useLocalSellers`)
- `useSearchPage` line 118 (popular products — 3rd RPC call)
- `useSearchPage` lines 170, 192 (active search — these are intentional, different params)

---

## Remaining Work

### 1. Eliminate `useMarketplaceDataFull` duplicate (homepage: 2 RPCs → 1)

`useStoreDiscovery` uses `useMarketplaceDataFull` which calls `search_sellers_by_location` *without* `_exclude_society_id`. This is a second identical RPC except for one param.

**Fix:** Add an optional `includeOwnSociety` param to `useMarketplaceData`. `useLocalSellers` passes `true`. Both share one cache entry when params match, or we merge the society sellers client-side from the excluded result + a small supplemental query.

**Simpler approach:** Remove exclusion from the main query entirely. Filter out own-society sellers *client-side* in `useProductsByCategory` (which is the only consumer that excludes). This way ONE RPC serves everything.

| File | Change |
|------|--------|
| `src/hooks/queries/useMarketplaceData.ts` | Remove `useMarketplaceDataFull`, make main hook NOT exclude society |
| `src/hooks/queries/useProductsByCategory.ts` | Filter out own-society products client-side |
| `src/hooks/queries/useStoreDiscovery.ts` | Use `useMarketplaceData` instead of `useMarketplaceDataFull` |

### 2. Consolidate system_settings queries (-150ms)

**Current:** `useMarketplaceConfig` does `SELECT * FROM system_settings` (full scan) + `SELECT * FROM admin_settings`. `useSystemSettingsRaw` (used by `useMarketplaceLabels` with 54 keys) does another `SELECT ... WHERE key IN (...)`.

**Fix:** Share a single `['system-settings-all']` cache. `useMarketplaceConfig` fetches all rows and caches them. `useSystemSettingsRaw` reads from the same cache.

| File | Change |
|------|--------|
| `src/hooks/useMarketplaceConfig.ts` | Change queryKey to `['system-settings-all']`, export the raw map |
| `src/hooks/useSystemSettingsRaw.ts` | Read from `['system-settings-all']` cache instead of independent query |

### 3. Search page popular products — derive from shared cache (-300ms)

**Current:** `useSearchPage` line 118 fires its own `search_sellers_by_location` RPC for "popular products" shown before user types.

**Fix:** Import `useMarketplaceData`, derive popular products from cached data, map to `ProductSearchResult[]` format. The active search RPCs (lines 170, 192) stay — they have `_search_term` and `_category` params that differ.

| File | Change |
|------|--------|
| `src/hooks/useSearchPage.ts` | Replace `search-popular-products` useQuery with derivation from `useMarketplaceData()` |

### 4. Defer social proof from critical path (-200ms)

**Current:** `useSocialProof(allProductIds)` in `MarketplaceSection` fires after `allProducts` is derived. The `socialProofMap` loading state doesn't block rendering, but the query creates a serial dependency chain.

**Fix:** Verify `socialProofMap` isn't gating any loading skeleton. Wrap the social proof badges in a deferred rendering pattern so the initial paint shows product cards immediately.

| File | Change |
|------|--------|
| `src/components/home/MarketplaceSection.tsx` | Ensure social proof loading doesn't block any section render |

### 5. Order Detail Page — eliminate waterfall (-400ms)

**Current problem (critical):**
- `useOrderDetail` uses `useState` + `useEffect` (no React Query caching)
- `fetchOrder` does a Supabase `.select()` with joins, then *sequentially* fetches `product.category` and `category_config` for parent_group derivation (lines 186-199)
- No caching between visits — every navigation re-fetches
- 15-second polling interval adds unnecessary load

**Fix:**
1. Convert `fetchOrder` to include product category in the initial select (add `order_items(*, product:products(category, listing_type))`)
2. Convert to `useQuery` for automatic caching between navigations
3. Keep realtime subscription for live updates, but remove the 15s polling (realtime handles it)

| File | Change |
|------|--------|
| `src/hooks/useOrderDetail.ts` | Refactor to useQuery, inline product category in join, remove polling |

### 6. Orders List Page — add caching (-300ms)

**Current:** `OrderList` uses manual `useState`/`useEffect` with `fetchOrders`. No React Query = no caching. Every tab switch or back-navigation re-fetches.

**Fix:** Convert to `useQuery` (or `useInfiniteQuery` for pagination). Cache persists across navigations.

| File | Change |
|------|--------|
| `src/pages/OrdersPage.tsx` | Convert OrderList to useQuery with cursor-based pagination |

### 7. Cart Page — already well-optimized (no major changes)

The cart uses React Query with 5s staleTime, optimistic updates, 4-layer integrity checks, and `refetchOnMount: 'always'`. The `fetchCartItems` does a single `SELECT ... JOIN products JOIN seller_profiles`. This is already a single query pattern.

**Minor fix:** The cart query joins `seller_profiles(*)` which fetches ALL seller columns. Trim to only needed fields.

| File | Change |
|------|--------|
| `src/hooks/useCart.tsx` | Trim seller select to needed fields only |

---

## Implementation Order

| Step | What | RPC calls eliminated | Risk |
|------|------|---------------------|------|
| 1 | Merge `useMarketplaceDataFull` into main hook | 1 | Low |
| 2 | Consolidate system_settings | 1 query | Low |
| 3 | Search popular products from cache | 1 RPC | Low |
| 4 | Defer social proof | 0 (timing) | Low |
| 5 | Order detail → useQuery + inline joins | 1-2 sequential queries | Medium |
| 6 | Orders list → useQuery | 0 (caching) | Medium |
| 7 | Cart seller select trim | 0 (payload) | Low |

## Expected Results

| Page | Current | After |
|------|---------|-------|
| Homepage (cold) | 5-6s | <2s |
| Homepage (warm) | 2-3s | <0.5s |
| Search | 3-4s | <1.5s |
| Order Detail | 2-3s | <1s (cached: instant) |
| Orders List | 2-3s | <1.5s (cached: instant) |
| Cart | 1-2s | <1s |
| Navigation | 1-2s | <500ms (cache hits) |

