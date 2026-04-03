

# Fix: Empty Marketplace State Is Dead Code

## The Real Bug

The enhanced empty marketplace state (value props, how-it-works, social proof, CTAs) lives inside a `ProductListings` component at line 309 of `MarketplaceSection.tsx` — but **this component is never rendered anywhere**. It's dead code.

The main `MarketplaceSection` render (lines 134-254) directly renders `FeaturedBanners`, `AutoHighlightStrip`, `ParentGroupTabs`, `CategoryImageGrid`, discovery rows, and `ShopByStoreDiscovery` inline. When no products exist, all these render empty/null, producing a blank page.

## Fix

### `MarketplaceSection.tsx`

1. **Add an early empty-state check** in the main component body (after loading completes). When `!loadingLocal && localCategories.length === 0`, render the full empty state experience directly — before any of the other sections.

2. **Move the empty state JSX** from the dead `ProductListings` function into this early return block in the main `MarketplaceSection` component.

3. **Delete the unused `ProductListings` component** (lines 308-537) — it's dead code that will never execute.

```text
MarketplaceSection()
  ├── if loadingLocal → skeleton
  ├── if !loadingLocal && localCategories.length === 0
  │     └── Full empty state (hero, value props, how-it-works, CTAs)
  └── else → FeaturedBanners, Highlights, ParentGroupTabs, 
              CategoryImageGrid, DiscoveryRows, StoreDiscovery
```

### No other file changes needed

The `ShopByStoreDiscovery` heading fix is already done. This is purely restructuring `MarketplaceSection.tsx` so the empty state actually renders.

