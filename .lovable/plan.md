

# Scale-Ready Architecture — Consolidated 5-Session Plan (With All Conditions Met)

## Session 1: Kill Legacy RPC + Batching Protection

### What
- Replace `search_sellers_by_location` in `useSearchPage.ts` (line 195) with `search_products_fts` for category-only browsing
- Update e2e test `marketplace-society-separation-e2e.test.ts` to use `search_sellers_paginated`
- Add composite index: `products(seller_id, is_available, approval_status)`
- **NEW:** Add seller ID batching in `useMarketplaceProducts` — max 25 seller IDs per `get_products_for_sellers` call, merge results

### Files
| File | Change |
|------|--------|
| `src/hooks/useSearchPage.ts` | Replace line 192-204 category-only path with `search_products_fts` RPC (already works for category-only when `_query` is empty/null) |
| `src/hooks/queries/useMarketplaceProducts.ts` | Chunk `sellerIds` into batches of 25, fire parallel RPCs, merge results |
| `src/test/marketplace-society-separation-e2e.test.ts` | Replace `search_sellers_by_location` calls with `search_sellers_paginated` |
| Migration SQL | `CREATE INDEX idx_products_seller_avail ON products(seller_id, is_available, approval_status)` |

---

## Session 2: Infinite Scroll + Hard Cap

### What
- Convert `useMarketplaceProducts` to `useInfiniteQuery` with 50 products/page
- Convert `useMarketplaceSellers` to `useInfiniteQuery` with 50 sellers/page
- Add `IntersectionObserver` trigger in `MarketplaceSection` discovery rows
- **NEW:** Hard cap at 1000 total fetched items — `hasNextPage` returns false after cap

### Files
| File | Change |
|------|--------|
| `src/hooks/queries/useMarketplaceProducts.ts` | `useInfiniteQuery`, `getNextPageParam` based on returned count vs limit, stop at 1000 |
| `src/hooks/queries/useMarketplaceSellers.ts` | `useInfiniteQuery` with 50/page |
| `src/hooks/queries/useMarketplaceData.ts` | Compose infinite pages into flat `RpcSellerRow[]` for backward compat |
| `src/components/home/MarketplaceSection.tsx` | Add sentinel `<div ref={observerRef}>` at bottom of discovery rows |

---

## Session 3: Image Optimization + Lazy Loading

### What
- Create `src/utils/imageHelpers.ts` with `optimizedImageUrl(url, { width, quality, format })` that appends Supabase Storage transform params
- Apply to all product/seller image renders (~15 components)
- Add `srcSet` for responsive sizes on product grid cards
- **NEW:** Add `decoding="async"` to all `<img>` tags (already have `loading="lazy"` in most places)

### Files
| File | Change |
|------|--------|
| `src/utils/imageHelpers.ts` | New file — `optimizedImageUrl()` helper |
| `src/components/product/ProductCard.tsx` | Use helper + add `decoding="async"` + `srcSet` |
| `src/components/product/ProductListingCard.tsx` | Same |
| `src/components/home/CategoryImageGrid.tsx` | Same |
| `src/components/home/ShopByStoreDiscovery.tsx` | Same |
| `src/components/home/FeaturedBanners.tsx` | Same |
| `src/components/home/AutoHighlightStrip.tsx` | Same |
| ~8 other image-rendering components | Same pattern |

---

## Session 4: Search Hardening + Proper Geo Index

### What
- **Replace composite geo index with GIST earthdistance:**
  ```sql
  CREATE EXTENSION IF NOT EXISTS cube;
  CREATE EXTENSION IF NOT EXISTS earthdistance;
  CREATE INDEX idx_seller_geo ON seller_profiles 
    USING GIST (ll_to_earth(latitude, longitude));
  ```
  Update `search_sellers_paginated` to use `earth_box` + `earth_distance` instead of bounding-box math
- **Replace prefix tsquery with pg_trgm trigram index:**
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);
  ```
  Use trigram similarity for autocomplete (safer than `foo:*` tsquery at scale)
- Add staleTime deduplication review across all search hooks
- **NEW:** Add request throttling — max 3 concurrent search RPCs per session, debounce at 300ms (already exists partially)

### Files
| File | Change |
|------|--------|
| Migration SQL | GIST index + pg_trgm extension + trigram index |
| `search_sellers_paginated` RPC | Use `earth_box`/`earth_distance` for geo filtering |
| `search_products_fts` RPC | Add trigram fallback path for short queries (< 3 chars) |
| `src/components/search/SearchAutocomplete.tsx` | Add concurrent request guard |
| `src/hooks/useSearchPage.ts` | Verify debounce covers all paths |

---

## Session 5: Load Testing + Failure Simulation

### What
- Generate synthetic 300K product dataset, run `EXPLAIN ANALYZE` on all 4 RPCs
- Add `performance.mark`/`performance.measure` wrappers to marketplace, search, and checkout hooks
- **NEW:** Failure simulation — test with throttled network (3G), artificial DB latency, RPC timeout behavior
- Document scale limits, when to add read replicas, connection pooling thresholds
- Document CDN strategy (Cloudflare in front of Supabase Storage for image caching)

### Files
| File | Change |
|------|--------|
| `src/lib/perf-telemetry.ts` | New — `markStart`/`markEnd` wrappers |
| Critical hooks | Wrap queryFn with telemetry |
| `/mnt/documents/scale-playbook.md` | Architecture limits doc |
| SQL scripts | EXPLAIN ANALYZE benchmarks |

---

## Execution Order

```text
Session 1 → Session 2 → Session 3 (parallel with 2) → Session 4 (parallel) → Session 5 (last)
```

## Scale Targets After All Sessions

| Metric | Current | After |
|--------|---------|-------|
| Max sellers before timeout | ~500 | 10,000+ |
| Product payload per page | 300KB+ | 30KB |
| Image bandwidth per card | ~1MB | ~20KB |
| Search latency at 300K rows | 2-10s | <100ms |
| Geo query at 10K sellers | linear scan | GIST O(log n) |
| Memory on low-end mobile | OOM at 5K products | Stable (hard cap 1000) |

