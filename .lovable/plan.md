

## Goal
Replace the flat product-tile layout in "Popular near you" and "New this week" with the grouped seller-card layout (like the "Food & Beverages – Dabbas" card in screenshot 1), so multiple items appear inside a single seller card.

## Current vs Target

**Current (`DiscoveryRow` in MarketplaceSection.tsx):**
- Flat horizontal scroll of individual `ProductListingCard` tiles (one product per card)
- No seller grouping → "Chole Bhature" and "Egg Curry" from "Dabbas" appear as separate cards

**Target:** Same horizontal scroll, but each card = one seller showing:
- Seller cover/hero image with category tag chip on top (e.g., "Food Beverages")
- Seller name + sub-line
- 2 product mini tiles inside the card
- "From ₹X" starting price
- Identical to existing `RichSellerCard` in `ShopByStoreDiscovery.tsx`

## Approach

### 1. Create a shared `GroupedSellerRow` component
New file: `src/components/home/GroupedSellerRow.tsx`
- Takes a list of products (with `seller_id`, `seller_name`, etc. — already on `ProductWithSeller`)
- Groups them by `seller_id` → builds `{ sellerId, sellerName, coverImage, profileImage, categories, primaryGroup, topProducts[], minPrice, totalReviews, isFeatured }`
- Renders horizontal-scroll row of `RichSellerCard`-style cards
- Reuses the visual styling already proven in `ShopByStoreDiscovery` (extract `RichSellerCard` + `ProductMini` into the shared component, or import from a new `src/components/home/RichSellerCard.tsx`)

### 2. Refactor `RichSellerCard` to a shared file
Move `RichSellerCard` + `ProductMini` from `ShopByStoreDiscovery.tsx` → `src/components/home/RichSellerCard.tsx`. Update `ShopByStoreDiscovery.tsx` to import it. No behavior change.

### 3. Replace `DiscoveryRow` usages in `MarketplaceSection.tsx`
- "Popular near you" → `<GroupedSellerRow title="Popular near you – {location}" products={popularNearYou} />`
- "New this week" → `<GroupedSellerRow title="New this week" products={newThisWeek} />`
- Keep title row (with icon + "See all") identical to current `DiscoveryRow`
- Pass through onProductTap so tapping a mini product still opens the `ProductDetailSheet`
- Keep old `DiscoveryRow` available for fallback OR delete if no other consumer (it isn't used elsewhere — safe to remove)

### 4. Group label chip on each card
Per screenshot 1, each card has a small category pill ABOVE it (e.g., "Education Learning", "Food Beverages"). Add an optional `groupLabel` prop to `RichSellerCard` (or render a chip above each card in the row) sourced from the seller's `primary_group` / category config `displayName`. This makes the grouping intent visually obvious like the reference.

### 5. Mobile responsiveness
- Card width: `w-[160px]` on mobile (matches existing compact size), `w-[170px]` on `sm:`
- Horizontal scroll-snap, scrollbar-hide (already pattern in codebase)
- 2 product mini-tiles inside each card = same as screenshot
- Min 2 cards visible on 360px viewport

## Files Changed

| File | Change |
|---|---|
| `src/components/home/RichSellerCard.tsx` | NEW — extracted shared seller card with optional group-label chip |
| `src/components/home/GroupedSellerRow.tsx` | NEW — groups flat product list by seller, renders row of RichSellerCards |
| `src/components/home/ShopByStoreDiscovery.tsx` | Import `RichSellerCard` from new file, drop local copy |
| `src/components/home/MarketplaceSection.tsx` | Replace 2× `<DiscoveryRow>` with `<GroupedSellerRow>`; remove unused `DiscoveryRow` |

## Behavior Preserved
- Product tap → `ProductDetailSheet` (same handler)
- Seller tap → `/seller/:id` (same as `RichSellerCard`)
- "See all" link → `/category/:parentGroup`
- Social proof, badges, distance/society — all available via `ProductWithSeller` and existing data

## Out of Scope
- No DB / RPC changes — all data already on `ProductWithSeller`
- "For You", "Recently Viewed", "Buy Again" sections keep their current designs (different intent — personalized single-product surfaces, not category-grouped discovery)
- `WhatsNewSection` keeps its layout (different purpose)

