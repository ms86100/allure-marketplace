

# Refined Color Palette & Blinkit-Style Product Layout Plan

## Current Issues
1. The warm brown-black palette (`hsl(20 12% 6%)`) looks muddy on desktop — the reference Blinkit screenshot uses a **richer, deeper brown-black** with more contrast between zones
2. Product listings use horizontal scroll cards (`ProductListingCard`) — the reference shows **category-grouped grids with product images and labels beneath**, like Blinkit's "Pooja Needs", "Prasadam Essentials" grouping
3. The current layout has discovery rows, product listing cards, and store discovery all mixed — the reference is cleaner with clear category-based sections

## Part 1: Color Palette Refinement

Shift from the current warm-brown to a **richer, deeper palette** matching the reference more precisely:

| Variable | Current | New | Reason |
|----------|---------|-----|--------|
| `--background` | `20 12% 6%` | `15 14% 5%` | Deeper, slightly warmer |
| `--card` | `20 10% 12%` | `18 12% 11%` | Richer card surfaces |
| `--secondary` | `20 8% 14%` | `18 10% 15%` | More contrast for interactive |
| `--muted` | `20 8% 13%` | `18 8% 14%` | Subtle shift |
| `--border` | `20 8% 17%` | `18 8% 18%` | Slightly more visible |
| `--popover` | `20 10% 8%` | `15 12% 7%` | Deeper popover |

Header search bar: increase opacity to `dark:bg-[hsl(28_22%_15%/0.6)]` with `dark:border-[hsl(28_28%_28%/0.45)]` for a richer amber glass effect.

**Files**: `src/index.css`, `src/components/layout/Header.tsx`

## Part 2: Product Display Restructure

The reference screenshot shows products grouped by themed category sections (like "Pooja Needs", "Prasadam Essentials"), where each section is a **card with a title at top and product images arranged inside**. This matches our existing `CategoryImageGrid` pattern but applied to product listings.

### Change: Replace horizontal product card scrolls with category-grouped image grids

Currently `ProductListings` in `MarketplaceSection.tsx` renders each category as a horizontal scroll of `ProductListingCard` components. Instead:

1. **New layout**: Each category section shows a **themed card** with:
   - Category name as title (bold, white)
   - 2-3 product images arranged in a compact grid inside the card
   - Card background tinted with the category's color
   - Tapping the card navigates to the category page

2. **Grid arrangement**: Categories displayed as 3-column grid of themed cards (matching the Blinkit "Pooja Needs / Prasadam Essentials / Ugadi Specials" layout)

3. **Keep existing data flow**: `useProductsByCategory` already groups products by category with images — just change the rendering from horizontal card scroll to themed category cards

### Implementation in `MarketplaceSection.tsx`:
- Replace the `ProductListings` component with a new `CategoryProductGrid` that renders category cards in a 3-column grid
- Each card: rounded corners, category-tinted background, category display name as title, top 2-4 product images arranged inside
- No dummy data — uses existing `filteredCategories` data with real product images
- Tapping a card navigates to `/category/{parentGroup}?sub={category}`

### Keep unchanged:
- `ProductDetailSheet` — still opens on product tap
- `DiscoveryRow` — still shows popular/new items as horizontal scroll
- `BuyAgainRow` — already matches reference style
- `CategoryImageGrid` — parent group navigation tiles stay
- `FeaturedBanners` / `AutoHighlightStrip` — hero section stays

## Part 3: Seller 7838459422 Product Mapping

The seller with phone `7838459422` (seller_id from the DB) needs their products properly categorized. Since we cannot hardcode, this will rely on the existing category assignment in the `products` table. If products are already assigned to categories, they will automatically appear in the correct grid sections. No code changes needed — this is a data concern handled by the existing `useProductsByCategory` hook.

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Refine dark palette values for deeper contrast |
| `src/components/layout/Header.tsx` | Richer search bar glass effect |
| `src/components/home/MarketplaceSection.tsx` | Replace `ProductListings` with `CategoryProductGrid` — 3-column themed category cards showing product images inside |

## Constraints
- No hardcoded data or dummy content
- All product data comes from `useProductsByCategory` hook
- No new DB tables or migrations
- Light mode unchanged
- Existing functionality (cart, detail sheet, navigation) preserved

