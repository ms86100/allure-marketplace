
Round 3 replan approved scope: keep MyGate-style society gating, remove marketplace over-restriction.

1) Deep issues found (current blockers)
- Product RLS is still society-coupled:
  - `products` SELECT policy allows approved products only when seller is commercial OR seller.society_id = user society.
  - This breaks cross-society marketplace visibility in direct table reads.
- Discovery RPC still society-coupled:
  - `search_sellers_by_location` includes `sp.society_id = user society` gate for society-resident sellers.
  - This conflicts with your rule: radius-based discovery must override society boundary.
- Seller detail is inconsistent:
  - `SellerDetailPage` can allow seller card via coordinate fallback, but product list is fetched from `products` table (RLS can still hide products).
- Cart/reorder flows can silently degrade:
  - `useCart` joins `cart_items -> products`; if product row is hidden by RLS, item disappears.
  - `ReorderLastOrder`, `ReorderButton`, `useProductDetail` similar-products all depend on direct `products` reads.
- “Phase 4 E2E” test is not real E2E:
  - `src/test/marketplace-society-separation-e2e.test.ts` simulates logic with local helper functions; it does not verify real DB policies/RPC behavior.

2) Implementation replan (Round 3)
Phase A — Backend policy/RPC correction (P0)
- Update `products` SELECT RLS to marketplace-open for approved products from approved sellers (no society equality gate).
- Update `search_sellers_by_location` to remove same-society requirement; rely on:
  - approved seller
  - distance/radius
  - seller availability
  - product availability.
- Keep society-feature tables/policies unchanged.

Phase B — Frontend consistency (P0/P1)
- `SellerDetailPage`: use one consistent access rule source (RPC-backed seller visibility + product fetch aligned with new policy).
- `useCart`: prevent silent cart row loss; add explicit handling when product relation is missing.
- Verify marketplace read paths using `products`:
  - `useProductDetail` similar products
  - `ReorderLastOrder`
  - `ReorderButton`
  - buy-again fallback queries.

Phase C — FeatureGate hardening (P1)
- Keep society features strictly gated by `effectiveSocietyId`.
- Keep marketplace features always passable.
- Centralize domain map (`society` vs `marketplace`) and add a guard to prevent future misclassification.

Phase D — Real verification matrix (P0)
- Replace simulated “E2E” with integration validation that exercises actual app queries/RPC + RLS behavior.
- Validate these must-pass journeys:
  1. No-society buyer: discovery → seller detail/menu → cart → coupon → checkout → order visible.
  2. Society buyer cross-society seller: same complete flow.
  3. Commercial seller (no society): coupon create, order receive, status progression, demand insights relevance.
  4. No-society user blocked from society features (gate entry, bulletin, workforce, authorized persons).

3) Technical details (explicit change targets)
- DB migration:
  - `products` SELECT policy rewrite.
  - `search_sellers_by_location` function rewrite.
  - (Optional cleanup) remove deprecated overloaded `get_unmet_demand` signatures to avoid ambiguity.
- Code files likely impacted:
  - `src/pages/SellerDetailPage.tsx`
  - `src/hooks/useCart.tsx`
  - `src/hooks/useProductDetail.ts`
  - `src/components/home/ReorderLastOrder.tsx`
  - `src/components/order/ReorderButton.tsx`
  - `src/hooks/useEffectiveFeatures.ts`
  - `src/test/marketplace-society-separation-e2e.test.ts` (replace with real integration checks).

4) Expected post-fix behavior
- Society layer remains private and fully gated.
- Marketplace is fully operational for:
  - users with society
  - users without society
  - commercial sellers
  - cross-society interactions.
- No buyer/seller marketplace journey fails due to null `effectiveSocietyId`.
