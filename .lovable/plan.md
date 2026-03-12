

# Marketplace Bugs Fix Plan — Buyer & Seller Flows Only

## Scope Clarification

Society-only features (collective buy, gate entry, authorized persons, bulletin, workforce, etc.) are **intentionally restricted** to society members. These are NOT bugs — they work as designed, similar to MyGate. The `FeatureGate` blocking non-society users from these features is **correct behavior**.

This plan focuses **exclusively** on marketplace buying/selling flows that break due to `effectiveSocietyId` being null.

---

## Confirmed Critical Bugs

### Bug 1: Coupons — Seller cannot create if no `profile.society_id`
**File**: `src/components/seller/CouponManager.tsx` line 70
**Code**: `if (!currentSellerId || !profile?.society_id)` blocks creation. Line 81 inserts `society_id: profile.society_id`. The `coupons.society_id` column is **NOT NULL** in the DB.
**Impact**: Commercial sellers without a society cannot create coupons at all. DB insert would fail even if the guard was removed.
**Fix**: DB migration to make `coupons.society_id` nullable. Update code to remove the `profile.society_id` guard. Use seller's own `society_id` from seller_profiles (which may be null for commercial sellers).

### Bug 2: Coupons — Buyer cannot see or apply coupons cross-society
**File**: `src/components/cart/CouponInput.tsx` lines 54, 57, 108, 111
**Code**: Fetches coupons with `.eq('society_id', effectiveSocietyId!)`. Manual code entry also filters by `effectiveSocietyId`.
**Impact**: Buyer from Society A ordering from a seller in Society B never sees that seller's coupons. Buyers without a society see zero coupons.
**Fix**: Remove `society_id` filter from coupon queries — filter by `seller_id` only (coupons are already seller-scoped).

### Bug 3: Seller Recommend button blocks non-society users
**File**: `src/components/trust/SellerRecommendButton.tsx` line 43
**Code**: `if (!user || !effectiveSocietyId)` — line 66 inserts `society_id: effectiveSocietyId`. The `seller_recommendations.society_id` column is **NOT NULL**.
**Impact**: Users without a society cannot recommend any seller. This is a marketplace social feature, not a society management feature.
**Fix**: DB migration to make `seller_recommendations.society_id` nullable. Update code to pass null when no society.

### Bug 4: Search demand logging silently fails for non-society users
**File**: `src/hooks/useSearchPage.ts` line 159
**Code**: `if (term.length >= 3 && effectiveSocietyId)` — skips logging entirely. The `search_demand_log.society_id` column is **NOT NULL**.
**Impact**: Search terms from non-society users are never captured, reducing demand intelligence for sellers.
**Fix**: DB migration to make `search_demand_log.society_id` nullable. Update RLS insert policy. Update code to log with null society_id.

### Bug 5: `ShopByStore` component is dead code with broken realtime subscription
**File**: `src/components/home/ShopByStore.tsx`
**Code**: Entire component uses `effectiveSocietyId` for queries and realtime subscriptions.
**Impact**: Not currently imported (replaced by `ShopByStoreDiscovery`), but the file exists and could be accidentally imported. The realtime subscription filter `society_id=eq.null` would be malformed.
**Fix**: Delete the file — it's fully replaced by `ShopByStoreDiscovery`.

### Bug 6: `SellerDetailPage` may incorrectly block sellers found via coordinates
**File**: `src/pages/SellerDetailPage.tsx` lines 101-110
**Code**: When `effectiveSocietyId` is set and differs from `sellerData.society_id`, non-commercial sellers without `sell_beyond_community` are hidden — even if they were found via coordinate search.
**Impact**: A buyer in Society A discovers a society_resident seller in Society B (within radius) via the coordinate-based homepage, taps the seller, and gets a blank page because the detail page blocks them.
**Fix**: Add a coordinate-distance check as fallback. If the seller is within the buyer's browsing radius, allow access regardless of society membership.

### Bug 7: `DemandInsights` hidden for commercial sellers
**File**: `src/pages/SellerDashboardPage.tsx` line 329
**Code**: `{sellerProfile.society_id && <DemandInsights societyId={sellerProfile.society_id} />}`
**Impact**: Commercial sellers (no society_id) never see demand insights, even though the `get_seller_demand_stats` RPC was already updated to handle null society.
**Fix**: Always show `DemandInsights`, passing seller_id as primary key. The RPC already handles the null-society fallback.

### Bug 8: Order `society_id` is null for commercial sellers — `log_order_activity` trigger may insert orphan records
**File**: DB function `log_order_activity`
**Code**: Inserts into `society_activity` with `NEW.society_id` which could be null.
**Impact**: The `society_activity.society_id` column is likely NOT NULL, causing the trigger to fail silently (it catches exceptions). This means order activity is never logged for commercial seller orders.
**Fix**: Add a null guard in the trigger — skip the insert if `society_id` is null.

---

## Implementation Plan

### Phase 1 — DB Migrations (1 migration file)

1. Make `coupons.society_id` nullable + drop/recreate unique constraint to `(seller_id, code)` instead of `(society_id, code)`
2. Make `seller_recommendations.society_id` nullable
3. Make `search_demand_log.society_id` nullable + update RLS insert policy to allow null
4. Update `log_order_activity` trigger to skip when `society_id` is null

### Phase 2 — Code Fixes (6 files)

1. **`CouponManager.tsx`** — Remove `profile.society_id` guard, use seller profile's society_id (nullable)
2. **`CouponInput.tsx`** — Remove `society_id` filter, query by `seller_id` only
3. **`SellerRecommendButton.tsx`** — Remove `effectiveSocietyId` guard, pass nullable society_id
4. **`useSearchPage.ts`** — Remove `effectiveSocietyId` guard from demand logging, insert with nullable society_id
5. **`SellerDetailPage.tsx`** — Add coordinate-based fallback to the society scoping check
6. **`SellerDashboardPage.tsx`** — Show DemandInsights for all sellers

### Phase 3 — Cleanup (1 file)

7. **Delete `ShopByStore.tsx`** — fully replaced by `ShopByStoreDiscovery`

### Files to modify
- 1 new migration SQL file
- `src/components/seller/CouponManager.tsx`
- `src/components/cart/CouponInput.tsx`
- `src/components/trust/SellerRecommendButton.tsx`
- `src/hooks/useSearchPage.ts`
- `src/pages/SellerDetailPage.tsx`
- `src/pages/SellerDashboardPage.tsx`
- Delete `src/components/home/ShopByStore.tsx`

