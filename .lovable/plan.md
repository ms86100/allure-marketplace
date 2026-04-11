
I inspected the seller detail route, the store discovery flow, the seller RLS policy, and the runtime logs. The regression is concrete and reproducible.

1. What is actually causing “Seller not found”
- The current break is in `src/pages/SellerDetailPage.tsx`.
- That page fetches seller + products together, and the products query still requests `products.discount_percent`.
- The real schema uses `discount_percentage` instead. Your browser logs confirm this exact error:
  `column products.discount_percent does not exist`
- Because both queries are wrapped together and the product query throws, the page falls through with `seller === null`, so the UI incorrectly shows `Seller not found` even when the seller exists.

2. Why this regressed again
- Seller discovery and seller detail are using different backend contracts:
  - discovery uses optimized RPCs (`search_sellers_paginated`, `get_products_for_sellers`)
  - seller detail reads raw tables directly with a hand-written column list
- That means schema changes can break seller detail even while listings still appear correctly on home/search.
- Current `seller_profiles` RLS already allows approved sellers to be read, so this specific regression is not mainly an RLS issue.

3. Bulletproof fix I will implement
- Fix the broken product select in `SellerDetailPage.tsx` to use the real canonical schema fields only.
- Remove stale/unsafe field names from that page’s product query.
- Split the loading states:
  - `seller not found` only when seller lookup truly returns no approved seller
  - `menu failed to load` when products fail
  - never map a product-query failure to a missing seller again
- Keep rendering the seller page if seller data loads, even if products fail; show a safe retry/empty-menu state instead of ejecting users to “Go Home”.
- Unify seller detail loading with a shared canonical backend path:
  - preferably a dedicated public RPC/view like `get_public_seller_store`
  - same approval/visibility rules as marketplace discovery
  - seller metadata + approved products returned from one controlled contract
- Replace ad hoc field lists with shared constants/types for public seller/product payloads so renamed columns cannot silently drift in one page only.

4. Files/backend I will update
- `src/pages/SellerDetailPage.tsx`
  - fix invalid columns
  - separate seller state from product state
  - correct error messaging
- shared query/types area
  - extract canonical public seller/product field contract used across routes
- Supabase migration
  - add a stable public seller-store RPC/view if needed
  - validate approved-seller read policy remains intact
  - no unsafe relaxation of RLS

5. Safety rules for this fix
- No business logic changes to who can view sellers/products.
- No broad public exposure of private data.
- No fallback that hides real errors behind “Seller not found”.
- No change to discovery behavior unless required to align it with the new canonical seller-store contract.

6. Validation I will run after implementation
- Click seller cards from:
  - Home “Meet your neighbors who sell”
  - nearby societies
  - search results
  - product detail sheet “View store”
  - product deep-link flow
- Verify these scenarios:
  - approved seller with products
  - approved seller with zero products
  - non-approved/deleted seller
  - product query failure path
- Confirm:
  - valid sellers always open correctly
  - true missing sellers alone show “Seller not found”
  - product failures show a menu-specific error, not seller-not-found
  - no console errors
  - TypeScript/build passes cleanly

7. Why this will stop the regression class
This exact bug keeps coming back because seller detail is coupled to a fragile, page-local raw select list. I’ll remove that fragility by moving seller detail onto a canonical schema contract and by separating “seller missing” from “products failed”. That prevents renamed product columns or partial backend failures from ever showing the wrong “Seller not found” state again.
