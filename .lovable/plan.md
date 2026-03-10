

## Audit: Impact of Coordinate-Based Discovery on Buy/Sell Flows

### Verdict: 3 issues found, none breaking core buy/sell flow

The cart, checkout, and order creation pipelines are **unaffected** — they operate on `seller_id` / `product_id` and the `create_multi_vendor_orders` RPC auto-fills `society_id` via the `set_order_society_id` trigger. No breakage there.

However, there are **3 gaps** that should be addressed:

---

### Issue 1: Search Page still uses `effectiveSocietyId` + old `search_nearby_sellers` RPC
**File**: `src/hooks/useSearchPage.ts`
**Impact**: Users without a `society_id` (like the current user) get **zero search results**. The search page was not migrated to coordinate-based discovery.
**Fix**: Replace `effectiveSocietyId` gating with `browsingLocation` lat/lng, and swap `search_nearby_sellers` calls with `search_sellers_by_location`.

### Issue 2: Trending Products still uses `effectiveSocietyId`
**File**: `src/hooks/queries/useTrendingProducts.ts`
**Impact**: Users without a `society_id` see **no trending products** on the home page. The hook calls `get_trending_products_by_society` RPC which requires a society UUID.
**Fix**: Either migrate to coordinate-based filtering or make the component gracefully hide when no society is available (trending is inherently society-scoped since it's based on order history within a community).

### Issue 3: Social Proof + Community Search Suggestions use `effectiveSocietyId`
**Files**: `src/hooks/queries/useSocialProof.ts`, `src/hooks/queries/useCommunitySearchSuggestions.ts`
**Impact**: Minor — these are enhancement features (order counts, search suggestions). They return empty for users without a society but don't break any flow.
**Fix**: Low priority. These are inherently community-scoped features.

---

### What's Safe (no action needed)

| Flow | Why it's safe |
|------|--------------|
| **Add to cart** | Uses `product_id` directly, no society dependency |
| **Checkout / Order creation** | `create_multi_vendor_orders` RPC + `set_order_society_id` trigger auto-resolves society from seller |
| **Store availability checks** | Based on `seller_id`, not society |
| **Seller store page** | Loads by seller UUID, no coordinate dependency |
| **Order management** | All by `order_id` / `buyer_id` / `seller_id` |
| **Local sellers discovery** | Already migrated to coordinates |
| **Nearby products** | Already migrated to coordinates |
| **Category products** | Already migrated to coordinates |
| **Popular products** | Already migrated to coordinates |

---

### Recommended Fix Plan

1. **Migrate `useSearchPage.ts`** to use `browsingLocation` lat/lng + `search_sellers_by_location` (high priority — search is a core buying flow)
2. **Migrate `useTrendingProducts.ts`** to coordinate-based or gracefully hide when no society (medium priority)
3. **Leave social proof / community suggestions as-is** — they're inherently society-scoped (low priority)

Shall I proceed with fixing issues 1 and 2?

