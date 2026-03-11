

# Full Impact Audit — Coordinate-First Discovery Migration (Post-Implementation)

## Executive Summary

The core migration is **already implemented and live**. After scanning 151 TypeScript files and all SQL migrations, the system has **one remaining low-medium risk gap** and all other areas are confirmed safe.

---

## ALREADY FIXED — No Action Needed

| Area | File/RPC | Status |
|------|----------|--------|
| Discovery RPC | `search_sellers_by_location` | LEFT JOIN + COALESCE + bounding box + commercial bypass |
| Location stats | `get_location_stats` | LEFT JOIN + COALESCE + bounding box |
| Order creation | `create_multi_vendor_orders` | LEFT JOIN + COALESCE for delivery radius |
| Store coordinates RPC | `set_my_store_coordinates` | Created, writes to `seller_profiles` |
| Society coordinates sync | `set_my_society_coordinates` | Also syncs to `seller_profiles` |
| Seller health | `useSellerHealth.ts` | COALESCE logic, commercial bypass |
| Store location sheet | `SetStoreLocationSheet.tsx` | Renamed, calls new RPC |
| Visibility checklist | `SellerVisibilityChecklist.tsx` | Updated imports |
| Seller detail page | `SellerDetailPage.tsx` | COALESCE coords, commercial bypass on line 105 |
| Delivery tracking | `update-delivery-location/index.ts` | Order delivery coords as primary destination |
| Demand stats RPC | `get_seller_demand_stats` | IF/ELSE branching for commercial sellers |
| Demand log RLS | `search_demand_log` policy | Commercial seller bypass |

All 7 discovery hooks consume `search_sellers_by_location` — fixing the RPC fixed them all:
- `useNearbyProducts`, `useStoreDiscovery`, `useTrendingProducts`, `usePopularProducts`, `useProductsByCategory`, `useSearchPage`, `useLocationStats`

---

## ONE REMAINING GAP

### `useSocialProof` — Society-Scoped Social Proof

**File**: `src/hooks/queries/useSocialProof.ts`
**RPC**: `get_society_order_stats` (migration `20260225110300`)

**Current logic**:
```typescript
// Frontend: requires effectiveSocietyId
if (!effectiveSocietyId || productIds.length === 0) return new Map();
const { data } = await supabase.rpc('get_society_order_stats', {
  _product_ids: productIds,
  _society_id: effectiveSocietyId,
});
```
```sql
-- RPC: filters by buyer's society
WHERE p.society_id = _society_id
```

**Problem**: Social proof badges ("X families ordered this week") only count buyers from the user's registered society. When browsing products from commercial sellers or cross-society sellers, the counts are scoped to a single society, which may show **0** even when the product is popular across multiple nearby societies.

**Impact**: Social proof badges show misleading low numbers for cross-society and commercial seller products. Does NOT break any functionality — badges simply show "0 families" or don't appear.

**Risk**: Low-Medium — misleading data, not a crash.

**Fix required**:
1. **RPC update**: Accept optional lat/lng parameters. When provided, count distinct buyers within a radius instead of filtering by `p.society_id`. When `_society_id` is provided (backward compat), use existing logic.
2. **Frontend update**: Pass `browsingLocation` coordinates instead of `effectiveSocietyId` to the hook, allowing radius-based social proof.

**Updated RPC logic**:
```sql
CREATE OR REPLACE FUNCTION public.get_society_order_stats(
  _product_ids uuid[],
  _society_id uuid DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _radius_km double precision DEFAULT 5
)
-- When _lat/_lng provided: count buyers within radius
-- When _society_id provided: existing society-scoped logic
-- Backward compatible: existing callers pass _society_id only
```

**Updated frontend logic**:
```typescript
// useSocialProof.ts
const { browsingLocation } = useBrowsingLocation();
// Pass coordinates instead of society_id
supabase.rpc('get_society_order_stats', {
  _product_ids: productIds,
  _lat: browsingLocation?.lat,
  _lng: browsingLocation?.lng,
  _radius_km: MARKETPLACE_RADIUS_KM,
});
```

**Consumer**: `MarketplaceSection.tsx` (line 41) — no changes needed, it just uses the hook's return value.

---

## VERIFIED SAFE — No Changes Needed

### Community Modules (75+ files)
All use `effectiveSocietyId` for organizational scoping, NOT for location/discovery:
- Visitor Management, Parcel Management, Bulletin Board, Snag Tickets, Disputes, Maintenance, Construction Progress, Society Admin, Society Reports, Builder Dashboard, Worker Salary, Payment Milestones

### Database Triggers
| Trigger | Risk | Notes |
|---------|------|-------|
| `set_order_society_id` | None | Sets `orders.society_id` from `seller_profiles.society_id` — null is fine |
| `log_order_activity` | Low | Wrapped in EXCEPTION handler — silently warns for null `society_id` |
| `enqueue_order_status_notification` | None | Uses `seller_id` + `buyer_id`, not `society_id` |
| `enqueue_review_notification` | None | Uses `seller_id` |
| `enqueue_dispute_status_notification` | None | Uses `submitted_by` |
| `log_bulletin_activity` | None | Community module, unaffected |

### RLS Policies
All society-scoped RLS policies use `get_user_society_id(auth.uid())` for community features. Discovery RPCs run as `SECURITY DEFINER`, bypassing RLS entirely. No changes needed.

### Seller Onboarding
`useSellerApplication.ts` line 226: `society_id: profile?.society_id || null` — already allows null. No change needed.

### Auth/Signup Flow
`useAuthPage.ts` line 265: Uses society coordinates for GPS proximity check during signup. This is correct — it validates the user's proximity to their selected society during registration, not for marketplace discovery.

### Profile Edit Page
`ProfileEditPage.tsx` lines 95-96: Pre-fills delivery address form with society coordinates as defaults. Correct behavior — no discovery dependency.

### Society-Scoped RPCs (Unaffected)
| RPC | Why safe |
|-----|----------|
| `get_trending_products_by_society` | Society-scoped trending, separate from coordinate-based `useTrendingProducts` |
| `get_society_top_products` | Society admin analytics only |
| `search_marketplace` | Exists in types but unused in frontend (dead code) |
| `get_user_frequent_products` | Scoped by `buyer_id`, not society |

### Map Pins
Product listing cards use `seller_latitude`/`seller_longitude` from `search_sellers_by_location`, which already returns `COALESCE(sp.latitude, s.latitude)`. Safe.

### Push Notifications
All notification triggers fire on order status changes, reviews, disputes — none use society-matching for targeting. Safe.

---

## FINAL RISK MATRIX

| Area | Status | Risk |
|------|--------|------|
| Discovery engine | Fixed | None |
| Product discovery | Fixed | None |
| Category browsing | Fixed | None |
| Search results | Fixed | None |
| Nearby sellers | Fixed | None |
| Trending products | Fixed | None |
| Popular products | Fixed | None |
| Seller storefront | Fixed | None |
| Order creation | Fixed | None |
| Delivery radius | Fixed | None |
| Delivery tracking | Fixed | None |
| Seller health checklist | Fixed | None |
| Seller onboarding | Safe | None |
| Location selection | Safe | None |
| Push notifications | Safe | None |
| Community modules | Unaffected | None |
| Admin dashboards | Unaffected | None |
| RLS policies | Unaffected | None |
| Demand stats | Fixed | None |
| **Social proof badges** | **Needs update** | **Low-Medium** |

---

## IMPLEMENTATION PLAN

### Single remaining fix: `useSocialProof` + `get_society_order_stats`

**Step 1**: Database migration — update `get_society_order_stats` RPC to accept optional `_lat`/`_lng`/`_radius_km` params with backward-compatible fallback to `_society_id`

**Step 2**: Frontend — update `useSocialProof.ts` to use `browsingLocation` coordinates instead of `effectiveSocietyId`

### Rollback Plan
- The migration is additive — all existing columns, RPCs, and logic remain
- `get_society_order_stats` update is backward compatible (new params have defaults)
- Revert = restore the 1 frontend file + optionally restore old RPC

### Confirmation
- No existing functionality is removed or broken
- Society-based sellers continue to work via COALESCE fallback throughout
- Commercial sellers are fully supported in all discovery, ordering, and analytics flows
- The only gap is cosmetic social proof badges showing society-scoped counts instead of radius-scoped counts

