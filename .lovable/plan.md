

# Post-Migration Audit: Critical Issues Assessment

After a deep scan of the entire codebase (150+ TS/TSX files, 89 SQL migrations, all edge functions, all RPCs, all triggers), here is the honest verdict.

---

## Critical Issues Found: **0 High-Risk / Production-Breaking**

The core migration is complete and backward compatible. All discovery RPCs use `LEFT JOIN` + `COALESCE`. All frontend discovery hooks consume `search_sellers_by_location` with coordinate parameters. No production-breaking gaps remain.

## Remaining Issues Found: **4 Low-Medium Risk** (cosmetic/edge-case, not production-breaking)

---

### Issue 1: `useSellersByCategory` — Dead Code with Society Filter
- **File**: `src/hooks/queries/useSellersByCategory.ts`
- **Problem**: Filters products by `seller.society_id` (line 50). However, this hook is **never imported or used** in any component — confirmed zero TSX references.
- **Risk**: None (dead code). But if ever re-activated, it would exclude commercial sellers.
- **Fix**: Delete the file or convert to coordinate-based filtering if needed later.

### Issue 2: `useCommunitySearchSuggestions` — Society-Scoped Search Suggestions
- **File**: `src/hooks/queries/useCommunitySearchSuggestions.ts`
- **RPC**: `get_society_search_suggestions(_society_id)`
- **Problem**: Search suggestions ("People in your society also searched for...") are scoped to `effectiveSocietyId`. Users without a society see no suggestions. Users browsing a different location still see their home society's suggestions.
- **Risk**: Low — cosmetic. Suggestions are a UX enhancement, not core functionality.
- **Fix (future)**: Convert RPC to accept lat/lng and aggregate search demand within radius, similar to what was done for `get_society_order_stats`.

### Issue 3: `DemandInsights` — Society-Scoped Unmet Demand for Sellers
- **File**: `src/components/seller/DemandInsights.tsx`
- **RPC**: `get_unmet_demand(_society_id)`
- **Problem**: Shows sellers what buyers in their society are searching for. Commercial sellers without a `society_id` will see no demand insights.
- **Risk**: Low — seller analytics feature, not buyer-facing. Commercial sellers can still operate; they just miss this insight.
- **Fix (future)**: Update `get_unmet_demand` to accept optional lat/lng and search within radius when society_id is null.

### Issue 4: `reset-and-seed-scenario` Edge Function — Uses `search_nearby_sellers` RPC
- **File**: `supabase/functions/reset-and-seed-scenario/index.ts`, line 634
- **Problem**: Calls `search_nearby_sellers` (the OLD society-based RPC) for buyer discovery verification. This is a **test/seed function only**, not production logic.
- **Risk**: None for production. Seed function may fail validation step if old RPC is eventually dropped.
- **Fix (future)**: Update to call `search_sellers_by_location` instead.

---

## Verified Safe — No Issues

| System | Status | Notes |
|--------|--------|-------|
| `search_sellers_by_location` RPC | Safe | LEFT JOIN + COALESCE + commercial bypass |
| `get_location_stats` RPC | Safe | LEFT JOIN + COALESCE |
| `create_multi_vendor_orders` RPC | Safe | LEFT JOIN + COALESCE for radius check |
| `SellerDetailPage.tsx` | Safe | COALESCE coords + commercial bypass (already fixed) |
| `update-delivery-location` edge fn | Safe | Order delivery coords as primary destination (already fixed) |
| `get_seller_demand_stats` RPC | Safe | IF/ELSE branching for commercial (already fixed) |
| `search_demand_log` RLS | Safe | Commercial seller bypass (already fixed) |
| `useSellerHealth` | Safe | COALESCE logic, commercial bypass |
| `useSocialProof` / `get_society_order_stats` | Safe | Radius-based counting (already fixed) |
| All 7 discovery hooks | Safe | All use `search_sellers_by_location` |
| All 75+ community module files | Safe | Use `society_id` for organizational scope, unrelated to discovery |
| All RLS policies | Safe | Community-scoped, discovery RPCs use SECURITY DEFINER |
| All notification triggers | Safe | Fire on order/review events, no society matching |
| `set_order_society_id` trigger | Safe | Allows null for commercial sellers |
| `log_order_activity` trigger | Safe | EXCEPTION handler prevents crashes on null society_id |
| Seller onboarding | Safe | Already allows null society_id |
| `ProfileEditPage` address defaults | Safe | Uses society coords for form pre-fill only |
| `BrowsingLocationContext` | Safe | Fallback chain: override → address → society |
| Auth/signup GPS check | Safe | Validates proximity to selected society during registration, not discovery |

---

## Verdict

**There are no critical issues.** The migration is complete, additive, and fully backward compatible. The 4 remaining items are all low-risk cosmetic/analytics gaps that affect only edge-case UX for commercial sellers — none can break production functionality.

No implementation needed.

