
## Round 2 Replan: Strict Society Gating + Unbroken Open Marketplace

### What I re-validated (current state)
Your principle is correct: **society layer stays gated**, **marketplace must never depend on `effectiveSocietyId`**.
After reviewing current code/migrations, the biggest remaining breakages are now mostly **policy + discovery scoping mismatches**, not just UI checks.

## Critical remaining issues (marketplace-impacting)

1. **Coupons still blocked by DB policy (even after UI fix)**
- File: `supabase/migrations/20260213112925_...sql`
- Current policy: `"Users can view active coupons in their society"` (`society_id = get_user_society_id(auth.uid())`)
- Impact: cross-society and no-society buyers still can’t fetch coupons.

2. **Search demand logging still blocked by old INSERT RLS**
- Same migration file still has: `WITH CHECK (society_id = get_user_society_id(auth.uid()))`
- Code now inserts nullable society (`useSearchPage.ts`), but policy likely rejects null.
- Impact: silent analytics loss for non-society buyers.

3. **DemandInsights for commercial sellers returns global demand**
- `DemandInsights.tsx` calls `get_unmet_demand(_society_id: null)`; DB function returns all rows when null.
- Impact: irrelevant/global leakage instead of seller-scoped insight.

4. **Store discovery still gated by `isApproved`**
- `useStoreDiscovery.ts` (`useLocalSellers`, `useNearbySocietySellers`) has `enabled: !!isApproved && ...`
- Impact: marketplace sections can disappear for users who should still browse/buy.

5. **Top sellers in category bypass coordinate/sell_beyond rules**
- `CategoryGroupPage.tsx` `topSellers` uses direct `seller_profiles` query, not location RPC.
- Impact: users see sellers they can’t validly transact with; detail page mismatch.

6. **FeatureGate architecture still globally couples to society**
- `useEffectiveFeatures.ts` returns false when `!effectiveSocietyId`.
- This is fine for society features, but risky for any marketplace feature accidentally using FeatureGate now/future.

7. **Search logging swallows errors**
- `useSearchPage.ts` `.then(() => {})` without error path.
- Impact: hidden failures, hard to detect regressions.

---

## Design approach (no change to society restrictions)
- Keep `FeatureGate` behavior for **society management features** exactly as-is.
- Introduce explicit **domain separation**:
  - `society` features: require `effectiveSocietyId`
  - `marketplace` features: never blocked by null society
- Enforce this separation in both **frontend checks** and **DB policies**.

---

## Implementation plan

### Phase 1 — DB policy correctness (highest priority)
1. Replace coupon buyer SELECT policy from society-scoped to marketplace-safe:
   - Buyer can read active, valid coupons for seller they are transacting with (seller-scoped access).
2. Replace `search_demand_log` INSERT policy:
   - Allow authenticated insert with `society_id IS NULL OR society_id = get_user_society_id(auth.uid())`.
3. Add seller-scoped unmet demand RPC (or extend existing):
   - For sellers without society, return demand relevant to seller activity (not global all-data).
4. Audit `seller_recommendations` policies for hidden society checks; patch if present.

### Phase 2 — Frontend scoping fixes
5. `useStoreDiscovery.ts`: remove `isApproved` hard gate from marketplace discovery queries.
6. `CategoryGroupPage.tsx`: rebuild `topSellers` from coordinate-based discovery (same source as listing/search), not raw `seller_profiles`.
7. `useSearchPage.ts`: add explicit error handling for demand-log insert (no silent drop).

### Phase 3 — FeatureGate hardening (safe future-proofing)
8. Add feature-domain mapping in `useEffectiveFeatures` (or wrapper hook):
   - Society domain keeps current gating.
   - Marketplace domain never hard-fails when `effectiveSocietyId` is null.
9. Keep existing society pages untouched (MyGate-like restriction preserved).

### Phase 4 — E2E verification matrix (must pass)
10. Validate end-to-end:
- Buyer without society: discovery → seller detail → add cart → coupon apply → checkout → order visible.
- Buyer in society purchasing cross-society seller: same full flow.
- Commercial seller (no society): create coupon, receive order, status transitions, demand insights relevant.
- Society features (gate entry, bulletin, workforce, authorized persons): still blocked for no-society users.

---

## Priority order
- **P0**: Phase 1 + seller demand correctness + checkout/coupon path.
- **P1**: Discovery/top-seller alignment and logging observability.
- **P2**: FeatureGate domain hardening to prevent future regressions.
