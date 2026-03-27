

# Production-Grade Performance Overhaul

## Diagnosis (Worse Than Originally Estimated)

The homepage fires **7-8 identical `search_sellers_by_location` RPC calls** — not 3 as initially identified:

```text
Homepage cold load — all fire independently:
1. useProductsByCategory     → search_sellers_by_location
2. useNearbyProducts         → search_sellers_by_location  
3. useLocalSellers           → search_sellers_by_location
4. useNearbySocietySellers   → search_sellers_by_location
5. usePopularProducts        → search_sellers_by_location (+ calls useNearbyProducts = +1)
6. useTrendingProducts       → search_sellers_by_location
7. mergeProductFlags ×3      → SELECT products WHERE id IN (...)
8. useMarketplaceConfig      → SELECT * FROM system_settings
9. useMarketplaceLabels      → SELECT * FROM system_settings WHERE key IN (54 keys)

CategoryGroupPage is even worse:
→ Loops search_sellers_by_location per category (up to 5× sequential!)
```

Each RPC call takes 300-600ms. With 7 parallel + 3 sequential follow-ups, that's **2-4 seconds of pure API time** before rendering.

---

## Fix Architecture

### Phase 1: Single RPC, Single Cache (Eliminates 6 duplicate calls)

**New file: `src/hooks/queries/useMarketplaceData.ts`**

One hook calls `search_sellers_by_location` once per unique `(lat, lng, radius, excludeSociety)` tuple. All other hooks become **derived views** reading from this cache:

```text
useMarketplaceData ── single RPC call ──┐
   ├── useProductsByCategory  (groups by category)
   ├── useNearbyProducts      (flat product list)
   ├── useLocalSellers        (groups by seller)
   ├── useNearbySocietySellers (groups by distance band)
   ├── usePopularProducts     (sorts by order count)
   └── useTrendingProducts    (sorts by recency)
```

Each derived hook uses `useQuery` with `queryFn` that reads from `queryClient.getQueryData(['marketplace-data', ...])` — zero network calls. They transform and slice the shared data in-memory.

### Phase 2: SQL Optimization (Migration)

**Update `search_sellers_by_location` RPC:**

1. **CTE for haversine**: Compute distance once per seller row, filter and sort on the pre-computed value (currently computed 4× per row in WHERE + ORDER + subquery)
2. **Include product flags**: Add `is_bestseller`, `is_recommended`, `is_urgent` to the JSON output inside `matching_products` — eliminates all `mergeProductFlags` secondary queries
3. **Add indexes**:
   - `products(seller_id, is_available, approval_status)` 
   - `seller_profiles(latitude, longitude) WHERE verified AND available`
   - `orders(buyer_id, status, created_at DESC)`

### Phase 3: Consolidate Settings Queries

Both `useMarketplaceConfig` and `useMarketplaceLabels` independently scan `system_settings`. Merge into a single prefetched query with shared cache key `['system-settings-all']`. Both hooks read from the same cached map.

### Phase 4: Fix CategoryGroupPage N+1

Currently loops `search_sellers_by_location` per category (up to 5 sequential calls). Replace with a single call (no `_category` filter) + client-side category filtering.

### Phase 5: Defer Non-Critical Queries

`useSocialProof` and `get_user_frequent_products` create serial dependencies. Make them render-deferred — product cards appear immediately, social proof badges animate in after data loads.

---

## Implementation Order

| Step | What | Impact | Risk |
|------|------|--------|------|
| 1 | SQL migration (CTE + flags + indexes) | -200ms per call, eliminates mergeProductFlags | Low — additive changes |
| 2 | Create `useMarketplaceData` shared hook | Eliminates 6 duplicate RPC calls | Medium — careful refactor |
| 3 | Refactor all 6 consumer hooks | Each becomes a derived view | Medium — must preserve all return shapes |
| 4 | Consolidate system_settings | -150ms | Low |
| 5 | Fix CategoryGroupPage loop | -1500ms on that page | Low |
| 6 | Defer social proof | -200ms off critical path | Low |

## Expected Results

| Metric | Current | After |
|--------|---------|-------|
| RPC calls on homepage | 7-8 | **1** |
| Secondary queries (mergeProductFlags) | 3 | **0** |
| system_settings scans | 2 | **1** |
| CategoryGroupPage RPC calls | up to 5 | **1** |
| Homepage cold load | 5-6s | **<2s** |
| Homepage warm load | 2-3s | **<0.5s** |
| Category page load | 3-5s | **<1.5s** |

## Files Changed

| File | Change |
|------|--------|
| New SQL migration | CTE optimization, product flags in JSON, indexes |
| `src/hooks/queries/useMarketplaceData.ts` (new) | Single shared RPC hook |
| `src/hooks/queries/useProductsByCategory.ts` | Derive from shared cache |
| `src/hooks/queries/useNearbyProducts.ts` | Derive from shared cache |
| `src/hooks/queries/useStoreDiscovery.ts` | Derive from shared cache |
| `src/hooks/queries/usePopularProducts.ts` | Derive from shared cache |
| `src/hooks/queries/useTrendingProducts.ts` | Derive from shared cache |
| `src/hooks/queries/useProductFlags.ts` | Remove (flags come from RPC) |
| `src/hooks/useMarketplaceConfig.ts` | Share cache with labels |
| `src/hooks/useSystemSettingsRaw.ts` | Use shared settings cache |
| `src/hooks/useMarketplaceLabels.ts` | Use shared settings cache |
| `src/pages/CategoryGroupPage.tsx` | Single RPC + client filter |
| `src/components/home/MarketplaceSection.tsx` | Defer social proof rendering |

