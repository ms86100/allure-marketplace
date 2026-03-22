

## Fix: Order Detail Page Slow Load After Placement (3-4s Waterfall)

### Root Cause

The order detail page has a **sequential waterfall of 4-6 DB round trips** before it can render:

```text
1. fetchOrder() ──────────────────────── ~400ms
2. derive parent_group (3 queries)  ──── ~1200ms  (order_items → products → category_config)
3. useCategoryStatusFlow (1-2 queries) ─ ~800ms   (flow + possible fallback)
4. useStatusTransitions ─────────────── ~400ms
                                         ─────────
                                         ~2800ms total (best case)
```

Steps 2-4 cannot start until the previous step completes because each depends on the prior result. On mobile networks this easily reaches 3-4 seconds.

### Fix Strategy: Eliminate the Waterfall

**Approach A — Include `parent_group` in the order query (primary fix):**

The 3-query chain in step 2 exists only because the seller's `primary_group` isn't always available. But the order already joins `seller_profiles` which HAS `primary_group`. The issue is the select clause doesn't include it.

Looking at the `fetchOrder` query on line 158:
```
seller:seller_profiles(id, business_name, user_id, primary_group, profile:...)
```

Actually `primary_group` IS already selected. The problem is that `sellerPrimaryGroup` reads from `seller?.primary_group` and the seller is only available AFTER `fetchOrder` completes and sets `order`. Then the `derivedParentGroup` effect fires anyway because the state update hasn't propagated yet.

The real waterfall is:
1. **Render 1**: `fetchOrder` starts, `isLoading=true`
2. **Render 2**: order loads, `seller.primary_group` available, `useCategoryStatusFlow` fires with correct group
3. **Render 3**: flow loads, `useStatusTransitions` fires
4. **Render 4**: transitions load, page finally renders

**Fix: Parallel fetch flow and transitions alongside the order**, and cache/prefetch the flow data.

### Implementation Plan

**1. Prefetch flow data during checkout navigation** (`useCartPage.ts`):
- After order creation, before navigating to `/orders/:id`, call `queryClient.prefetchQuery` for the `category_status_flows` data using the known seller's `parent_group` and `transaction_type`. This data is already known at checkout time.

**2. Convert `useCategoryStatusFlow` to use React Query** (`useCategoryStatusFlow.ts`):
- Replace `useState/useEffect` with `useQuery` so flow data is cached across navigations
- Use a stable query key like `['status-flow', parentGroup, transactionType]`
- Set `staleTime: 5 * 60 * 1000` (5 min) since flow config rarely changes

**3. Convert `useStatusTransitions` to use React Query** (`useCategoryStatusFlow.ts`):
- Same pattern — cached and stale-while-revalidate

**4. Eliminate the 3-query parent_group derivation waterfall** (`useOrderDetail.ts`):
- The `seller.primary_group` is already fetched in the order query. The `derivedParentGroup` fallback (3 sequential queries) only fires when `sellerPrimaryGroup` is null.
- Fix: Compute `effectiveParentGroup` immediately from the fetched order data instead of waiting for a separate `useEffect` cycle. Move the derivation into `fetchOrder` itself — after getting the order, if `seller.primary_group` is null, do the 3 lookups there (still sequential but within a single async function, not across renders).

**5. Show skeleton with partial data** (`OrderDetailPage.tsx`):
- Render the order header (seller name, amount, items) immediately when the order loads, even before the flow is ready. Only the status timeline section needs flow data.

### Files Changed

| File | Change |
|---|---|
| `src/hooks/useCategoryStatusFlow.ts` | Convert `useCategoryStatusFlow` and `useStatusTransitions` to `useQuery` with caching |
| `src/hooks/useOrderDetail.ts` | Move parent_group derivation into `fetchOrder`; eliminate render-cycle waterfall |
| `src/hooks/useCartPage.ts` | Prefetch flow data before navigating to order detail |
| `src/pages/OrderDetailPage.tsx` | Show partial content while flow loads (progressive rendering) |

### Expected Impact
- **Before**: 3-4 seconds of blank skeleton
- **After**: ~400ms to show order content, flow data arrives from cache or within 800ms

