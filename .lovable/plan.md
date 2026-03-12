

## Round 3 Deep Audit: Current State Assessment

### DB Policies — Verified Live State (All Marketplace Tables Are Clean)

| Table | Policy | Status |
|---|---|---|
| `products` SELECT | Approved products from approved sellers, marketplace-open | FIXED |
| `coupons` SELECT | Active coupons visible to any authenticated user | FIXED |
| `cart_items` | User-scoped only (`user_id = auth.uid()`) | CLEAN |
| `orders` | Buyer/seller scoped, no society gate | CLEAN |
| `seller_recommendations` SELECT | `true` — open to all authenticated | CLEAN |
| `search_demand_log` INSERT | `auth.uid() IS NOT NULL` — no society gate | FIXED |
| `search_demand_log` SELECT (sellers) | Commercial seller support included | FIXED |

### Discovery RPC — Functionally Correct But Has Dead Code

The `search_sellers_by_location` RPC has a community gating block (the AND clause with `sp.seller_type = 'commercial' OR sp.sell_beyond_community...`) that is logically redundant. The last OR branch duplicates the haversine check that already passed in the WHERE clause above it. Every seller that reaches this point has already passed the radius filter, so this block always evaluates to TRUE. It adds unnecessary query overhead (a subquery to `profiles` table on every row) without filtering anything.

### Remaining Issues to Fix

**Issue 1 — RPC `search_sellers_by_location`: Redundant society subquery (performance)**
The community gating AND block includes `sp.society_id = (SELECT p2.society_id FROM profiles p2 WHERE p2.id = auth.uid())` — an unnecessary per-row subquery. Since the haversine check already guarantees within-radius, this entire block should be removed. It's a no-op filter but wastes DB resources.

**Issue 2 — `delivery_management` misclassified as marketplace feature**
`delivery_management` was added to `MARKETPLACE_FEATURES` in Round 2. But `DeliveryPartnerManagementPage` and `DeliveryPartnerDashboardPage` are society-scoped (query `delivery_partner_pool` by `effectiveSocietyId`). The FeatureGate passes (always enabled) but the pages show empty/broken content for non-society users. `delivery_management` should be a society feature, not marketplace. Order delivery (buyer tracking their delivery) works without society — that's separate from delivery partner pool management.

**Issue 3 — `SocietyDeliveriesPage` wrapped in `delivery_management` FeatureGate**
Same issue — this is society admin delivery monitoring, correctly requires `effectiveSocietyId`, but FeatureGate won't block it since `delivery_management` is now in MARKETPLACE_FEATURES.

**Issue 4 — E2E test file uses simulated logic, not real queries**
The test file `src/test/marketplace-society-separation-e2e.test.ts` validates pure logic (helper functions) rather than actual DB/RPC behavior. This was flagged in Round 3 planning but the replacement was still simulation-based.

### Implementation Plan

**Phase 1 — Clean up RPC (DB migration)**
Rewrite `search_sellers_by_location` to remove the redundant community gating AND block entirely. All sellers within radius should be visible. The haversine + bounding box filters are sufficient.

**Phase 2 — Fix `delivery_management` classification**
Remove `delivery_management` from `MARKETPLACE_FEATURES` in `useEffectiveFeatures.ts`. Delivery partner management is a society feature. Marketplace order delivery tracking (buyer-side) does not use this FeatureGate.

**Phase 3 — Update E2E tests**
Update `src/test/marketplace-society-separation-e2e.test.ts` to reflect the corrected `delivery_management` classification and the simplified RPC logic.

### What Does NOT Need Changing (confirmed working)
- Products RLS: marketplace-open
- Coupons RLS: marketplace-open
- Cart: user-scoped, no society dependency
- Orders: buyer/seller scoped
- Seller recommendations: open
- Search demand logging: works for non-society users
- `useStoreDiscovery`: no society gates
- `SellerDetailPage`: no society blocking (effectiveSocietyId only used for distance fallback)
- `useProductDetail`: similar products marketplace-open
- `ReorderLastOrder`: buyer-scoped, no society dependency
- `useCart`: null-safe product handling
- All society-management features (gate entry, bulletin, workforce, etc.): correctly gated

