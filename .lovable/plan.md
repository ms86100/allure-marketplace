

# Remaining Performance Fixes: Order Detail + Orders List

## What's left

Two items from the approved plan remain unimplemented. Everything else is done.

---

### 1. Order Detail — eliminate waterfall + add caching

**Current problem** (`useOrderDetail.ts`, 382 lines):
- Uses `useState` + `useEffect` — no React Query caching, every navigation re-fetches
- `fetchOrder` (line 176) does the main query, then **sequentially** fetches `products.category` and `category_config` for parent_group derivation (lines 186-199)
- 15-second polling interval (line 170) runs even though realtime subscription already handles updates
- Review check (line 205) is another sequential query after the main fetch

**Fix:**
1. Add `product:products(category, listing_type)` to the `order_items` join in the main select (line 178) — eliminates the sequential product fetch
2. Prefetch `category_config` from React Query cache (it's already fetched by `useMarketplaceConfig`) — eliminates the sequential category_config fetch
3. Convert to `useQuery` with `queryKey: ['order-detail', id]` for automatic caching
4. Keep realtime subscription to invalidate the query cache (not re-fetch manually)
5. Remove 15s polling — realtime handles it
6. Move review check into the same query or a parallel `useQuery`

| File | Change |
|------|--------|
| `src/hooks/useOrderDetail.ts` | Refactor fetchOrder to useQuery, inline product join, remove polling |

### 2. Orders List — add React Query caching

**Current problem** (`OrdersPage.tsx`, lines 123-212):
- Manual `useState` + `useEffect` + `fetchOrders` callback
- Every tab switch, back-navigation, or visibility change triggers a full re-fetch
- No caching — navigating away and back always hits the database
- Cursor-based pagination is manual

**Fix:**
1. Convert to `useQuery` with `queryKey: ['orders', type, filter]`
2. Use `useInfiniteQuery` for pagination (cursor = `created_at` of last item)
3. Keep visibility refetch via `refetchOnWindowFocus: true` (built into React Query)
4. Remove manual `useEffect` listeners — React Query handles it

| File | Change |
|------|--------|
| `src/pages/OrdersPage.tsx` | Convert OrderList to useInfiniteQuery |

---

## Implementation order

| Step | What | Impact |
|------|------|--------|
| 1 | Order detail: inline product join + useQuery + remove polling | -400ms, cached revisits |
| 2 | Orders list: useInfiniteQuery | cached back-nav, -300ms |

## Expected results

| Page | Current | After |
|------|---------|-------|
| Order Detail (cold) | 2-3s | <1s |
| Order Detail (cached) | 2-3s | instant |
| Orders List (cold) | 2-3s | <1.5s |
| Orders List (back-nav) | 2-3s | instant |

