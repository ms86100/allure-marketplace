

# Fix Empty Marketplace Experience for First-Time Users

## Problem
When no sellers/products exist, the home page shows "Meet your neighbors who sell" as a heading with a completely blank area below it. The `ShopByStoreDiscovery` component returns `null` when there are no sellers, but the parent wrapper (heading + container) still renders. Combined with the existing marketplace empty state above, the page feels like a dead end.

## Changes

### 1. Hide "Store Discovery" section when empty (MarketplaceSection.tsx)
Wrap the Store Discovery section (lines 222-230) so the heading doesn't render when there are no sellers. Either:
- Lift the `hasLocal/hasNearby` check into MarketplaceSection by using the same hooks, OR
- Simpler: make `ShopByStoreDiscovery` render the heading internally (so when it returns null, the heading also disappears)

**Approach:** Move the "Meet your neighbors who sell" heading inside `ShopByStoreDiscovery.tsx` so it only renders when there's content. In `MarketplaceSection.tsx`, remove the heading wrapper.

### 2. Enhance the main empty marketplace state (MarketplaceSection.tsx, lines 339-405)
The existing empty state has a shopping bag icon, title, description, and two buttons. Enhance it with:

- **3 value proposition cards** — small illustrated cards explaining: "Home-cooked meals from neighbors", "Trusted local services", "Zero commission for sellers". Each with an icon and one-liner. Staggered fade-in animations.
- **"How it works" mini-steps** — 3 steps: "Sellers list products → You browse & order → Get it from your neighbor". Simple numbered badges with text.
- **Social proof placeholder** — "Join 500+ families already using Sociva" or similar trust signal (use existing marketplace config if available).
- **Visual upgrade** — Replace the static ShoppingBag icon with a more engaging animated composition (e.g., pulsing rings behind the icon, floating mini-icons for food/services/crafts).

### 3. Files to modify

| File | Change |
|------|--------|
| `src/components/home/ShopByStoreDiscovery.tsx` | Add section heading internally, only when content exists |
| `src/components/home/MarketplaceSection.tsx` | Remove the external heading wrapper for Store Discovery; enhance empty state in `ProductListings` |

### Technical Notes
- All changes are UI-only, no database or backend changes
- Uses existing `framer-motion` for animations
- Uses existing Lucide icons (UtensilsCrossed, Wrench, Heart, etc.) for value prop cards
- Reuses `useMarketplaceLabels` for text (add new label keys with fallback defaults)
- No new dependencies needed

