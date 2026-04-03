

# Final 3 Gaps — Audit & Implementation Plan

## Gap 1: Category String Matching — NOT A BUG

**Finding**: The `products.category` column is a **Postgres enum** (`service_category`), not free-text. All comparisons use `p.category::text = value` consistently across 50+ RPCs and triggers. The admin banner manager populates category values from `category_config` rows — the same source of truth the products table uses. There is zero risk of "Pooja Items" vs "pooja_items" mismatch because the enum enforces exact values.

**Verdict**: No change needed. This is already bulletproof.

---

## Gap 2: Search Uses ILIKE — CONFIRMED GAP

**Finding**: `bannerProductResolver.ts` line 76 uses `ilike('name', '%keyword%')` for search-mode sections. However, the `search_vector` tsvector column and GIN index already exist on the `products` table. An FTS RPC (`search_products_fts`) is already deployed. The banner resolver simply isn't using it.

**Fix**: Replace the `fetchBySearch` ILIKE query with a call to the existing `search_products_fts` RPC, or use `search_vector @@ websearch_to_tsquery()` via a lightweight new RPC dedicated to banner resolution.

### Changes
**`src/lib/bannerProductResolver.ts`** — Replace `fetchBySearch`:
- Instead of `.ilike('name', ...)`, call `supabase.rpc('search_products_fts', { _query: keyword, _limit: limit })`
- Map the returned fields to `ResolvedProduct` interface
- This gives ranked results, fuzzy matching, and uses the existing GIN index

---

## Gap 3: Stock Race Condition on Click — CONFIRMED GAP

**Finding**: When a buyer taps a section chip, the collection page (`FestivalCollectionPage.tsx`) fetches products via `resolveProducts` with `staleTime` potentially serving cached data. If a product goes out of stock between banner render and collection page load, it still appears.

**Fix**: Two layers:
1. **Collection page**: Set `staleTime: 0` and `refetchOnMount: 'always'` on the products query to force fresh data on every navigation
2. **Add-to-cart revalidation**: Already handled by the existing `trg_enforce_cart_stock` trigger and `useCart` hook which validates stock before insert — so the DB layer is safe. The UI gap is showing stale "available" products.
3. **Product cards**: Already show "Out of Stock" overlay when `stock_quantity <= 0` — this works if query returns fresh data.

### Changes
**`src/pages/FestivalCollectionPage.tsx`**:
- Set `staleTime: 0` on the products query
- Add `refetchOnMount: 'always'`
- Add `refetchInterval: 30_000` for live stock updates while browsing

**`src/lib/bannerProductResolver.ts`** — Add stock-priority ordering:
- Append `ORDER BY stock_quantity > 0 DESC` as first sort criterion so out-of-stock items sink to bottom even if cache is slightly stale

---

## Summary of Changes

| File | Change |
|---|---|
| `src/lib/bannerProductResolver.ts` | Replace ILIKE with FTS RPC call; add stock-priority ordering |
| `src/pages/FestivalCollectionPage.tsx` | Force fresh queries with `staleTime: 0`, `refetchOnMount: 'always'`, `refetchInterval: 30s` |

No database migrations needed — FTS infrastructure already exists.

